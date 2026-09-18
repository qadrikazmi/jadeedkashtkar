import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.alert import AlertCategory


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    field_id: uuid.UUID
    category: AlertCategory
    title: str
    message: str
    risk_pct: Optional[float]
    dismissed: bool
    created_at: datetime
