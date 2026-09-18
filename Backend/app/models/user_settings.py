"""
UserSettings model — one row per user (1:1), holding preferences that were
previously only client-side state in the design mock: language, yield
units, and the alert toggles shown in Settings.

Kept as its own table (rather than columns on User) so profile/auth
concerns stay separate from app preferences — User only needs to change
when auth requirements change, not when a new preference is added.
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    language: Mapped[str] = mapped_column(
        String(8), default="en", nullable=False)
    yield_unit: Mapped[str] = mapped_column(
        String(32), default="maund_per_acre", nullable=False)

    # Alert toggles — the alert engine (see services/alert_engine.py) checks
    # these before creating an Alert for a user's field. alert_sms is stored
    # for schema completeness but has no delivery effect yet — SMS is out of
    # scope per GAPS.md.
    alert_pest: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False)
    alert_weather: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False)
    alert_sms: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<UserSettings user_id={self.user_id} language={self.language}>"
