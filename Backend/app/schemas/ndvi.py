from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.geometry import PolygonGeometry


class NdviAnalyzeRequest(BaseModel):
    geometry: PolygonGeometry
    field_name: Optional[str] = Field(default=None, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class NdviColorStop(BaseModel):
    value: float
    color: str


class NdviStats(BaseModel):
    mean: float
    min: float
    max: float


class NdviVisualization(BaseModel):
    image_url: str = Field(
        ..., description="Absolute URL to the generated NDVI PNG overlay"
    )
    bounding_box: List[float] = Field(
        ..., description="[west, south, east, north] extent for overlaying image_url on the map"
    )
    palette: List[str]
    min_value: float
    max_value: float


class NdviSourceInfo(BaseModel):
    collection: str
    date_range_start: date
    date_range_end: date
    max_cloud_cover_filter_percent: Optional[float] = None


class NdviAnalyzeResponse(BaseModel):
    geometry: PolygonGeometry
    stats: NdviStats
    visualization: NdviVisualization

    # NDMI (moisture index)
    ndmi_stats: Optional[NdviStats] = None
    ndmi_visualization: Optional[NdviVisualization] = None

    # NDRE (red-edge / nitrogen)
    ndre_stats: Optional[NdviStats] = None
    ndre_visualization: Optional[NdviVisualization] = None

    # --- Hidden for now (kept Optional so nothing breaks) ---
    nbr2_stats: Optional[NdviStats] = None
    nbr2_visualization: Optional[NdviVisualization] = None
    ndwi_stats: Optional[NdviStats] = None
    ndwi_visualization: Optional[NdviVisualization] = None
    cci_stats: Optional[NdviStats] = None
    cci_visualization: Optional[NdviVisualization] = None

    # EVI & SAVI
    evi_stats: Optional[NdviStats] = None
    evi_visualization: Optional[NdviVisualization] = None
    savi_stats: Optional[NdviStats] = None
    savi_visualization: Optional[NdviVisualization] = None

    # RGB-only indices (ExG / VARI / GLI) – now active for both satellite & drone
    exg_stats: Optional[NdviStats] = None
    exg_visualization: Optional[NdviVisualization] = None
    vari_stats: Optional[NdviStats] = None
    vari_visualization: Optional[NdviVisualization] = None
    gli_stats: Optional[NdviStats] = None
    gli_visualization: Optional[NdviVisualization] = None

    source: NdviSourceInfo
    area_hectares: Optional[float] = None
