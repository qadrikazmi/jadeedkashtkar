"""
DistrictYieldBaseline — reference table of expected NDVI and yield for a
given district+crop, used as the baseline that the health score and yield
projection (see services/crop_health_service.py) scale against.

This is curated reference data seeded via an Alembic data migration, not
something users create through the API. A ("DEFAULT", "DEFAULT") row is always seeded so a
field missing district/crop (or naming one the table doesn't have yet)
still gets a sane fallback instead of a 404.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DistrictYieldBaseline(Base):
    __tablename__ = "district_yield_baseline"
    __table_args__ = (
        UniqueConstraint("district", "crop",
                         name="uq_district_yield_baseline_district_crop"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    district: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True)
    crop: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    baseline_ndvi: Mapped[float] = mapped_column(Float, nullable=False)
    baseline_yield_maund_per_acre: Mapped[float] = mapped_column(
        Float, nullable=False)
    baseline_yield_t_per_ha: Mapped[float] = mapped_column(
        Float, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<DistrictYieldBaseline district={self.district} crop={self.crop}>"
