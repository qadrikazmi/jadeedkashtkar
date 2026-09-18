"""
Scan — a persisted disease-scanner result. Not tied to a field at scan
time (the design's scanner is a standalone flow); "Log to ledger" attaches
it to a field by creating a LedgerEntry (category=Scan) at that point,
matching the design's `logScanToLedger` action.
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ARRAY, Boolean, DateTime, Float, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    image_url: Mapped[str] = mapped_column(String, nullable=False)

    disease: Mapped[str] = mapped_column(String(255), nullable=False)
    latin_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True)
    confidence_pct: Mapped[float] = mapped_column(Float, nullable=False)
    breakdown: Mapped[list] = mapped_column(JSON, nullable=False)
    mitigations: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False)
    demo_mode: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<Scan id={self.id} disease={self.disease}>"
