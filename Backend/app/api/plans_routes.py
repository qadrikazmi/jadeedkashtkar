from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.plan import Plan
from app.models.user import User
from app.schemas.plan import PlanPublicResponse, PlanResponse
from app.services.plan_service import get_user_plan

router = APIRouter(prefix="/plans", tags=["plans"])

# Order the landing page shows plans in — not the DB row order, which has
# no guaranteed ordering. "guest" and "developer" are deliberately excluded
# here: guest has no purchase flow, and developer is internal-only.
PUBLIC_PLAN_ORDER = ["free", "starter", "pro", "enterprise"]


@router.get("", response_model=List[PlanPublicResponse])
def list_public_plans(db: Session = Depends(get_db)):
    """Public, unauthenticated — the landing page's pricing section reads
    real prices from here instead of hardcoding them, so changing
    plans.price_cents in the DB updates the live site with no deploy."""
    rows = (
        db.query(Plan)
        .filter(Plan.is_active.is_(True), Plan.slug.in_(PUBLIC_PLAN_ORDER))
        .all()
    )
    by_slug = {p.slug: p for p in rows}
    return [by_slug[slug] for slug in PUBLIC_PLAN_ORDER if slug in by_slug]


@router.get("/me", response_model=PlanResponse)
def get_my_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_user_plan(db, current_user.id)
