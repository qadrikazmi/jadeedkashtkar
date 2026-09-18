import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.plan import Plan
from app.models.user import User
from app.models.user_subscription import UserSubscription
from app.services.payment.stub_provider import StubProvider

# Swap this to select a real provider later — e.g. based on a
# PAYMENT_PROVIDER env var — without changing anything below it.


def get_provider():
    return StubProvider()


# Every paid plan runs on a 30-day cycle regardless of whether renewal
# ends up being automatic or manual — this only decides "how long does a
# payment cover," not "what happens when it charges again."
BILLING_PERIOD_DAYS = 30
TRIAL_DAYS = 2


def create_order(db: Session, user: User, plan_slug: str) -> Order:
    plan = db.query(Plan).filter(Plan.slug == plan_slug,
                                 Plan.is_active.is_(True)).first()
    if plan is None:
        raise HTTPException(404, f"No active plan with slug '{plan_slug}'")
    if plan.price_cents is None:
        raise HTTPException(
            400, f"'{plan.name}' has no price set — contact us for a custom quote")

    order = Order(
        id=uuid.uuid4(),
        user_id=user.id,
        plan_id=plan.id,
        amount_cents=plan.price_cents,
        currency=plan.currency,
        status="pending",
        provider="stub",
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def initiate_checkout(db: Session, user: User, plan_slug: str) -> dict:
    order = create_order(db, user, plan_slug)
    provider = get_provider()
    redirect_url = provider.initiate(order)
    return {"order_id": order.id, "redirect_url": redirect_url}


def mark_order_paid(db: Session, order_id: uuid.UUID) -> Order:
    """Called by the stub confirm route today; called by handle_webhook
    once a real provider is wired in — same function either way, since
    "an order became paid" means the same thing regardless of how we
    found out. Sets current_period_end 30 days out — the subscription
    expiry sweep (see subscription_expiry_service.py) downgrades back to
    Free once that date passes, regardless of how renewal eventually
    works.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(404, "Order not found")
    if order.status == "paid":
        return order  # idempotent — a provider may notify us more than once

    order.status = "paid"
    order.paid_at = datetime.now(timezone.utc)
    db.add(order)

    period_end = datetime.now(timezone.utc) + \
        timedelta(days=BILLING_PERIOD_DAYS)

    sub = db.query(UserSubscription).filter(
        UserSubscription.user_id == order.user_id).first()
    if sub:
        sub.plan_id = order.plan_id
        sub.status = "active"
        sub.current_period_end = period_end
    else:
        sub = UserSubscription(
            id=uuid.uuid4(),
            user_id=order.user_id,
            plan_id=order.plan_id,
            status="active",
            current_period_end=period_end,
        )
        db.add(sub)

    db.commit()
    db.refresh(order)
    return order


def mark_order_failed(db: Session, order_id: uuid.UUID) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(404, "Order not found")
    order.status = "failed"
    db.commit()
    db.refresh(order)
    return order


def handle_webhook(db: Session, raw_body: bytes, headers: dict) -> dict:
    """The real, provider-called endpoint (no logged-in user, no browser
    involved — the provider's own server calls this directly). Delegates
    signature verification and payload parsing entirely to the active
    provider via parse_webhook(), then applies the same mark_order_paid/
    mark_order_failed used by the stub confirm routes. Nothing here is
    provider-specific — swapping StubProvider for a real one is the only
    change needed to make this endpoint live for real.
    """
    provider = get_provider()
    result = provider.parse_webhook(raw_body, headers)

    order_id = uuid.UUID(result["order_reference"])
    if result["status"] == "paid":
        order = mark_order_paid(db, order_id)
    else:
        order = mark_order_failed(db, order_id)

    return {"order_id": order.id, "status": order.status}


def is_trial_eligible(db: Session, user: User) -> bool:
    """A user gets exactly one trial ever, regardless of which plan it
    was used on — has_used_trial is per-user, not per-plan, so cycling
    between plans can't be used to farm repeated trials."""
    sub = db.query(UserSubscription).filter(
        UserSubscription.user_id == user.id).first()
    return sub is None or not sub.has_used_trial


def start_trial(db: Session, user: User, plan_slug: str) -> UserSubscription:
    """No Order row is created — a trial involves no payment at all. Sets
    current_period_end TRIAL_DAYS out; the same subscription_expiry_service
    sweep already built for paid plans downgrades back to Free when it
    passes, so trial expiry needs no separate logic."""
    if not is_trial_eligible(db, user):
        raise HTTPException(409, "You've already used your free trial")

    plan = db.query(Plan).filter(Plan.slug == plan_slug,
                                 Plan.is_active.is_(True)).first()
    if plan is None:
        raise HTTPException(404, f"No active plan with slug '{plan_slug}'")
    if plan.price_cents is None:
        raise HTTPException(400, f"Trials aren't available for '{plan.name}'")

    period_end = datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)

    sub = db.query(UserSubscription).filter(
        UserSubscription.user_id == user.id).first()
    if sub:
        sub.plan_id = plan.id
        sub.status = "active"
        sub.current_period_end = period_end
        sub.has_used_trial = True
    else:
        sub = UserSubscription(
            id=uuid.uuid4(),
            user_id=user.id,
            plan_id=plan.id,
            status="active",
            current_period_end=period_end,
            has_used_trial=True,
        )
        db.add(sub)

    db.commit()
    db.refresh(sub)
    return sub


def get_my_subscription(db: Session, user: User) -> dict:
    """Powers the Settings page's My Subscription card. is_trial is
    inferred (not a stored flag): TRIAL_DAYS is short enough that a
    current_period_end within that window from "now" reliably indicates
    a trial rather than a just-started paid period (BILLING_PERIOD_DAYS
    is 30, far longer) — good enough for a display-only distinction,
    not used for any enforcement decision.
    """
    sub = db.query(UserSubscription).filter(
        UserSubscription.user_id == user.id).first()

    if sub is None:
        free_plan = db.query(Plan).filter(Plan.slug == "free").first()
        plan_slug = free_plan.slug if free_plan else "free"
        plan_name = free_plan.name if free_plan else "Free"
        current_period_end = None
        has_used_trial = False
        status = "active"
    else:
        plan_slug = sub.plan.slug
        plan_name = sub.plan.name
        current_period_end = sub.current_period_end
        has_used_trial = sub.has_used_trial
        status = sub.status

    is_trial = False
    if current_period_end is not None:
        remaining = current_period_end - datetime.now(timezone.utc)
        is_trial = remaining <= timedelta(days=TRIAL_DAYS)

    orders = (
        db.query(Order)
        .filter(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(20)
        .all()
    )
    order_items = [
        {
            "id": o.id,
            "plan_name": o.plan.name,
            "amount_cents": o.amount_cents,
            "currency": o.currency,
            "status": o.status,
            "created_at": o.created_at,
            "paid_at": o.paid_at,
        }
        for o in orders
    ]

    return {
        "plan_slug": plan_slug,
        "plan_name": plan_name,
        "status": status,
        "is_trial": is_trial,
        "current_period_end": current_period_end,
        "has_used_trial": has_used_trial,
        "orders": order_items,
    }
