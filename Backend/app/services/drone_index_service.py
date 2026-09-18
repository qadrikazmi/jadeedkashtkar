"""
Drone capture index computation — the automatic pipeline that runs once a
DroneCapture has enough tagged bands. Deliberately reuses the exact same
formulas, palettes, and PNG rendering as satellite (see
services/satellite/ndvi_processor.py) so drone and satellite results are
genuinely comparable, not two different systems that happen to share names.

Key difference from satellite: a drone capture's bands were very likely
processed as separate orthomosaics (different resolution/extent/alignment),
so before any index math can happen they must be reprojected onto one
common pixel grid — see _load_and_align_bands.
"""

import logging
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

import numpy as np
import rasterio
from geoalchemy2.shape import to_shape
from rasterio.features import geometry_mask
from rasterio.warp import reproject, transform_geom, transform_bounds, Resampling
from rasterio.windows import (
    Window,
    bounds as window_bounds,
    transform as window_transform,
)
from shapely.geometry import mapping, shape
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.drone_capture import DroneCapture
from app.models.drone_capture_band import DroneCaptureBand
from app.models.field import Field
from app.services.drone_job_lock import drone_processing_lock
from app.services.ndvi_job_service import upsert_history_row
from app.services.satellite.ndvi_processor import (
    NDVI_PALETTE, NDVI_MIN_DISPLAY, NDVI_MAX_DISPLAY,
    NDRE_PALETTE, NDRE_MIN_DISPLAY, NDRE_MAX_DISPLAY,
    NDWI_PALETTE, NDWI_MIN_DISPLAY, NDWI_MAX_DISPLAY,
    CCI_PALETTE, CCI_MIN_DISPLAY, CCI_MAX_DISPLAY,
    EVI_PALETTE, EVI_MIN_DISPLAY, EVI_MAX_DISPLAY,
    SAVI_PALETTE, SAVI_MIN_DISPLAY, SAVI_MAX_DISPLAY,
    _stats_and_png,
)

logger = logging.getLogger("app")

RASTERIO_ENV_OPTS = {
    "GDAL_CACHEMAX": 512,
    "NUM_THREADS": 1,
    "GDAL_NUM_THREADS": 1,
}


class NoOverlapError(Exception):
    """Raised when the field polygon doesn't overlap the drone data at all."""


def _nd(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return (a - b) / (a + b)


def _evi_drone(b: dict[str, np.ndarray]) -> np.ndarray:
    nir, red, blue = b["nir"], b["red"], b["blue"]
    with np.errstate(divide="ignore", invalid="ignore"):
        return 2.5 * (nir - red) / (nir + 6.0 * red - 7.5 * blue + 1.0)


def _savi_drone(b: dict[str, np.ndarray]) -> np.ndarray:
    nir, red = b["nir"], b["red"]
    with np.errstate(divide="ignore", invalid="ignore"):
        return 1.5 * (nir - red) / (nir + red + 0.5)


def _cci_drone(b: dict[str, np.ndarray]) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return (b["nir"] / b["red_edge"]) - 1.0


def _exg_drone(b: dict[str, np.ndarray]) -> np.ndarray:
    r, g, blue = b["red"], b["green"], b["blue"]
    return 2.0 * g - r - blue


def _vari_drone(b: dict[str, np.ndarray]) -> np.ndarray:
    r, g, blue = b["red"], b["green"], b["blue"]
    with np.errstate(divide="ignore", invalid="ignore"):
        return (g - r) / (g + r - blue)


def _gli_drone(b: dict[str, np.ndarray]) -> np.ndarray:
    r, g, blue = b["red"], b["green"], b["blue"]
    with np.errstate(divide="ignore", invalid="ignore"):
        return (2.0 * g - r - blue) / (2.0 * g + r + blue)


@dataclass(frozen=True)
class DroneIndexSpec:
    key: str
    required_bands: frozenset[str]
    palette: list[str]
    vmin: float
    vmax: float
    compute: Callable[[dict[str, np.ndarray]], np.ndarray]


DRONE_INDEX_SPECS: dict[str, DroneIndexSpec] = {
    "ndvi": DroneIndexSpec("ndvi", frozenset({"nir", "red"}), NDVI_PALETTE,
                           NDVI_MIN_DISPLAY, NDVI_MAX_DISPLAY,
                           lambda b: _nd(b["nir"], b["red"])),
    "savi": DroneIndexSpec("savi", frozenset({"nir", "red"}), SAVI_PALETTE,
                           SAVI_MIN_DISPLAY, SAVI_MAX_DISPLAY, _savi_drone),
    "evi": DroneIndexSpec("evi", frozenset({"nir", "red", "blue"}), EVI_PALETTE,
                          EVI_MIN_DISPLAY, EVI_MAX_DISPLAY, _evi_drone),
    "ndwi": DroneIndexSpec("ndwi", frozenset({"green", "nir"}), NDWI_PALETTE,
                           NDWI_MIN_DISPLAY, NDWI_MAX_DISPLAY,
                           lambda b: _nd(b["green"], b["nir"])),
    "ndre": DroneIndexSpec("ndre", frozenset({"nir", "red_edge"}), NDRE_PALETTE,
                           NDRE_MIN_DISPLAY, NDRE_MAX_DISPLAY,
                           lambda b: _nd(b["nir"], b["red_edge"])),
    "cci": DroneIndexSpec("cci", frozenset({"nir", "red_edge"}), CCI_PALETTE,
                          CCI_MIN_DISPLAY, CCI_MAX_DISPLAY, _cci_drone),
    "exg": DroneIndexSpec("exg", frozenset({"red", "green", "blue"}),
                          ["8B4513", "D2B48C", "F0E68C",
                              "9ACD32", "228B22", "006400"],
                          -0.5, 0.5, _exg_drone),
    "vari": DroneIndexSpec("vari", frozenset({"red", "green", "blue"}),
                           ["8B4513", "D2B48C", "F0E68C",
                               "9ACD32", "228B22", "006400"],
                           -1.0, 1.0, _vari_drone),
    "gli": DroneIndexSpec("gli", frozenset({"red", "green", "blue"}),
                          ["8B4513", "D2B48C", "F0E68C",
                              "9ACD32", "228B22", "006400"],
                          -1.0, 1.0, _gli_drone),
}

RGB_ONLY_KEYS = frozenset({"exg", "vari", "gli"})
NIR_FAMILY_KEYS = frozenset({"ndvi", "savi", "evi", "ndwi", "ndre", "cci"})


def determine_computable_indices(band_types_present: set[str]) -> list[str]:
    available = set(band_types_present)
    if "rgb" in available:
        available |= {"red", "green", "blue"}

    result = []

    # Always include RGB-only indices when we have the RGB bands
    for key in RGB_ONLY_KEYS:
        if DRONE_INDEX_SPECS[key].required_bands.issubset(available):
            result.append(key)

    # Also include NIR-family indices when we have NIR
    for key in NIR_FAMILY_KEYS:
        if DRONE_INDEX_SPECS[key].required_bands.issubset(available):
            result.append(key)

    return result


def _normalize_reflectance(arr: np.ndarray, dtype: str) -> np.ndarray:
    if "uint8" in dtype:
        return arr / 255.0
    if "uint16" in dtype:
        return arr / 65535.0
    return arr


def _load_and_align_bands(bands_by_type: dict[str, DroneCaptureBand], field: Field):
    MAX_ALIGN_DIM = 5000

    with rasterio.Env(**RASTERIO_ENV_OPTS):
        reference_type = "rgb" if "rgb" in bands_by_type else next(
            iter(bands_by_type))
        reference_path = os.path.join(
            "static", bands_by_type[reference_type].file_path)

        with rasterio.open(reference_path) as ref_src:
            dst_crs = ref_src.crs
            ref_width, ref_height = ref_src.width, ref_src.height
            scale = min(1.0, MAX_ALIGN_DIM / max(ref_width, ref_height))
            dst_width = max(1, int(ref_width * scale))
            dst_height = max(1, int(ref_height * scale))
            dst_transform = ref_src.transform * ref_src.transform.scale(
                ref_width / dst_width, ref_height / dst_height
            )

        field_polygon_4326 = to_shape(field.geometry)
        field_geom_native = transform_geom(
            "EPSG:4326", dst_crs, mapping(field_polygon_4326))

        band_arrays: dict[str, np.ndarray] = {}

        for band_type, band_row in bands_by_type.items():
            path = os.path.join("static", band_row.file_path)
            with rasterio.open(path) as src:
                src_dtype = str(src.dtypes[0])

                if band_type == "rgb":
                    band_count = src.count
                    indexes = [1, 2, 3] if band_count >= 3 else [1, 1, 1]
                    out_names = ["red", "green", "blue"]
                    for out_name, src_idx in zip(out_names, indexes):
                        dst = np.zeros((dst_height, dst_width),
                                       dtype="float32")
                        reproject(
                            source=rasterio.band(src, src_idx),
                            destination=dst,
                            src_transform=src.transform, src_crs=src.crs,
                            dst_transform=dst_transform, dst_crs=dst_crs,
                            resampling=Resampling.bilinear,
                        )
                        band_arrays[out_name] = _normalize_reflectance(
                            dst, src_dtype)
                else:
                    dst = np.zeros((dst_height, dst_width), dtype="float32")
                    reproject(
                        source=rasterio.band(src, 1),
                        destination=dst,
                        src_transform=src.transform, src_crs=src.crs,
                        dst_transform=dst_transform, dst_crs=dst_crs,
                        resampling=Resampling.bilinear,
                    )
                    band_arrays[band_type] = _normalize_reflectance(
                        dst, src_dtype)

        import gc
        gc.collect()

        field_mask_full = geometry_mask(
            [field_geom_native], out_shape=(dst_height, dst_width),
            transform=dst_transform, invert=True,
        )

        # ============ TEMPORARY DEBUG — remove once diagnosed ============
        print(f"[DEBUG] mask true pixels: {field_mask_full.sum()} / {field_mask_full.size} "
              f"({100 * field_mask_full.sum() / field_mask_full.size:.1f}%)")
        print(f"[DEBUG] dst image size: {dst_width}x{dst_height}")
        print(
            f"[DEBUG] field_geom_native bounds: {shape(field_geom_native).bounds}")
        print(f"[DEBUG] dst_crs: {dst_crs}")
        print(f"[DEBUG] field_polygon_4326 bounds (raw field geometry, EPSG:4326): "
              f"{field_polygon_4326.bounds}")
        # ===================================================================

        if not field_mask_full.any():
            raise NoOverlapError(
                "This drone capture's photos don't overlap the field's boundary at all."
            )

        # Derive the crop window directly from the TRUE pixels of the mask
        # (rotation-safe — does not use geographic bounds).
        mask_rows, mask_cols = np.where(field_mask_full)
        row_off = int(mask_rows.min())
        row_end = int(mask_rows.max()) + 1
        col_off = int(mask_cols.min())
        col_end = int(mask_cols.max()) + 1

        crop_width = col_end - col_off
        crop_height = row_end - row_off
        window = Window(col_off, row_off, crop_width, crop_height)

        field_mask = field_mask_full[row_off:row_end, col_off:col_end]
        if not field_mask.any():
            raise NoOverlapError(
                "This drone capture's photos don't overlap the field's boundary at all."
            )

        for key in list(band_arrays.keys()):
            cropped = band_arrays[key][row_off:row_end, col_off:col_end]
            band_arrays[key] = np.where(field_mask, cropped, np.nan)

        cropped_transform = window_transform(window, dst_transform)
        window_left, window_bottom, window_right, window_top = window_bounds(
            Window(0, 0, crop_width, crop_height), cropped_transform
        )
        west, south, east, north = transform_bounds(
            dst_crs, "EPSG:4326", window_left, window_bottom, window_right, window_top
        )
        bounding_box = [west, south, east, north]

        # Final safety: drop any remaining all-NaN rows/columns
        # so the PNG is as tight as possible around the real field
        for key in list(band_arrays.keys()):
            arr = band_arrays[key]
            valid = np.isfinite(arr)
            if not valid.any():
                continue
            rows = np.any(valid, axis=1)
            cols = np.any(valid, axis=0)
            band_arrays[key] = arr[rows][:, cols]

        return band_arrays, bounding_box


def _fail_capture(db: Session, capture: DroneCapture, message: str) -> None:
    capture.status = "failed"
    capture.error_message = message
    db.commit()


def compute_capture_indices(capture_id: uuid.UUID) -> None:
    """
    Runs as a background task after a band upload makes a capture eligible.
    Safer version: only deletes the old history row right before writing the new one.
    """
    with drone_processing_lock:
        db = SessionLocal()
        try:
            capture = db.query(DroneCapture).filter(
                DroneCapture.id == capture_id).first()
            if capture is None:
                return

            field = db.query(Field).filter(
                Field.id == capture.field_id).first()
            if field is None:
                _fail_capture(db, capture, "Field no longer exists")
                return

            bands_by_type: dict[str, DroneCaptureBand] = {}
            for band in capture.bands:
                if band.band_type != "unknown":
                    bands_by_type[band.band_type] = band

            computable = determine_computable_indices(
                set(bands_by_type.keys()))
            if not computable:
                capture.status = "collecting"
                db.commit()
                return

            try:
                band_arrays, bounding_box = _load_and_align_bands(
                    bands_by_type, field)
            except NoOverlapError as e:
                _fail_capture(db, capture, str(e))
                return
            except Exception as e:
                logger.error(
                    f"Drone capture {capture_id} alignment failed: {e}", exc_info=True)

                msg = str(e)
                if any(x in msg for x in [
                    "TIFFReadEncodedStrip",
                    "Chunk and warp",
                    "Using code not yet in table",
                    "IReadBlock failed",
                ]):
                    friendly = (
                        "Could not read this GeoTIFF (compression or format issue). "
                        "Please re-export it from QGIS or your drone software as a standard GeoTIFF "
                        "and upload again."
                    )
                else:
                    friendly = f"Could not align drone imagery: {e}"

                _fail_capture(db, capture, friendly)
                return

            fields: dict = {
                "satellite_image_date": capture.capture_date,
                "date_range_start": capture.capture_date,
                "source_collection": "drone",
                "cloud_cover_percent": None,
            }

            for key in computable:
                spec = DRONE_INDEX_SPECS[key]
                try:
                    arr = spec.compute(band_arrays)
                    arr = np.where(np.isfinite(arr), arr,
                                   np.nan).astype("float32")
                    stats, url = _stats_and_png(
                        arr, spec.vmin, spec.vmax, spec.palette, f"drone_{key}")
                    fields[f"{key}_mean"] = stats.mean
                    fields[f"{key}_min"] = stats.min
                    fields[f"{key}_max"] = stats.max
                    fields[f"{key}_png_url"] = url
                except Exception as e:
                    logger.warning(
                        f"Drone capture {capture_id}: index '{key}' failed: {e}")
                    continue

            if not any(f"{key}_mean" in fields for key in computable):
                _fail_capture(
                    db, capture, "Could not compute any index — no valid overlapping pixels.")
                return

            # Safer: only delete the old history row RIGHT before writing the new one
            if capture.ndvi_history_id:
                from app.models.ndvi_history import NdviHistory
                db.query(NdviHistory).filter(
                    NdviHistory.id == capture.ndvi_history_id
                ).delete(synchronize_session=False)
                capture.ndvi_history_id = None
                db.flush()

            history_id = upsert_history_row(db, field.id, fields)

            capture.status = "done"
            capture.ndvi_history_id = history_id
            capture.error_message = None
            db.commit()

            print(
                f"[drone] Successfully wrote history row {history_id} for capture {capture_id}")

        except Exception:
            logger.error(
                f"Drone capture {capture_id} failed unexpectedly", exc_info=True)
            db.rollback()
            try:
                capture = db.query(DroneCapture).filter(
                    DroneCapture.id == capture_id).first()
                if capture is not None:
                    _fail_capture(db, capture, "Unexpected internal error")
            except Exception:
                db.rollback()
        finally:
            db.close()
