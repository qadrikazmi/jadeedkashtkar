"""
Downgrades expired paid subscriptions back to Free. Runs on a recurring
schedule (see main.py's BackgroundScheduler — same mechanism already
used for run_alert_sweep) rather than being checked on every request,
matching this project's existing pattern for background maintenance work.

Only subscriptions with a current_period_end set are ever touched — Free
and Developer subscriptions never get one (see mark_order_paid), so this
never accidentally "expires" a plan that was never actually purchased.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.plan import Plan
from app.models.user_subscription import UserSubscription

logger = logging.getLogger("app")


def downgrade_expired_subscriptions(db: Session) -> int:
    """Returns the number of subscriptions downgraded, for logging."""
    free_plan = db.query(Plan).filter(Plan.slug == "free").first()
    if free_plan is None:
        logger.error(
            "downgrade_expired_subscriptions: no 'free' plan found — skipping sweep")
        return 0

    now = datetime.now(timezone.utc)
    expired = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.status == "active",
            UserSubscription.current_period_end.isnot(None),
            UserSubscription.current_period_end < now,
        )
        .all()
    )

    for sub in expired:
        sub.plan_id = free_plan.id
        sub.current_period_end = None
        sub.status = "active"  # still an active *subscription*, just on Free now
        db.add(sub)

    if expired:
        db.commit()
        logger.info(
            f"downgrade_expired_subscriptions: downgraded {len(expired)} subscription(s) to Free")

    return len(expired)


def run_subscription_expiry_sweep() -> None:
    """Entry point for the scheduler — opens/closes its own session, same
    pattern as run_ndvi_job/run_alert_sweep, since this runs outside any
    request's lifecycle."""
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        downgrade_expired_subscriptions(db)
    except Exception:
        logger.error(
            "run_subscription_expiry_sweep failed unexpectedly", exc_info=True)
        db.rollback()
    finally:
        db.close()
