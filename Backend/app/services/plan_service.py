import uuid
from datetime import date
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.plan import Plan
from app.models.user_subscription import UserSubscription
from app.models.user import User
from app.dependencies.auth import get_current_user


def get_user_plan(db: Session, user_id: uuid.UUID) -> Plan:
    sub = (
        db.query(UserSubscription)
        .filter(UserSubscription.user_id == user_id, UserSubscription.status == "active")
        .first()
    )
    plan = sub.plan if sub else db.query(
        Plan).filter(Plan.slug == "free").first()
    if plan is None:
        raise HTTPException(500, "No plan configured — contact support")
    return plan


def require_feature(feature_key: str):
    def dependency(
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> Plan:
        plan = get_user_plan(db, current_user.id)
        if feature_key not in plan.features.get("services", []):
            raise HTTPException(
                403, f"'{feature_key}' is not available on your plan")
        return plan
    return dependency


def get_field_limit(db: Session, current_user: User) -> Optional[int]:
    return get_user_plan(db, current_user.id).features.get("max_fields")


def should_persist_fields(plan: Plan) -> bool:
    return bool(plan.features.get("data_saving", True))


def get_data_fetch_mode(plan: Plan) -> str:
    return plan.features.get("data_fetch_mode", "sparse")


def enforce_date_range_limit(plan: Plan, start_date: Optional[date], end_date: Optional[date]) -> None:
    """Caps how far apart start_date/end_date can be, per plan. None on
    either side (metadata-only update, no new analysis) is skipped —
    nothing to validate. max_input_days missing/None means no cap
    (Enterprise/Developer)."""
    if start_date is None or end_date is None:
        return
    max_days = plan.features.get("max_input_days")
    if max_days is None:
        return
    range_days = (end_date - start_date).days + 1
    if range_days > max_days:
        raise HTTPException(
            400,
            f"Your plan allows up to {max_days} days of satellite data per analysis. "
            f"You selected {range_days} days — narrow your date range.",
        )
