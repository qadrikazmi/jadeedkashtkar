"""
NDVI / multi-index pipeline — Microsoft Planetary Computer (STAC).
Visible indices: NDVI, NDMI, NDRE, EVI, SAVI, ExG, VARI, GLI

Hidden for now (calculations kept as comments so they can be re-enabled later):
NBR2, NDWI, CCI (CIre)
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Iterator

import numpy as np
import planetary_computer
import stackstac
from shapely.geometry import Polygon, mapping

from app.core.config import settings
from app.exceptions.custom_exceptions import (
    InvalidDateRangeError,
    NoSatelliteImageFoundError,
    SatelliteDataError,
)
from app.schemas.ndvi import NdviAnalyzeResponse, NdviSourceInfo, NdviStats, NdviVisualization
from app.services.satellite.stac_client import ensure_catalog
from app.services.satellite.visualization import render_ndvi_png

logger = logging.getLogger("app")

# ------------------------------------------------------------------
# Palettes & display ranges
# ------------------------------------------------------------------
NDVI_PALETTE = ["8B4513", "D2B48C", "F0E68C", "9ACD32", "228B22", "006400"]
NDVI_MIN_DISPLAY = -0.2
NDVI_MAX_DISPLAY = 0.9

NDMI_PALETTE = ["FEC44F", "FEE391", "9ECAE1", "4292C6", "08519C"]
NDMI_MIN_DISPLAY = -0.5
NDMI_MAX_DISPLAY = 0.5

NDRE_PALETTE = ["D73027", "FC8D59", "FEE08B", "91CF60", "1A9850"]
NDRE_MIN_DISPLAY = -0.1
NDRE_MAX_DISPLAY = 0.6

# Still defined so drone_index_service can import them (even if we no longer use them)
NBR2_PALETTE = ["5C4033", "A97C50", "D2B48C", "E8DAB2", "F2EAD3"]
NBR2_MIN_DISPLAY = -0.1
NBR2_MAX_DISPLAY = 0.6

NDWI_PALETTE = ["B8860B", "D2B48C", "C7EAE5", "67A9CF", "2166AC"]
NDWI_MIN_DISPLAY = -0.3
NDWI_MAX_DISPLAY = 0.6

CCI_PALETTE = ["A6611A", "DFC27D", "F5F5C8", "9DBF3F", "1A7A1A"]
CCI_MIN_DISPLAY = 0.0
CCI_MAX_DISPLAY = 3.0

EVI_PALETTE = ["FFFFCC", "C2E699", "78C679", "31A354", "006837"]
EVI_MIN_DISPLAY = 0.0
EVI_MAX_DISPLAY = 0.8

SAVI_PALETTE = ["8C510A", "D8B365", "F6E8C3", "5AB4AC", "01665E"]
SAVI_MIN_DISPLAY = -0.2
SAVI_MAX_DISPLAY = 0.8

# RGB-only indices
EXG_PALETTE = ["8B4513", "D2B48C", "F0E68C", "9ACD32", "228B22", "006400"]
EXG_MIN_DISPLAY = -0.5
EXG_MAX_DISPLAY = 0.5

VARI_PALETTE = ["8B4513", "D2B48C", "F0E68C", "9ACD32", "228B22", "006400"]
VARI_MIN_DISPLAY = -1.0
VARI_MAX_DISPLAY = 1.0

GLI_PALETTE = ["8B4513", "D2B48C", "F0E68C", "9ACD32", "228B22", "006400"]
GLI_MIN_DISPLAY = -1.0
GLI_MAX_DISPLAY = 1.0

REFLECTANCE_SCALE = 10000.0
COMPOSITE_BANDS = ["B02", "B03", "B04",
                   "B05", "B08", "B8A", "B11", "B12", "SCL"]
CLOUD_SCL_CLASSES = {3, 8, 9, 10}

MIN_SEARCH_WINDOW_DAYS = 3
MAX_SEARCH_WINDOW_DAYS = 365
_TILE_WINDOW_DAYS = 7

SEARCH_MAX_CLOUD_COVER = 100

NDVI_IMAGES_DIR = os.path.join("static", "ndvi_images")


def _collection() -> str:
    return getattr(settings, "SENTINEL2_COLLECTION", "sentinel-2-l2a")


def _default_window_days() -> int:
    return int(getattr(settings, "NDVI_SEARCH_WINDOW_DAYS", 30))


def _app_base_url() -> str:
    return getattr(settings, "APP_BASE_URL", "http://localhost:8000").rstrip("/")


def validate_search_window(start_date: date | None, end_date: date | None) -> None:
    if start_date is None and end_date is None:
        return
    if start_date is None or end_date is None:
        raise InvalidDateRangeError(
            "Both start_date and end_date must be provided together")
    if end_date <= start_date:
        raise InvalidDateRangeError("end_date must be after start_date")
    if end_date > datetime.now(timezone.utc).date() + timedelta(days=1):
        raise InvalidDateRangeError("end_date cannot be in the future")

    window_days = (end_date - start_date).days
    if window_days < MIN_SEARCH_WINDOW_DAYS:
        raise InvalidDateRangeError(
            f"Date range ({window_days} days) is shorter than the minimum of {MIN_SEARCH_WINDOW_DAYS} days"
        )
    if window_days > MAX_SEARCH_WINDOW_DAYS:
        raise InvalidDateRangeError(
            f"Date range ({window_days} days) exceeds the maximum of {MAX_SEARCH_WINDOW_DAYS} days"
        )


def compute_weekly_tiles(start_date: date, end_date: date) -> list[tuple[date, date]]:
    if (end_date - start_date).days <= 0:
        return []

    tiles: list[tuple[date, date]] = []
    cursor_end = end_date

    while True:
        candidate_start = cursor_end - timedelta(days=_TILE_WINDOW_DAYS)
        tile_start = start_date if candidate_start < start_date else candidate_start
        window_days = (cursor_end - tile_start).days

        if window_days < MIN_SEARCH_WINDOW_DAYS and tiles:
            tiles[-1] = (tile_start, tiles[-1][1])
            break

        tiles.append((tile_start, cursor_end))
        if tile_start == start_date:
            break
        cursor_end = tile_start - timedelta(days=1)

    return tiles


def _nd(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return (a - b) / (a + b)


def _evi(b: dict[str, np.ndarray]) -> np.ndarray:
    nir = b["B08"] / REFLECTANCE_SCALE
    red = b["B04"] / REFLECTANCE_SCALE
    blue = b["B02"] / REFLECTANCE_SCALE
    with np.errstate(divide="ignore", invalid="ignore"):
        return 2.5 * (nir - red) / (nir + 6.0 * red - 7.5 * blue + 1.0)


def _savi(b: dict[str, np.ndarray]) -> np.ndarray:
    nir = b["B08"] / REFLECTANCE_SCALE
    red = b["B04"] / REFLECTANCE_SCALE
    with np.errstate(divide="ignore", invalid="ignore"):
        return 1.5 * (nir - red) / (nir + red + 0.5)


# --- Hidden for now ---
# def _cire(b: dict[str, np.ndarray]) -> np.ndarray:
#     with np.errstate(divide="ignore", invalid="ignore"):
#         return (b["B08"] / b["B05"]) - 1.0


# RGB-only indices (work on both satellite and drone)
def _exg(b: dict[str, np.ndarray]) -> np.ndarray:
    r = b["B04"] / REFLECTANCE_SCALE
    g = b["B03"] / REFLECTANCE_SCALE
    blue = b["B02"] / REFLECTANCE_SCALE
    return 2.0 * g - r - blue


def _vari(b: dict[str, np.ndarray]) -> np.ndarray:
    r = b["B04"] / REFLECTANCE_SCALE
    g = b["B03"] / REFLECTANCE_SCALE
    blue = b["B02"] / REFLECTANCE_SCALE
    with np.errstate(divide="ignore", invalid="ignore"):
        return (g - r) / (g + r - blue)


def _gli(b: dict[str, np.ndarray]) -> np.ndarray:
    r = b["B04"] / REFLECTANCE_SCALE
    g = b["B03"] / REFLECTANCE_SCALE
    blue = b["B02"] / REFLECTANCE_SCALE
    with np.errstate(divide="ignore", invalid="ignore"):
        return (2.0 * g - r - blue) / (2.0 * g + r + blue)


@dataclass(frozen=True)
class IndexSpec:
    key: str
    palette: list[str]
    vmin: float
    vmax: float
    compute: Callable[[dict[str, np.ndarray]], np.ndarray]


# Active indices (exactly the 8 we show in the UI)
INDEX_SPECS: list[IndexSpec] = [
    IndexSpec("ndvi", NDVI_PALETTE, NDVI_MIN_DISPLAY, NDVI_MAX_DISPLAY,
              lambda b: _nd(b["B08"], b["B04"])),
    IndexSpec("ndmi", NDMI_PALETTE, NDMI_MIN_DISPLAY, NDMI_MAX_DISPLAY,
              lambda b: _nd(b["B08"], b["B11"])),
    IndexSpec("ndre", NDRE_PALETTE, NDRE_MIN_DISPLAY, NDRE_MAX_DISPLAY,
              lambda b: _nd(b["B8A"], b["B05"])),
    IndexSpec("evi",  EVI_PALETTE,  EVI_MIN_DISPLAY,  EVI_MAX_DISPLAY,  _evi),
    IndexSpec("savi", SAVI_PALETTE, SAVI_MIN_DISPLAY, SAVI_MAX_DISPLAY, _savi),
    IndexSpec("exg",  EXG_PALETTE,  EXG_MIN_DISPLAY,  EXG_MAX_DISPLAY,  _exg),
    IndexSpec("vari", VARI_PALETTE, VARI_MIN_DISPLAY, VARI_MAX_DISPLAY, _vari),
    IndexSpec("gli",  GLI_PALETTE,  GLI_MIN_DISPLAY,  GLI_MAX_DISPLAY,  _gli),
]

# --- Hidden for future re-enable ---
# IndexSpec("nbr2", NBR2_PALETTE, NBR2_MIN_DISPLAY, NBR2_MAX_DISPLAY,
#           lambda b: _nd(b["B11"], b["B12"])),
# IndexSpec("ndwi", NDWI_PALETTE, NDWI_MIN_DISPLAY, NDWI_MAX_DISPLAY,
#           lambda b: _nd(b["B03"], b["B08"])),
# IndexSpec("cci",  CCI_PALETTE,  CCI_MIN_DISPLAY,  CCI_MAX_DISPLAY,  _cire),

SPEC_BY_KEY = {spec.key: spec for spec in INDEX_SPECS}


def get_index_scales() -> list[dict]:
    """
    Static per-index color-scale metadata (hex palette + display min/max),
    sourced directly from INDEX_SPECS -- the exact same table every
    per-scene visualization() call already uses internally. This never
    varies per field, per scene, or per request; it's the same 8 entries
    every time. Intended to be served once via a lightweight route (e.g.
    GET /ndvi/index-scales) and cached client-side, so the frontend legend
    reads real backend constants instead of a hardcoded copy that could
    drift out of sync if a palette or display range is ever changed here.
    """
    return [
        {
            "key": spec.key,
            "palette": [f"#{c}" for c in spec.palette],
            "vmin": spec.vmin,
            "vmax": spec.vmax,
        }
        for spec in INDEX_SPECS
    ]


def _polygon_to_geojson_geometry(polygon: Polygon):
    from app.schemas.geometry import PolygonGeometry
    coords = [[list(coord) for coord in polygon.exterior.coords]]
    return PolygonGeometry(type="Polygon", coordinates=coords)


def _download_composite_bands(
    polygon: Polygon, start_date: date, end_date: date
) -> tuple[dict[str, np.ndarray], float]:
    catalog = ensure_catalog()
    geojson = mapping(polygon)
    collection = _collection()
    datetime_range = f"{start_date.isoformat()}/{end_date.isoformat()}"

    try:
        search = catalog.search(
            collections=[collection],
            intersects=geojson,
            datetime=datetime_range,
            query={"eo:cloud_cover": {"lt": SEARCH_MAX_CLOUD_COVER}},
        )
        items = list(search.items())
    except Exception as e:
        logger.error("STAC search failed: %s", e, exc_info=True)
        raise SatelliteDataError(f"STAC search failed: {e}")

    if not items:
        raise NoSatelliteImageFoundError(
            f"No Sentinel-2 imagery found for this area between "
            f"{start_date} and {end_date} (searched 0–{SEARCH_MAX_CLOUD_COVER}% cloud)."
        )

    items.sort(key=lambda it: float(it.properties.get("eo:cloud_cover", 100)))
    best_cloud = float(items[0].properties.get("eo:cloud_cover", 100))
    selected = [items[0]]
    items = [planetary_computer.sign(item) for item in selected]

    try:
        stack = stackstac.stack(
            items,
            assets=[b for b in COMPOSITE_BANDS],
            bounds_latlon=polygon.bounds,
            epsg=4326,
            resolution=0.0001,
            chunksize=2048,
            rescale=False,
        )
        data = stack.compute()
    except Exception as e:
        logger.error("stackstac load failed: %s", e, exp_info=True)
        raise NoSatelliteImageFoundError(
            f"Could not load Sentinel-2 imagery for this area between {start_date} and {end_date}. ({e})"
        )

    if data.sizes.get("time", 0) == 0:
        raise NoSatelliteImageFoundError(
            f"No usable scenes after load for {start_date}..{end_date}.")

    band_names = list(data.coords["band"].values)

    try:
        scl_idx = band_names.index("SCL")
    except ValueError:
        raise SatelliteDataError("SCL band missing from STAC stack")

    scl = data.isel(band=scl_idx).astype("float32")
    cloud = np.zeros(scl.shape, dtype=bool)
    for cls in CLOUD_SCL_CLASSES:
        cloud |= (scl.values == cls)

    result: dict[str, np.ndarray] = {}
    for name in COMPOSITE_BANDS:
        if name == "SCL" or name not in band_names:
            continue
        b_idx = band_names.index(name)
        vals = data.isel(band=b_idx).astype("float32").values.copy()
        vals[cloud] = np.nan
        with np.errstate(all="ignore"):
            mean = np.nanmean(vals, axis=0)
        mean = np.where(np.isfinite(mean) & (mean > 0),
                        mean, np.nan).astype("float32")
        result[name] = mean

    if "B08" not in result or "B04" not in result:
        raise NoSatelliteImageFoundError(
            "Required bands (B08/B04) missing after composite.")

    return result, best_cloud


def _stats_and_png(
    array: np.ndarray, vmin: float, vmax: float, palette: list[str], filename_prefix: str
) -> tuple[NdviStats, str]:
    valid_pixels = array[np.isfinite(array)]
    if valid_pixels.size == 0:
        raise NoSatelliteImageFoundError(
            "Index could not be computed — no valid pixels after cloud mask."
        )

    stats = NdviStats(
        mean=round(float(np.mean(valid_pixels)), 4),
        min=round(float(np.min(valid_pixels)), 4),
        max=round(float(np.max(valid_pixels)), 4),
    )

    image_filename = f"{filename_prefix}_{uuid.uuid4().hex}.png"
    os.makedirs(NDVI_IMAGES_DIR, exist_ok=True)
    image_path = os.path.join(NDVI_IMAGES_DIR, image_filename)
    render_ndvi_png(array, output_path=image_path,
                    vmin=vmin, vmax=vmax, palette=palette)
    image_url = f"{_app_base_url()}/static/ndvi_images/{image_filename}"

    return stats, image_url


def _build_index_response(
    bands: dict[str, np.ndarray],
    polygon: Polygon,
    area_hectares: float | None,
    date_range_start: date,
    date_range_end: date,
    actual_cloud_cover: float,
) -> NdviAnalyzeResponse:
    west, south, east, north = polygon.bounds
    bounding_box = [west, south, east, north]

    results: dict[str, tuple[NdviStats, str]] = {}
    for spec in INDEX_SPECS:
        arr = spec.compute(bands)
        arr = np.where(np.isfinite(arr), arr, np.nan).astype("float32")
        results[spec.key] = _stats_and_png(
            arr, spec.vmin, spec.vmax, spec.palette, spec.key)

    def viz(key: str) -> NdviVisualization:
        spec = SPEC_BY_KEY[key]
        _, url = results[key]
        return NdviVisualization(
            image_url=url,
            bounding_box=bounding_box,
            palette=[f"#{c}" for c in spec.palette],
            min_value=spec.vmin,
            max_value=spec.vmax,
        )

    return NdviAnalyzeResponse(
        geometry=_polygon_to_geojson_geometry(polygon),
        stats=results["ndvi"][0],
        visualization=viz("ndvi"),
        ndmi_stats=results["ndmi"][0],
        ndmi_visualization=viz("ndmi"),
        ndre_stats=results["ndre"][0],
        ndre_visualization=viz("ndre"),
        # --- Hidden indices (kept as None so schema stays compatible) ---
        nbr2_stats=None,
        nbr2_visualization=None,
        ndwi_stats=None,
        ndwi_visualization=None,
        cci_stats=None,
        cci_visualization=None,
        evi_stats=results["evi"][0],
        evi_visualization=viz("evi"),
        savi_stats=results["savi"][0],
        savi_visualization=viz("savi"),
        # New RGB indices
        exg_stats=results["exg"][0],
        exg_visualization=viz("exg"),
        vari_stats=results["vari"][0],
        vari_visualization=viz("vari"),
        gli_stats=results["gli"][0],
        gli_visualization=viz("gli"),
        source=NdviSourceInfo(
            collection=_collection(),
            date_range_start=date_range_start,
            date_range_end=date_range_end,
            max_cloud_cover_filter_percent=round(actual_cloud_cover, 1),
        ),
        area_hectares=area_hectares,
    )


def compute_ndvi(
    polygon: Polygon,
    area_hectares: float | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> NdviAnalyzeResponse:
    validate_search_window(start_date, end_date)

    resolved_end = end_date or datetime.now(timezone.utc).date()
    resolved_start = start_date or (
        resolved_end - timedelta(days=_default_window_days()))

    try:
        bands, actual_cloud = _download_composite_bands(
            polygon, resolved_start, resolved_end)
        return _build_index_response(
            bands, polygon, area_hectares, resolved_start, resolved_end, actual_cloud
        )
    except (NoSatelliteImageFoundError, SatelliteDataError, InvalidDateRangeError):
        raise
    except Exception as e:
        logger.error("Index computation failed: %s", e, exc_info=True)
        raise SatelliteDataError(f"Index computation failed: {e}")


def compute_ndvi_periods(
    polygon: Polygon,
    area_hectares: float | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Iterator[NdviAnalyzeResponse]:
    validate_search_window(start_date, end_date)

    resolved_end = end_date or datetime.now(timezone.utc).date()
    resolved_start = start_date or (
        resolved_end - timedelta(days=_default_window_days()))

    for tile_start, tile_end in compute_weekly_tiles(resolved_start, resolved_end):
        try:
            yield compute_ndvi(polygon, area_hectares, tile_start, tile_end)
        except (NoSatelliteImageFoundError, SatelliteDataError) as e:
            logger.warning("Skipping tile %s..%s: %s", tile_start, tile_end, e)
            continue
