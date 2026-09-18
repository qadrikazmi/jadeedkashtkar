"""
Tiling for a drone capture's RGB band — shown full-extent, uncropped, on
the Fields map (separate from the index-computation clipping in
drone_index_service.py, which only affects the math, never the display).

Reuses the exact same bounds/footprint extraction and tile-rendering logic
already proven working for the standalone Drone Imagery page — see
drone_service.py's _extract_bounds_from_geotiff, _extract_footprint_polygon,
and the white-padding transparency technique in get_tile_bytes.
"""

import io
import os
import uuid

import numpy as np
import rasterio
from PIL import Image, ImageFilter
from rio_tiler.errors import TileOutsideBounds
from rio_tiler.io import Reader
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.drone_capture_band import DroneCaptureBand
from app.services.drone_job_lock import drone_processing_lock
from app.services.drone_service import (
    _extract_bounds_from_geotiff,
    _extract_footprint_polygon,
)

RGB_COG_DIR = os.path.join("static", "drone_capture_cog")

# Same GDAL memory ceiling as drone_index_service.py — cog_translate on a
# multi-GB source file is exactly the kind of operation that otherwise
# lets GDAL's cache balloon toward all available RAM.
#
# FIX (2026-09): these were previously strings ("512", "1", "1"). Newer
# rasterio/GDAL builds require actual integers here — passing strings
# raises "TypeError: an integer is required" inside rasterio.Env.__enter__
# (defenv -> update_config_options -> set_gdal_config), the same crash
# hit in drone_index_service.py. Fixed the same way here.
RASTERIO_ENV_OPTS = {
    "GDAL_CACHEMAX": 512,
    "NUM_THREADS": 1,
    "GDAL_NUM_THREADS": 1,
}


def process_capture_band_to_cog(band_id: uuid.UUID) -> None:
    """
    Runs as a background task after an RGB band is uploaded. Opens its own
    DB session since the request-scoped one is closed by the time this runs.

    Wrapped in drone_processing_lock so this never runs concurrently with
    compute_capture_indices or another COG conversion — see
    drone_job_lock.py for why that matters on large source files.
    """
    with drone_processing_lock:
        db_gen = get_db()
        db = next(db_gen)
        try:
            band = db.query(DroneCaptureBand).filter(
                DroneCaptureBand.id == band_id).first()
            if band is None or band.band_type != "rgb":
                return

            raw_absolute_path = os.path.join("static", band.file_path)

            try:
                from rio_cogeo.cogeo import cog_translate
                from rio_cogeo.profiles import cog_profiles

                os.makedirs(RGB_COG_DIR, exist_ok=True)
                cog_relative_path = os.path.join(
                    "drone_capture_cog", f"{band_id}.tif")
                cog_absolute_path = os.path.join("static", cog_relative_path)

                with rasterio.Env(**RASTERIO_ENV_OPTS):
                    cog_translate(
                        raw_absolute_path,
                        cog_absolute_path,
                        cog_profiles.get("deflate"),
                        quiet=True,
                    )

                    band.cog_path = cog_relative_path
                    band.bounds = _extract_bounds_from_geotiff(
                        cog_absolute_path)
                    band.footprint = _extract_footprint_polygon(
                        cog_absolute_path)
                    band.tile_status = "ready"
                    band.tile_error_message = None
            except Exception as e:
                band.tile_status = "failed"
                band.tile_error_message = str(e)[:500]
                print(
                    f"[drone_capture_tile_service] Tiling failed for band {band_id}: {e}")

            db.commit()
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass


# FIX (2026-09): erosion applied to the "real data" mask before it's used
# as alpha. The white-threshold test below is a single hard brightness
# cutoff — real orthomosaic exports often have a thin ring of pixels right
# at the padding/real-data boundary that are *close to* white (e.g.
# resampling/compression blur) but not quite over WHITE_THRESHOLD, so they
# get classified as "real data" and rendered fully opaque. That left a
# thin solid rectangle visible exactly along the GeoTIFF's canvas edge
# (distinct from the jagged real-footprint outline, which is a separate
# vector layer, not this pixel mask). Eroding the mask inward by a few
# pixels swallows that ambiguous boundary ring into full transparency
# regardless of its exact color, at the cost of a few pixels of real data
# right at the very edge — a good trade for killing a visible seam.
MASK_EROSION_PX = 3


def _erode_mask(mask_uint8):
    """
    mask_uint8: 2D uint8 array, 255 = real data, 0 = padding.
    Shrinks the 255 region inward by MASK_EROSION_PX pixels using PIL's
    MinFilter (a plain box-minimum filter — exactly binary erosion for a
    0/255 mask). Avoids adding a scipy dependency for one small operation.
    """
    if MASK_EROSION_PX <= 0:
        return mask_uint8

    img = Image.fromarray(mask_uint8, mode="L")
    # MinFilter kernel size must be odd; build up in odd-sized steps to
    # reach the requested erosion radius.
    remaining = MASK_EROSION_PX
    size = 3
    while remaining > 0:
        img = img.filter(ImageFilter.MinFilter(size))
        remaining -= 1
    return np.array(img)


def get_capture_band_tile_bytes(db: Session, band_id: uuid.UUID, z: int, x: int, y: int):
    """
    Reads one tile's worth of pixels from the band's COG — mirrors
    drone_service.get_tile_bytes exactly (same white-padding transparency
    fix, plus mask erosion — see _erode_mask above), just reading from
    DroneCaptureBand instead of DroneImagery.

    NOT wrapped in drone_processing_lock — this reads a single small tile
    from an already-built COG (cheap, and called constantly by Mapbox on
    every pan/zoom), unlike the two heavy one-shot jobs above. Serializing
    this too would make panning/zooming the map stutter for no benefit.
    """
    band = db.query(DroneCaptureBand).filter(
        DroneCaptureBand.id == band_id).first()
    if not band or band.tile_status != "ready" or not band.cog_path:
        return None

    cog_absolute_path = os.path.join("static", band.cog_path)
    if not os.path.exists(cog_absolute_path):
        return None

    try:
        with Reader(cog_absolute_path) as image:
            img = image.tile(x, y, z)
            rendered_png = img.render(img_format="PNG")
            real_data_mask = img.mask

        pil_img = Image.open(io.BytesIO(rendered_png)).convert("RGB")
        arr = np.array(pil_img)

        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        WHITE_THRESHOLD = 250
        is_white_padding = (r > WHITE_THRESHOLD) & (
            g > WHITE_THRESHOLD) & (b > WHITE_THRESHOLD)
        raw_alpha = np.where(is_white_padding, 0,
                             real_data_mask).astype(np.uint8)

        # Erode the raw mask so a thin near-white (but not quite over
        # threshold) boundary ring doesn't survive as a visible opaque
        # rectangle at the GeoTIFF's canvas edge.
        alpha = _erode_mask(raw_alpha)

        rgba = np.dstack([arr, alpha])

        buf = io.BytesIO()
        Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG")
        return buf.getvalue()

    except TileOutsideBounds:
        return None
    except Exception as e:
        print(
            f"[drone_capture_tile_service] Tile read failed for band {band_id} z{z}/x{x}/y{y}: {e}")
        return None
