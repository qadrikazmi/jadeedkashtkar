import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    discount_percent: Mapped[Optional[int]
                             ] = mapped_column(Integer, nullable=True)
    plan_slug: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True)  # null = all plans
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    def __repr__(self) -> str:
        return f"<Announcement {self.message[:30]}>"
