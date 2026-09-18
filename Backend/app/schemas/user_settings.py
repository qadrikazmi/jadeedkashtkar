from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    language: str
    yield_unit: str
    alert_pest: bool
    alert_weather: bool
    alert_sms: bool
    updated_at: datetime


class UserSettingsUpdateRequest(BaseModel):
    """PATCH-style — every field optional, only provided keys are changed."""

    language: Optional[str] = Field(default=None, pattern="^(en|ur)$")
    yield_unit: Optional[str] = Field(
        default=None, pattern="^(maund_per_acre|t_per_ha)$")
    alert_pest: Optional[bool] = None
    alert_weather: Optional[bool] = None
    alert_sms: Optional[bool] = None
