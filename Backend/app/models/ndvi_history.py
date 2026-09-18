"""
NdviHistory model — one row per (field, satellite image date, source), written by
the background analysis job (see services/ndvi_job_service.py's
run_ndvi_job/upsert_history_row) rather than a synchronous save.

Kept separate from Field (rather than storing "latest NDVI" columns on
Field itself) because a field will be re-analyzed repeatedly over time.
This table is what the future "Historical Vegetation Analysis" module
queries directly — no schema change needed when that module is built.

source_collection distinguishes where a row's data came from — a Sentinel-2
collection name (e.g. "sentinel-2-l2a") for satellite rows, or the literal
string "drone" for rows written by drone capture index computation (see
services/drone_capture_service.py). This also participates in the unique
constraint below so a drone capture and a satellite pass on the same date
for the same field don't collide/overwrite each other.
"""

import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# See app/models/user.py for why this is TYPE_CHECKING-guarded.
if TYPE_CHECKING:
    from app.models.field import Field


class NdviHistory(Base):
    __tablename__ = "ndvi_history"
    __table_args__ = (
        # One row per field, per date, per data source. Previously just
        # (field_id, satellite_image_date) — extended to include
        # source_collection so a drone capture and a satellite pass on the
        # same date for the same field can coexist instead of overwriting
        # each other. See migration notes in the handoff for this change.
        UniqueConstraint("field_id", "satellite_image_date", "source_collection",
                         name="uq_ndvi_history_field_id_date_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True
    )

    ndvi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndvi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndvi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # NDMI (moisture index) computed from the same scene/date window as the
    # NDVI stats above. Nullable because rows written before NDMI support
    # was added won't have these — and drone-sourced rows will also leave
    # this NULL, since drones essentially never carry the SWIR sensor NDMI
    # requires.
    ndmi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndmi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndmi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # NDRE (red-edge / nitrogen) and NBR2 (residue / burn), same scene as the
    # stats above. Nullable for the same reason as NDMI — rows written before
    # these indices existed have no value to backfill. Drone rows populate
    # NDRE only if a Red Edge band was tagged in that capture; NBR2 is left
    # NULL for drone (needs two SWIR bands, essentially never available).
    ndre_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndre_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndre_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nbr2_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nbr2_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nbr2_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # NDWI (open water), CCI (chlorophyll/carotenoid), EVI, SAVI — same scene,
    # same nullable-for-back-compat treatment. Drone rows populate NDWI/EVI/
    # SAVI whenever RGB+NIR are present, and CCI only if Red Edge is present.
    ndwi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndwi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndwi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cci_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cci_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cci_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    evi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    evi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    evi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    savi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    savi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    savi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # RGB-only indices — only ever populated for drone rows where the
    # capture had RGB but no NIR band tagged. These are real, valid
    # indicators computed from visible light alone (ExG, VARI, GLI), never
    # a fake substitute for NDVI — if NIR is present, the real NDVI family
    # above is used instead and these stay NULL.
    exg_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exg_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exg_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vari_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vari_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vari_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gli_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gli_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gli_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exg_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    vari_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    gli_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Absolute URLs to the rendered overlay PNGs (see
    # services/satellite/visualization.py), so history rows are
    # self-sufficient for the trend chart's map thumbnails without
    # recomputing anything.
    ndvi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ndmi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ndre_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    nbr2_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ndwi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cci_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    evi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    savi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Start of the requested search window (end is satellite_image_date
    # below). Nullable because rows written before this column existed have
    # no recoverable value — leave those NULL rather than guessing. For
    # drone rows, this is just set equal to satellite_image_date (a drone
    # capture is a single date, not a search window).
    date_range_start: Mapped[Optional[date]] = mapped_column(nullable=True)

    # Date of the source image used for this computation (not when we
    # computed it — that's computed_at below). For drone rows, this is the
    # capture's flight date, not the upload date.
    satellite_image_date: Mapped[date] = mapped_column(nullable=False)
    cloud_cover_percent: Mapped[Optional[float]
                                ] = mapped_column(Float, nullable=True)

    # Which data source this came from — a Sentinel-2 collection name for
    # satellite rows (e.g. "COPERNICUS/S2_SR_HARMONIZED"), or the literal
    # string "drone" for rows written by drone capture index computation.
    # Also part of the unique constraint above.
    source_collection: Mapped[str] = mapped_column(String(255), nullable=False)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    field: Mapped["Field"] = relationship(
        "Field", back_populates="ndvi_history")

    def __repr__(self) -> str:
        return f"<NdviHistory id={self.id} field_id={self.field_id} mean={self.ndvi_mean}>"
