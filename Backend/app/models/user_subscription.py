import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.plan import Plan


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="active", nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)
    payment_provider: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True)
    payment_reference: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True)
    has_used_trial: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False)

    plan: Mapped["Plan"] = relationship("Plan")

    def __repr__(self) -> str:
        return f"<UserSubscription user_id={self.user_id} plan_id={self.plan_id}>"
