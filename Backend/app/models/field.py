"""
Field model — a user's saved agricultural field polygon.

The `geometry` column stores the polygon as a real PostGIS geometry (not
raw JSON), using SRID 4326 (WGS84 lat/lng) — the same coordinate system
GeoJSON and ESRI's map use. Storing it this way means spatial queries
(overlap checks, area calculations, proximity searches for future modules)
can be done directly in Postgres via PostGIS functions instead of in
application code.

A Field is intentionally decoupled from NdviHistory (one-to-many) because a
single field will accumulate many NDVI readings over time as the user
revisits it — this is what the future "Historical Vegetation Analysis"
module will read from.
"""

import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from geoalchemy2 import Geometry
from sqlalchemy import Date, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# See app/models/user.py for why this is TYPE_CHECKING-guarded.
if TYPE_CHECKING:
    from app.models.user import User
    from app.models.ndvi_history import NdviHistory


class Field(Base):
    __tablename__ = "fields"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # SRID 4326 = WGS84, same as GeoJSON / ESRI map coordinates.
    geometry: Mapped[str] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326), nullable=False
    )

    area_hectares: Mapped[Optional[float]
                          ] = mapped_column(Float, nullable=True)

    # Used to look up a DistrictYieldBaseline row for crop health/yield
    # projection (see services/crop_health_service.py). Nullable — a field
    # without these falls back to the baseline table's DEFAULT row.
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    crop: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Used by services/fertilizer_recommendation_service.py to pick the
    # right SFRI tier and estimate crop stage. Nullable — irrigation_type
    # falls back to a district-based inference, sowing_date just means the
    # recommendation can't estimate stage/timing as precisely.
    irrigation_type: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True)
    sowing_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    owner: Mapped["User"] = relationship("User", back_populates="fields")

    # One field accumulates many NDVI readings over time.
    ndvi_history: Mapped[List["NdviHistory"]] = relationship(
        "NdviHistory", back_populates="field", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Field id={self.id} name={self.name} user_id={self.user_id}>"
