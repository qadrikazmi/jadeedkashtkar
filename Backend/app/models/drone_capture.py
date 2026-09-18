"""
DroneCapture — a labeled container for one drone flight over a field.

Files (RGB, NIR, Red Edge, etc.) uploaded for a field get grouped into a
DroneCapture rather than treated as loose files — this lets a user upload
bands separately (even days apart) and still have them combined into one
set of vegetation index results once enough tagged bands are present.
"""

import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Date, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.drone_capture_band import DroneCaptureBand
    from app.models.field import Field


class DroneCapture(Base):
    __tablename__ = "drone_captures"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    # Optional friendly label, e.g. "Flight - Aug 26". Falls back to the
    # capture_date in the UI if not set.
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    capture_date: Mapped[date] = mapped_column(Date, nullable=False)

    # "collecting"  -> waiting for enough tagged bands to compute anything
    # "processing"  -> background index computation running
    # "done"        -> indices written into NdviHistory (see ndvi_history_id)
    # "failed"      -> see error_message
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="collecting")
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Points at the NdviHistory row this capture's results were written to,
    # once computed — lets the UI jump straight from a capture to its result.
    ndvi_history_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ndvi_history.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    field: Mapped["Field"] = relationship("Field")
    bands: Mapped[List["DroneCaptureBand"]] = relationship(
        "DroneCaptureBand", back_populates="capture", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<DroneCapture id={self.id} field_id={self.field_id} status={self.status}>"
