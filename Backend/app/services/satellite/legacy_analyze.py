"""
Compatibility wrapper for the old POST /api/analyze endpoint.

routes.py calls:
    search_and_calculate(polygon, date_str, index, max_cloud)

Returns a dict:
    status, message, stats, overlay_image, bounds
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from shapely.geometry import shape

from app.services.satellite.ndvi_processor import compute_ndvi


# Map frontend index names -> response field on NdviAnalyzeResponse
_INDEX_VIZ = {
    "ndvi": ("stats", "visualization"),
    "ndmi": ("ndmi_stats", "ndmi_visualization"),
    "ndre": ("ndre_stats", "ndre_visualization"),
    "nbr2": ("nbr2_stats", "nbr2_visualization"),
    "ndwi": ("ndwi_stats", "ndwi_visualization"),
    "cci": ("cci_stats", "cci_visualization"),
    "evi": ("evi_stats", "evi_visualization"),
    "savi": ("savi_stats", "savi_visualization"),
}


def search_and_calculate(
    polygon: dict,
    date_str: str,
    index: str = "ndvi",
    max_cloud: int = 40,
) -> dict[str, Any]:
    """
    polygon: GeoJSON geometry dict (Polygon)
    date_str: 'YYYY-MM-DD' (used as end of a short search window)
    index: one of ndvi/ndmi/ndre/nbr2/ndwi/cci/evi/savi
    max_cloud: kept for API compatibility (STAC filter uses settings default too)
    """
    index_key = (index or "ndvi").strip().lower()
    if index_key not in _INDEX_VIZ:
        return {
            "status": "error",
            "message": f"Unsupported index '{index}'. Use: {', '.join(_INDEX_VIZ)}",
        }

    try:
        geom = shape(polygon)
        if geom.geom_type == "MultiPolygon":
            geom = max(geom.geoms, key=lambda g: g.area)
        if geom.geom_type != "Polygon" or geom.is_empty:
            return {"status": "error", "message": "Invalid polygon geometry"}
    except Exception as e:
        return {"status": "error", "message": f"Could not parse polygon: {e}"}

    try:
        end = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return {"status": "error", "message": f"Invalid date '{date_str}'. Use YYYY-MM-DD"}

    # Short window ending on requested date (same idea as old single-date analyze)
    start = end - timedelta(days=14)
    today = date.today()
    if end > today:
        end = today
    if start >= end:
        start = end - timedelta(days=7)

    try:
        result = compute_ndvi(
            polygon=geom,
            area_hectares=None,
            start_date=start,
            end_date=end,
        )
    except Exception as e:
        return {
            "status": "error",
            "message": str(e) or "No satellite imagery found for this area/date",
        }

    stats_attr, viz_attr = _INDEX_VIZ[index_key]
    stats_obj = getattr(result, stats_attr)
    viz_obj = getattr(result, viz_attr)

    return {
        "status": "success",
        "message": f"{index_key.upper()} calculated successfully",
        "stats": {
            "mean": stats_obj.mean,
            "min": stats_obj.min,
            "max": stats_obj.max,
        },
        "overlay_image": viz_obj.image_url,
        "bounds": viz_obj.bounding_box,  # [west, south, east, north]
    }
