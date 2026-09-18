"""
DroneCaptureBand — one uploaded file inside a DroneCapture, tagged with
what kind of light it measures. Index computation looks at which band
types are present in a capture to decide which indices it can compute.
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.drone_capture import DroneCapture

# "unknown" = user hasn't tagged it yet (or picked "Not sure") — bands in
# this state are excluded from index computation until tagged, never
# guessed at silently.
BAND_TYPES = ("rgb", "nir", "red_edge", "swir1", "swir2", "thermal", "unknown")


class DroneCaptureBand(Base):
    __tablename__ = "drone_capture_bands"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    capture_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drone_captures.id", ondelete="CASCADE"), nullable=False, index=True
    )

    band_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown")
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(
        String, nullable=False)  # raw upload, under static/

    # Tiling — only ever populated for band_type="rgb" (the one shown
    # visually on the Fields map, full extent, uncropped). Other band
    # types (NIR, Red Edge, etc.) are only ever used for index math, never
    # displayed, so these stay NULL for them.
    cog_path = mapped_column(String, nullable=True)
    # rectangular [[lng,lat], ...] x4
    bounds = mapped_column(JSON, nullable=True)
    # real jagged boundary, same technique as DroneImagery
    footprint = mapped_column(JSON, nullable=True)
    tile_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending")
    tile_error_message = mapped_column(String, nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    capture: Mapped["DroneCapture"] = relationship(
        "DroneCapture", back_populates="bands")

    def __repr__(self) -> str:
        return f"<DroneCaptureBand id={self.id} band_type={self.band_type}>"
