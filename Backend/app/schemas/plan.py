import uuid
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict


class PlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    slug: str
    features: Dict[str, Any]


class PlanPublicResponse(BaseModel):
    """GET /plans — public pricing list for the landing page. Deliberately
    thinner than PlanResponse: no internal `features` dict exposed to
    logged-out visitors, just what's needed to render a price."""
    model_config = ConfigDict(from_attributes=True)
    slug: str
    name: str
    price_cents: Optional[int] = None
    currency: str
