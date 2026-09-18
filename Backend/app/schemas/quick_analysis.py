from datetime import date
from typing import Dict, Optional

from pydantic import BaseModel

from app.schemas.geometry import PolygonGeometry


class QuickAnalyzeRequest(BaseModel):
    """Just the polygon — no date, index, or cloud threshold. The backend
    auto-picks the freshest cloud-free scene and computes every index."""
    polygon: PolygonGeometry


class QuickIndexStats(BaseModel):
    mean: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None


class QuickAnalyzeResponse(BaseModel):
    image_date: date
    cloud_cover_percent: Optional[float] = None
    area_hectares: float
    indices: Dict[str, QuickIndexStats]
