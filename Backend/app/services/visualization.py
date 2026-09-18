import numpy as np
import matplotlib.colors as mcolors
from PIL import Image
import base64
from io import BytesIO

# Color ramp tuned for vegetation indices: bare/stressed -> tan/yellow,
# healthy vegetation -> green. Matches the NDVI convention discussed earlier
# (this is the same style QGIS's default NDVI color ramp uses).
VEG_INDEX_COLORS = ["#8B5A2B", "#D9C89E",
                    "#F4E285", "#A8D08D", "#4E9F3D", "#1B5E20"]
VEG_INDEX_CMAP = mcolors.LinearSegmentedColormap.from_list(
    "veg_index", VEG_INDEX_COLORS)


def build_overlay_image(result_array: np.ndarray, nodata_mask: np.ndarray) -> str:
    """Colorizes an index array (NDVI, EVI, etc.) and returns a base64-encoded
    PNG (with transparency on nodata/masked pixels), ready to drop straight
    into an <img> src or a map image source.

    result_array: the raw index values (e.g. NDVI, range roughly -1..1)
    nodata_mask: boolean array, True where a pixel should be transparent
    """
    display_array = np.nan_to_num(np.clip(result_array, -1, 1), nan=0.0)

    # Most real vegetation signal lives in a narrower band than the full -1..1
    # range, so we normalize over -0.2..0.8 for better visual contrast — same
    # idea as adjusting the "stretch" on a raster layer in QGIS.
    norm = mcolors.Normalize(vmin=-0.2, vmax=0.8)
    rgba = VEG_INDEX_CMAP(norm(display_array))
    rgba_img = (rgba * 255).astype(np.uint8)

    # Make nodata/background pixels fully transparent instead of showing a
    # solid color block outside the actual polygon shape.
    rgba_img[..., 3] = np.where(nodata_mask, 0, 255)

    img = Image.fromarray(rgba_img, mode="RGBA")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")
