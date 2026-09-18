"""
Admin panel schemas — user list rows, plan-change payload, plan management,
and announcement/banner management for the admin-only routes gated by
require_admin.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AdminUserRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: bool
    # ← NEW: exposed so the admin Users tab can auto-protect (gray out,
    # disable status/plan controls) ANY admin account, not just the one
    # hardcoded "developer" plan slug. Previously the frontend had no way
    # to know an account was an admin at all — it inferred "protected"
    # purely from plan_slug.
    is_admin: bool
    plan_slug: str
    plan_name: str
    current_period_end: Optional[datetime] = None


class AdminChangePlanRequest(BaseModel):
    plan_slug: str


class AdminUserStatusUpdateRequest(BaseModel):
    """Toggles User.is_active — a deactivated user cannot log in. Separate
    from plan changes: deactivating an account does not touch their
    subscription, it only blocks auth."""

    is_active: bool


# ---------- Plans ----------

class AdminPlanRow(BaseModel):
    """Full plan row for the admin Plans tab — unlike PlanPublicResponse,
    this exposes the raw features dict so the UI can show/edit max_fields,
    services, and anything else stashed in there."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    price_cents: Optional[int] = None
    currency: str
    is_active: bool
    features: Dict[str, Any]


class AdminPlanUpdateRequest(BaseModel):
    """PATCH-style — every field optional, only provided keys are changed.
    max_fields and services both live inside Plan.features (JSONB), not as
    their own columns, so the route merges them in separately from the flat
    columns below. Pass max_fields: null explicitly for "unlimited" (used
    by Enterprise). services replaces the whole list, not a partial merge —
    send the full set of enabled service keys each time."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    price_cents: Optional[int] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=1, max_length=8)
    is_active: Optional[bool] = None
    max_fields: Optional[int] = Field(default=None, ge=0)
    services: Optional[List[str]] = None


# ---------- Announcements / Banners ----------

class AdminAnnouncementRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    message: str
    discount_percent: Optional[int] = None
    plan_slug: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    is_active: bool
    created_at: datetime


class AdminAnnouncementCreateRequest(BaseModel):
    message: str = Field(..., min_length=1)
    discount_percent: Optional[int] = Field(default=None, ge=0, le=100)
    plan_slug: Optional[str] = None  # null = all plans
    starts_at: datetime
    ends_at: datetime
    is_active: bool = True


class AdminAnnouncementUpdateRequest(BaseModel):
    """PATCH-style — every field optional, only provided keys are changed."""

    message: Optional[str] = Field(default=None, min_length=1)
    discount_percent: Optional[int] = Field(default=None, ge=0, le=100)
    plan_slug: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: Optional[bool] = None
