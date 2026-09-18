"""One-off: assign a user to the Developer (unlock-all) plan by email.
Run with: python -m scripts.assign_developer_plan you@example.com
"""
import sys
import uuid

from app.db.session import SessionLocal
from app.models.user import User
from app.models.plan import Plan
from app.models.user_subscription import UserSubscription


def main(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            print(f"No user with email {email}")
            return

        plan = db.query(Plan).filter(Plan.slug == "developer").first()
        if plan is None:
            print("Developer plan not found — run the migration first")
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
        print(f"{email} is now on the Developer plan")
    finally:
        db.close()


if __name__ == "__main__":
    main(sys.argv[1])
