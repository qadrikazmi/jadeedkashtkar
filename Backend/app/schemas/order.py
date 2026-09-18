import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class CheckoutRequest(BaseModel):
    plan_slug: str


class CheckoutResponse(BaseModel):
    order_id: uuid.UUID
    redirect_url: str


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    plan_id: uuid.UUID
    amount_cents: int
    currency: str
    status: str
    created_at: datetime
    paid_at: Optional[datetime] = None


class WebhookAckResponse(BaseModel):
    order_id: uuid.UUID
    status: str


class TrialRequest(BaseModel):
    plan_slug: str


class TrialResponse(BaseModel):
    plan_slug: str
    current_period_end: datetime


class TrialEligibilityResponse(BaseModel):
    eligible: bool


class OrderHistoryItem(BaseModel):
    """Order rows shown in the My Subscription section — includes the
    plan's name (not just its id) so the frontend doesn't need a second
    lookup to render each row."""
    id: uuid.UUID
    plan_name: str
    amount_cents: int
    currency: str
    status: str
    created_at: datetime
    paid_at: Optional[datetime] = None


class MySubscriptionResponse(BaseModel):
    plan_slug: str
    plan_name: str
    # "active" (from UserSubscription.status) — kept for future use
    status: str
    is_trial: bool
    current_period_end: Optional[datetime] = None
    has_used_trial: bool
    orders: List[OrderHistoryItem]
