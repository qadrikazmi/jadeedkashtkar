from datetime import date
from typing import List, Optional

from pydantic import BaseModel


class NdviTrendPoint(BaseModel):
    date: date
    ndvi_mean: Optional[float] = None


class CropHealthResponse(BaseModel):
    field_id: str
    health_score: int
    status_label: str
    baseline_district: str
    baseline_crop: str
    ndvi_trend: List[NdviTrendPoint]
