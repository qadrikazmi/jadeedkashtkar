"""
NdviJob model — tracks one background NDVI/NDMI analysis run for a Field.

A dedicated table (rather than a generic `jobs` table with a JSON payload)
because the job's input (field_id) and output (ndvi_history_id) are both
real foreign keys here — that keeps referential integrity and lets callers
query "give me the history row this job produced" directly, instead of
parsing a blob. If a second async job type is needed later (e.g. scan
inference), it gets its own small table the same way.
"""

import enum
import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.field import Field
    from app.models.ndvi_history import NdviHistory


class NdviJobStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"


class NdviJob(Base):
    __tablename__ = "ndvi_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True
    )

    status: Mapped[NdviJobStatus] = mapped_column(
        SAEnum(NdviJobStatus, name="ndvi_job_status", native_enum=True),
        default=NdviJobStatus.pending,
        nullable=False,
    )
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # The date window this job was asked to use — NULL on both means "used
    # the global NDVI_SEARCH_WINDOW_DAYS default", not a redundant copy of it.
    requested_start_date: Mapped[Optional[date]] = mapped_column(nullable=True)
    requested_end_date: Mapped[Optional[date]] = mapped_column(nullable=True)

    # Set once the job finishes successfully — points at the NdviHistory row
    # it produced. SET NULL (not CASCADE) so deleting a history row later
    # doesn't cascade-delete the job record of how it was produced.
    ndvi_history_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ndvi_history.id", ondelete="SET NULL"), nullable=True
    )

    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    field: Mapped["Field"] = relationship("Field")
    ndvi_history: Mapped[Optional["NdviHistory"]] = relationship("NdviHistory")

    def __repr__(self) -> str:
        return f"<NdviJob id={self.id} field_id={self.field_id} status={self.status}>"
