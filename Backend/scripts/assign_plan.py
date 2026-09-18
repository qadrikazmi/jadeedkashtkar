"""Assign any user to any plan by slug, for testing.
Run with: python -m scripts.assign_plan you@example.com starter
Valid slugs: guest, free, starter, pro, enterprise, developer
"""
import sys
import uuid

from app.db.session import SessionLocal
from app.models.user import User
from app.models.plan import Plan
from app.models.user_subscription import UserSubscription


def main(email: str, plan_slug: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            print(f"No user with email {email}")
            return

        plan = db.query(Plan).filter(Plan.slug == plan_slug).first()
        if plan is None:
            print(
                f"No plan with slug '{plan_slug}'. Valid: guest, free, starter, pro, enterprise, developer")
            return

        sub = db.query(UserSubscription).filter(
            UserSubscription.user_id == user.id).first()
        if sub:
            sub.plan_id = plan.id
            sub.status = "active"
        else:
            sub = UserSubscription(
                id=uuid.uuid4(), user_id=user.id, plan_id=plan.id, status="active")
            db.add(sub)
        db.commit()
        print(f"{email} is now on the {plan.name} plan")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python -m scripts.assign_plan <email> <plan_slug>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
