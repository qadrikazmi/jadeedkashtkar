import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GuestUsage(Base):
    """One row per browser (keyed on the X-Anon-Id header client.js
    already sends on every unauthenticated request) that has used its one
    free landing-page analysis. A second attempt from the same anon_id is
    blocked (see quick_analysis_service.check_and_record_guest_usage)."""
    __tablename__ = "guest_usage"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    anon_id: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False)
    used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    def __repr__(self) -> str:
        return f"<GuestUsage anon_id={self.anon_id}>"
