from fastapi import APIRouter

from app.schemas.ndvi import NdviAnalyzeRequest, NdviAnalyzeResponse
from app.services.satellite.ndvi_processor import compute_ndvi, get_index_scales
from app.services.geometry_validator import calculate_area_hectares, validate_polygon

router = APIRouter(prefix="/ndvi", tags=["NDVI"])


@router.post("/analyze", response_model=NdviAnalyzeResponse)
def analyze_ndvi(request: NdviAnalyzeRequest):
    """
    Public endpoint — no authentication required.

    Accepts a GeoJSON polygon, validates it, queries Sentinel-2 via
    Microsoft Planetary Computer's STAC catalog, computes NDVI, and returns
    stats plus an image URL + bounding box the frontend can overlay
    directly on the map. Nothing is persisted here.
    """
    polygon = validate_polygon(request.geometry)
    area_hectares = calculate_area_hectares(polygon)

    result = compute_ndvi(
        polygon,
        area_hectares=area_hectares,
        start_date=request.start_date,
        end_date=request.end_date,
    )
    return result


@router.get("/index-scales")
def index_scales():
    """
    Public endpoint — no authentication required, takes no parameters.

    Returns the fixed color-scale metadata (hex palette + display min/max)
    for every vegetation index, straight from INDEX_SPECS in
    ndvi_processor.py. This never varies per field/scene/request, so the
    frontend fetches it once and caches it (see useIndexScales in
    hooks.js) instead of hardcoding a copy that could drift out of sync
    with the backend's real palette/range constants.
    """
    return get_index_scales()
