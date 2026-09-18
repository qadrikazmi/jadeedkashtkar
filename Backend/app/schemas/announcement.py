import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AnnouncementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    message: str
    discount_percent: Optional[int]
    plan_slug: Optional[str]
    starts_at: datetime
    ends_at: datetime
