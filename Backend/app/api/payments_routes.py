import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.order import (
    CheckoutRequest,
    CheckoutResponse,
    MySubscriptionResponse,
    OrderResponse,
    TrialEligibilityResponse,
    TrialRequest,
    TrialResponse,
    WebhookAckResponse,
)
from app.services.checkout_service import (
    get_my_subscription,
    handle_webhook,
    initiate_checkout,
    is_trial_eligible,
    mark_order_failed,
    mark_order_paid,
    start_trial,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(
    body: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = initiate_checkout(db, current_user, body.plan_slug)
    return CheckoutResponse(**result)


@router.get("/trial-eligibility", response_model=TrialEligibilityResponse)
def trial_eligibility(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return TrialEligibilityResponse(eligible=is_trial_eligible(db, current_user))


@router.post("/start-trial", response_model=TrialResponse)
def start_trial_endpoint(
    body: TrialRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = start_trial(db, current_user, body.plan_slug)
    return TrialResponse(plan_slug=body.plan_slug, current_period_end=sub.current_period_end)


@router.get("/my-subscription", response_model=MySubscriptionResponse)
def my_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_my_subscription(db, current_user)


@router.post("/mock/confirm/{order_id}", response_model=OrderResponse)
def mock_confirm(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stub-provider only — stands in for a real provider's webhook while
    no real payment account exists yet. The mock confirmation page on the
    frontend calls this when the user clicks 'Confirm test payment'."""
    order = mark_order_paid(db, order_id)
    return order


@router.post("/mock/fail/{order_id}", response_model=OrderResponse)
def mock_fail(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = mark_order_failed(db, order_id)
    return order


@router.post("/webhook", response_model=WebhookAckResponse)
async def webhook(request: Request, db: Session = Depends(get_db)):
    """The real endpoint a live payment provider calls directly from
    their own server — deliberately NOT behind get_current_user, since
    the provider isn't a logged-in user and has no session token. Trust
    instead comes entirely from handle_webhook's signature verification
    inside the active provider's parse_webhook(). Currently returns 501
    while StubProvider is active, since it has nothing real to verify —
    this route goes live automatically the moment a real provider class
    is swapped in via get_provider() in checkout_service.py.
    """
    raw_body = await request.body()
    try:
        result = handle_webhook(db, raw_body, dict(request.headers))
    except NotImplementedError:
        raise HTTPException(501, "No real payment provider is configured yet")
    return WebhookAckResponse(**result)
