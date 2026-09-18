import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ScanBreakdownItemResponse(BaseModel):
    label: str
    pct: float


class ScanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    image_url: str
    disease: str
    latin_name: Optional[str]
    confidence_pct: float
    breakdown: list[ScanBreakdownItemResponse]
    mitigations: list[str]
    demo_mode: bool
    created_at: datetime


class LogScanToLedgerRequest(BaseModel):
    field_id: uuid.UUID
