"""
NDVI raster -> colored PNG visualization.

GEE's getMapId() used to return a ready-made tile URL with server-side
palette rendering baked in. CDSE/openEO gives us a raw NDVI raster instead,
so this module does that rendering ourselves: map each NDVI pixel value to
a color from the brown-to-green palette, and save the result as a PNG that
the frontend overlays on the ESRI map using the bounding_box returned
alongside it.
"""

import numpy as np
from PIL import Image


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i: i + 2], 16) for i in (0, 2, 4))


def render_ndvi_png(
    ndvi_array: np.ndarray,
    output_path: str,
    vmin: float,
    vmax: float,
    palette: list[str],
) -> None:
    """
    Renders an NDVI numpy array (values roughly in [-1, 1], NaN for
    masked/nodata pixels) to a colored PNG using a linear interpolation
    across `palette` between vmin and vmax.

    NaN pixels are rendered fully transparent so the map overlay only
    shows valid vegetation data. Automatically scales up small raster grids
    to prevent microscopic image exports on small field boundaries.
    """
    rgb_palette = np.array([_hex_to_rgb(c) for c in palette], dtype="float32")
    n_colors = len(rgb_palette)

    # NaN survives np.clip/np.floor untouched, and casting NaN to int gives
    # numpy's int64 sentinel (-9223372036854775808) instead of raising —
    # which then blows up the palette index below. Substitute a real number
    # for NaN pixels first; the alpha mask (computed from the original
    # array) still makes them fully transparent regardless of this value.
    # Treat any non-finite pixel (NaN nodata, or a stray inf from a local
    # 0/0 index division) as transparent nodata.
    nan_mask = ~np.isfinite(ndvi_array)
    safe_array = np.where(nan_mask, vmin, ndvi_array)

    clipped = np.clip(safe_array, vmin, vmax)
    normalized = (clipped - vmin) / (vmax - vmin)  # 0..1

    # Map normalized value to a fractional palette index, then interpolate
    # between the two nearest colors for a smooth gradient.
    scaled = normalized * (n_colors - 1)
    lower_idx = np.floor(scaled).astype(int)
    upper_idx = np.clip(lower_idx + 1, 0, n_colors - 1)
    frac = (scaled - lower_idx)[..., None]

    lower_colors = rgb_palette[lower_idx]
    upper_colors = rgb_palette[upper_idx]
    rgb = lower_colors * (1 - frac) + upper_colors * frac
    rgb = rgb.astype("uint8")

    alpha = np.where(nan_mask, 0, 255).astype("uint8")

    rgba = np.dstack([rgb, alpha])

    # Create initial PIL image from array
    img = Image.fromarray(rgba, mode="RGBA")

    # Ensure a minimum pixel dimension so small fields don't export as microscopic images
    min_dimension = 512
    width, height = img.size
    if width < min_dimension or height < min_dimension:
        scale_factor = max(min_dimension / width, min_dimension / height)
        new_width = int(width * scale_factor)
        new_height = int(height * scale_factor)
        # Use NEAREST neighbor to keep pixel blocks crisp without blurring
        img = img.resize((new_width, new_height), Image.Resampling.NEAREST)

    img.save(output_path, format="PNG")
