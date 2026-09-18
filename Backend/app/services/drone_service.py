"""
Shared GeoTIFF geo-metadata helpers, used by the field-linked drone
capture pipeline (see drone_capture_tile_service.py) to compute map
bounds and the real photographed-area footprint for an RGB band's COG.
"""

import logging
import sys

logger = logging.getLogger("app")


def _log_footprint_issue(stage: str, file_path: str, exc: Exception) -> None:
    """
    FIX (2026-09): footprint extraction used to fail via a single
    all-or-nothing try/except that only did print(...). print() from a
    background task is very commonly buffered by the interpreter/process
    manager and never actually reaches a visible terminal — so a real
    failure could be happening every time with zero visible trace,
    which matches "I checked and found nothing" exactly.
    Using logger.exception() writes through Python's logging handlers
    (which flush reliably) AND we still print with flush=True as a
    belt-and-suspenders backup in case logging isn't wired to console
    in this environment.
    """
    logger.exception(
        f"[drone_service] Footprint extraction failed at stage '{stage}' for {file_path}: {exc}"
    )
    print(
        f"[drone_service] Footprint extraction failed at stage '{stage}' for {file_path}: {exc}",
        flush=True,
        file=sys.stderr,
    )


def _extract_bounds_from_geotiff(file_path: str):
    """
    Reads only the file's geo-metadata (header), not its pixels — cheap and
    fast regardless of file size. Safe to call synchronously even for a
    multi-GB file.
    """
    try:
        import rasterio
        from rasterio.warp import transform_bounds

        with rasterio.open(file_path) as src:
            if src.crs is None:
                return None
            left, bottom, right, top = transform_bounds(
                src.crs, "EPSG:4326", *src.bounds)
            return [[left, top], [right, top], [right, bottom], [left, bottom]]
    except Exception as e:
        logger.exception(
            f"[drone_service] GeoTIFF bounds extraction failed: {e}")
        print(
            f"[drone_service] GeoTIFF bounds extraction failed: {e}", flush=True, file=sys.stderr)
        return None


def _extract_footprint_polygon(file_path: str):
    """
    Traces the real outer boundary of the photographed area.
    Balanced thresholds so we catch the hazy side padding without
    eating into real crop/soil (which caused the crazy jagged mess).
    """
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.features import shapes as rio_shapes
    from rasterio.warp import transform_geom
    from shapely.geometry import mapping, shape, Polygon
    from shapely.ops import unary_union
    from scipy import ndimage

    MAX_DIM = 1800

    try:
        with rasterio.open(file_path) as src:
            width, height = src.width, src.height
            scale = min(1.0, MAX_DIM / max(width, height))
            out_w = max(1, int(width * scale))
            out_h = max(1, int(height * scale))

            if src.count >= 3:
                arr = src.read(
                    [1, 2, 3],
                    out_shape=(3, out_h, out_w),
                    resampling=Resampling.bilinear,
                )
            else:
                single = src.read(1, out_shape=(out_h, out_w),
                                  resampling=Resampling.bilinear)
                arr = np.stack([single, single, single], axis=0)

            r = arr[0].astype(np.float32)
            g = arr[1].astype(np.float32)
            b = arr[2].astype(np.float32)

            # --- Padding detection (balanced) ---------------------------------
            # 1. Near-pure white (classic orthomosaic padding)
            is_white = (r > 248) & (g > 248) & (b > 248)

            # 2. Low saturation + high brightness = hazy/gray padding
            #    (kept mild so real dry soil / crop is not destroyed)
            spread = np.maximum(np.maximum(r, g), b) - \
                np.minimum(np.minimum(r, g), b)
            brightness = (r + g + b) / 3.0
            is_gray = (spread < 12.0) & (brightness > 140.0)

            # 3. Near-black
            is_black = brightness < 8.0

            is_padding = is_white | is_gray | is_black
            valid = ~is_padding

            # Keep only the largest blob (removes noise islands)
            labeled, n = ndimage.label(valid)
            if n == 0:
                return None
            sizes = ndimage.sum(valid, labeled, range(1, n + 1))
            valid = labeled == (np.argmax(sizes) + 1)

            # Light clean-up
            valid = ndimage.binary_opening(valid, iterations=1)
            valid = ndimage.binary_closing(valid, iterations=2)

            mask = valid.astype(np.uint8) * 255

            transform = src.transform * \
                src.transform.scale(width / out_w, height / out_h)
            crs = src.crs

    except Exception as e:
        _log_footprint_issue("read/mask", file_path, e)
        return None

    if not mask.any():
        return None

    # --- Vectorize ----------------------------------------------------------
    try:
        polys = [
            shape(geom)
            for geom, val in rio_shapes(mask, transform=transform)
            if val == 255
        ]
        if not polys:
            return None

        merged = unary_union(polys)
        if merged.geom_type == "MultiPolygon":
            merged = max(merged.geoms, key=lambda g: g.area)

        # Force a clean exterior ring (no holes, no self-intersections)
        if merged.geom_type != "Polygon":
            merged = merged.convex_hull
        else:
            # Drop any interior rings – we only want the outer boundary
            merged = Polygon(merged.exterior)

        # Gentle simplify so the line is smooth but still follows the edge
        simplified = merged.simplify(
            tolerance=merged.length * 0.0007, preserve_topology=True)
        if simplified.is_empty or not simplified.is_valid:
            simplified = merged

    except Exception as e:
        _log_footprint_issue("vectorize", file_path, e)
        return None

    # --- Reproject ----------------------------------------------------------
    try:
        geom = transform_geom(crs, "EPSG:4326", mapping(simplified))
        ring = geom["coordinates"][0]
        return [[float(lng), float(lat)] for lng, lat in ring]
    except Exception as e:
        _log_footprint_issue("reproject", file_path, e)
        return None
