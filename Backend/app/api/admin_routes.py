"""
Admin panel routes — users, plans, and announcements management. Every
route here is gated by require_admin (see app/dependencies/admin.py),
which itself wraps get_current_user, so an unauthenticated request never
even gets to the 403 check — it fails auth first.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.dependencies.admin import require_admin
from app.models.announcement import Announcement
from app.models.plan import Plan
from app.models.user import User
from app.models.user_subscription import UserSubscription
from app.schemas.admin import (
    AdminAnnouncementCreateRequest,
    AdminAnnouncementRow,
    AdminAnnouncementUpdateRequest,
    AdminChangePlanRequest,
    AdminPlanRow,
    AdminPlanUpdateRequest,
    AdminUserRow,
    AdminUserStatusUpdateRequest,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


# ---------- Users ----------

# Plan slugs that can never be changed or have their user deactivated
# through the admin panel — currently just "developer" (internal/manual
# accounts assigned via a separate script, not the UI).
#
# ← CHANGED: this alone used to decide "protected". It's now only HALF of
# that decision — see _is_protected_user below, which also protects any
# account with is_admin=True regardless of plan. Kept as-is (not renamed)
# since it still means exactly what it says: protected plan slugs.
PROTECTED_PLAN_SLUGS = {"developer"}


def _row_from(user: User, subscription: UserSubscription | None) -> AdminUserRow:
    if subscription and subscription.plan:
        plan_slug = subscription.plan.slug
        plan_name = subscription.plan.name
        current_period_end = subscription.current_period_end
    else:
        plan_slug = "none"
        plan_name = "No plan"
        current_period_end = None

    return AdminUserRow(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone_number=user.phone_number,
        is_active=user.is_active,
        # ← NEW: see AdminUserRow.is_admin in schemas/admin.py.
        is_admin=user.is_admin,
        plan_slug=plan_slug,
        plan_name=plan_name,
        current_period_end=current_period_end,
    )


def _get_current_plan_slug(db: Session, user_id: uuid.UUID) -> str | None:
    subscription = (
        db.query(UserSubscription)
        .options(joinedload(UserSubscription.plan))
        .filter(UserSubscription.user_id == user_id)
        .first()
    )
    return subscription.plan.slug if subscription and subscription.plan else None


# ← NEW: single source of truth for "can this account be changed from the
# admin panel". Previously both routes below only checked the plan slug
# (PROTECTED_PLAN_SLUGS), so an admin on e.g. the Enterprise plan (like the
# qadrikazmi account) was NOT protected server-side — only the frontend's
# disabled controls stopped a casual click, and a direct API call could
# still deactivate or plan-change any admin account. Now any account with
# is_admin=True is protected, on top of the existing plan-slug protection.
def _is_protected_user(db: Session, user: User) -> bool:
    if user.is_admin:
        return True
    return _get_current_plan_slug(db, user.id) in PROTECTED_PLAN_SLUGS


@router.get("/users", response_model=list[AdminUserRow])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    subs_by_user = {
        s.user_id: s
        for s in db.query(UserSubscription).options(joinedload(UserSubscription.plan)).all()
    }
    return [_row_from(u, subs_by_user.get(u.id)) for u in users]


@router.patch("/users/{user_id}/plan", response_model=AdminUserRow)
def change_user_plan(
    user_id: uuid.UUID,
    body: AdminChangePlanRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # ← CHANGED: was `_get_current_plan_slug(db, user.id) in PROTECTED_PLAN_SLUGS`.
    if _is_protected_user(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is protected and cannot be changed from the admin panel.",
        )

    plan = db.query(Plan).filter(Plan.slug == body.plan_slug).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")

    subscription = (
        db.query(UserSubscription).filter(
            UserSubscription.user_id == user.id).first()
    )
    if subscription:
        subscription.plan_id = plan.id
        subscription.status = "active"
    else:
        subscription = UserSubscription(
            user_id=user.id, plan_id=plan.id, status="active")
        db.add(subscription)

    db.commit()
    db.refresh(subscription)

    return _row_from(user, subscription)


@router.patch("/users/{user_id}/status", response_model=AdminUserRow)
def update_user_status(
    user_id: uuid.UUID,
    body: AdminUserStatusUpdateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Toggles login access only. Deactivating a user does not touch their
    subscription — a re-activated user goes right back to whatever plan
    they had."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # ← CHANGED: was `_get_current_plan_slug(db, user.id) in PROTECTED_PLAN_SLUGS`.
    if _is_protected_user(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is protected and cannot be changed from the admin panel.",
        )

    user.is_active = body.is_active
    db.commit()
    db.refresh(user)

    subscription = (
        db.query(UserSubscription)
        .options(joinedload(UserSubscription.plan))
        .filter(UserSubscription.user_id == user.id)
        .first()
    )
    return _row_from(user, subscription)


# ---------- Plans ----------

# Admin display order — same rationale as PUBLIC_PLAN_ORDER in plans_routes.py:
# DB row order has no guaranteed meaning, so we pin a sensible order and let
# any plan not listed here fall in afterwards by name.
ADMIN_PLAN_ORDER = ["guest", "free", "starter",
                    "pro", "enterprise", "developer"]


def _plan_sort_key(plan: Plan) -> tuple[int, str]:
    try:
        return (ADMIN_PLAN_ORDER.index(plan.slug), plan.name)
    except ValueError:
        return (len(ADMIN_PLAN_ORDER), plan.name)


@router.get("/plans", response_model=list[AdminPlanRow])
def list_plans(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    plans = db.query(Plan).all()
    return sorted(plans, key=_plan_sort_key)


@router.patch("/plans/{plan_id}", response_model=AdminPlanRow)
def update_plan(
    plan_id: uuid.UUID,
    body: AdminPlanUpdateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")

    patch = body.model_dump(exclude_unset=True)

    # max_fields and services both live inside features (JSONB), not as
    # flat columns — pull them out of the patch and merge into a NEW dict
    # (reassigning, not mutating in place) so SQLAlchemy's change tracking
    # actually picks it up. services is a full replace, not a partial merge.
    features_updates = {}
    if "max_fields" in patch:
        features_updates["max_fields"] = patch.pop("max_fields")
    if "services" in patch:
        features_updates["services"] = patch.pop("services")

    if features_updates:
        plan.features = {**plan.features, **features_updates}

    for field, value in patch.items():
        setattr(plan, field, value)

    db.commit()
    db.refresh(plan)
    return plan


# ---------- Announcements / Banners ----------

@router.get("/announcements", response_model=list[AdminAnnouncementRow])
def list_announcements(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Unlike the public /announcements/active endpoint, this returns every
    announcement regardless of is_active or date window, so the admin tab
    can show past/future/disabled banners too."""
    return (
        db.query(Announcement)
        .order_by(Announcement.starts_at.desc())
        .all()
    )


@router.post("/announcements", response_model=AdminAnnouncementRow, status_code=status.HTTP_201_CREATED)
def create_announcement(
    body: AdminAnnouncementCreateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if body.ends_at <= body.starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ends_at must be after starts_at.",
        )

    announcement = Announcement(**body.model_dump())
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return announcement


@router.patch("/announcements/{announcement_id}", response_model=AdminAnnouncementRow)
def update_announcement(
    announcement_id: uuid.UUID,
    body: AdminAnnouncementUpdateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    announcement = db.query(Announcement).filter(
        Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found.")

    patch = body.model_dump(exclude_unset=True)

    new_starts_at = patch.get("starts_at", announcement.starts_at)
    new_ends_at = patch.get("ends_at", announcement.ends_at)
    if new_ends_at <= new_starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ends_at must be after starts_at.",
        )

    for field, value in patch.items():
        setattr(announcement, field, value)

    db.commit()
    db.refresh(announcement)
    return announcement


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: uuid.UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    announcement = db.query(Announcement).filter(
        Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found.")

    db.delete(announcement)
    db.commit()
