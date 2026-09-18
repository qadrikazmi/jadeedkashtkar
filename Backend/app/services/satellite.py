from pystac_client import Client
from shapely.geometry import shape, mapping
import planetary_computer
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Any
from dateutil import parser as date_parser
import requests
import rasterio
from rasterio.io import MemoryFile
from rasterio.mask import mask
from rasterio.warp import transform_geom, transform_bounds
from rasterio.transform import array_bounds
import warnings

from app.services.visualization import build_overlay_image

warnings.filterwarnings("ignore")

# Since ESA's Sentinel-2 Processing Baseline 04.00 (effective Jan 25, 2022),
# every band's raw digital number has a fixed offset of -1000 baked in before
# publishing. If you don't subtract it back out, index ratios like NDVI come
# out artificially low (sometimes near-zero or negative) even over healthy
# vegetation, because this is an ADDITIVE offset — it does not cancel out of
# a ratio the way a pure multiplicative scale factor would.
BOA_OFFSET_BASELINE_THRESHOLD = 4.0
BOA_ADD_OFFSET = -1000


def _needs_offset_correction(item) -> bool:
    baseline = item.properties.get("s2:processing_baseline")
    if not baseline:
        return False
    try:
        return float(baseline) >= BOA_OFFSET_BASELINE_THRESHOLD
    except (TypeError, ValueError):
        return False


def _apply_offset_correction(band_array: np.ndarray) -> np.ndarray:
    corrected = band_array + BOA_ADD_OFFSET
    return np.clip(corrected, 0, None)  # reflectance can't go negative


def search_and_calculate(polygon: Dict[str, Any], date_str: str, index: str, max_cloud: int):
    try:
        geometry = polygon.get(
            "geometry") if "geometry" in polygon else polygon
        geom = shape(geometry)

        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        start_date = (target_date - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = (target_date + timedelta(days=30)).strftime("%Y-%m-%d")

        catalog = Client.open(
            "https://planetarycomputer.microsoft.com/api/stac/v1",
            modifier=planetary_computer.sign_inplace
        )

        search = catalog.search(
            collections=["sentinel-2-l2a"],
            intersects=mapping(geom),
            datetime=f"{start_date}/{end_date}",
            query={"eo:cloud_cover": {"lt": max_cloud}},
            max_items=15
        )

        items = list(search.items())

        if not items:
            return {
                "status": "error",
                "message": f"No Sentinel-2 images found with cloud cover < {max_cloud}%",
                "stats": None
            }

        def get_date(item):
            try:
                return date_parser.parse(item.datetime)
            except:
                return datetime(2000, 1, 1)

        items = sorted(items, key=lambda x: abs(
            (get_date(x) - target_date).total_seconds()))
        best_item = items[0]

        print(
            f"Selected scene: {best_item.id} | Cloud: {best_item.properties.get('eo:cloud_cover')}%")

        apply_offset = _needs_offset_correction(best_item)
        print(
            f"Processing baseline: {best_item.properties.get('s2:processing_baseline')} | Applying BOA offset correction: {apply_offset}")

        signed_item = planetary_computer.sign(best_item)

        band_urls = {}
        required_bands = {
            "NDVI": ["B04", "B08"],
            "NDWI": ["B03", "B08"],
            "EVI":  ["B02", "B04", "B08"],
            "SAVI": ["B04", "B08"],
            "NDMI": ["B08", "B11"],
            "NBR":  ["B08", "B12"],
        }

        needed = required_bands.get(index, ["B04", "B08"])

        for band in needed:
            asset = signed_item.assets.get(band)
            if asset is None:
                return {"status": "error", "message": f"Band {band} not available", "stats": None}
            band_urls[band] = asset.href

        # Read and clip each band
        arrays = {}
        out_transform = None
        raster_crs = None

        for band, url in band_urls.items():
            with rasterio.open(url) as src:
                geom_in_raster_crs = transform_geom(
                    "EPSG:4326", src.crs, mapping(geom))

                out_image, out_transform = mask(
                    src,
                    [geom_in_raster_crs],
                    crop=True,
                    nodata=0
                )
                band_array = out_image[0].astype("float32")

                if apply_offset:
                    band_array = _apply_offset_correction(band_array)

                arrays[band] = band_array
                raster_crs = src.crs

        # NOTE: NDMI (B08+B11) and NBR (B08+B12) mix a 10m band with a 20m
        # band, so their arrays can come out at different pixel dimensions.
        # Not an issue for NDVI/EVI/SAVI/NDWI (all same-resolution bands),
        # but worth resampling B11/B12 to match B08 if you add those indices
        # to the working set later.

        if index == "NDVI":
            result = (arrays["B08"] - arrays["B04"]) / \
                (arrays["B08"] + arrays["B04"] + 1e-6)
        elif index == "NDWI":
            result = (arrays["B03"] - arrays["B08"]) / \
                (arrays["B03"] + arrays["B08"] + 1e-6)
        elif index == "EVI":
            result = 2.5 * (arrays["B08"] - arrays["B04"]) / \
                (arrays["B08"] + 6*arrays["B04"] -
                 7.5*arrays["B02"] + 1 + 1e-6)
        elif index == "SAVI":
            result = ((arrays["B08"] - arrays["B04"]) /
                      (arrays["B08"] + arrays["B04"] + 0.5 + 1e-6)) * 1.5
        elif index == "NDMI":
            result = (arrays["B08"] - arrays["B11"]) / \
                (arrays["B08"] + arrays["B11"] + 1e-6)
        elif index == "NBR":
            result = (arrays["B08"] - arrays["B12"]) / \
                (arrays["B08"] + arrays["B12"] + 1e-6)
        else:
            return {"status": "error", "message": f"Index {index} not supported", "stats": None}

        values = result.flatten()
        finite_values = values[np.isfinite(values)]
        finite_values = finite_values[(
            finite_values >= -1.5) & (finite_values <= 1.5)]

        if len(finite_values) < 10:
            return {"status": "error", "message": "Not enough valid pixels in the selected polygon", "stats": None}

        # --- Build the visual overlay ---
        reference_band = arrays[needed[0]]
        nodata_mask = (reference_band == 0)
        overlay_image_base64 = build_overlay_image(result, nodata_mask)

        # --- Compute the overlay's geographic bounds (WGS84) for map placement ---
        clipped_bounds = array_bounds(
            out_image.shape[1], out_image.shape[2], out_transform)
        west, south, east, north = transform_bounds(
            raster_crs, "EPSG:4326", *clipped_bounds)

        stats = {
            "mean": round(float(np.mean(finite_values)), 4),
            "min": round(float(np.min(finite_values)), 4),
            "max": round(float(np.max(finite_values)), 4),
            "std": round(float(np.std(finite_values)), 4),
            "cloud_cover": best_item.properties.get("eo:cloud_cover"),
            "image_date": str(best_item.datetime),
            "scene_id": best_item.id,
            "offset_corrected": apply_offset
        }

        print("Calculation successful:", stats)

        return {
            "status": "success",
            "message": f"{index} calculated successfully",
            "stats": stats,
            "overlay_image": overlay_image_base64,
            "bounds": {
                "west": west,
                "south": south,
                "east": east,
                "north": north
            }
        }

    except Exception as e:
        print("ERROR:", str(e))
        return {
            "status": "error",
            "message": f"Processing failed: {str(e)}",
            "stats": None
        }
