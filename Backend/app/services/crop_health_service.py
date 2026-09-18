"""
Crop health score.

Transparent baseline formula (flagged in GAPS.md for the agronomy team to
refine once real models exist):

    health_score = clamp(round(latest_ndvi_mean / baseline_ndvi * 100), 0, 100)

i.e. a field performing exactly at its district+crop's historical baseline
NDVI scores 100; below/above that scales proportionally, clamped to [0, 100].

Yield projection is intentionally not computed here — there is no validated
yield model yet, so we don't fabricate a t/ha number. DistrictYieldBaseline
still carries baseline_yield_* columns for when that model exists.
"""

import uuid
from typing import List, Optional

from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import FieldNotFoundError, BaselineNotFoundError
from app.models.district_yield_baseline import DistrictYieldBaseline
from app.models.field import Field
from app.models.ndvi_history import NdviHistory
from app.schemas.crop_health import CropHealthResponse, NdviTrendPoint

DEFAULT_DISTRICT = "DEFAULT"
DEFAULT_CROP = "DEFAULT"


def _healthy_status_label(health_score: int) -> str:
    if health_score >= 75:
        return "Healthy"
    if health_score >= 40:
        return "Stressed"
    return "Critical"


def _get_baseline(db: Session, district: Optional[str], crop: Optional[str]) -> Optional[DistrictYieldBaseline]:
    baseline = None
    if district and crop:
        baseline = (
            db.query(DistrictYieldBaseline)
            .filter(DistrictYieldBaseline.district == district, DistrictYieldBaseline.crop == crop)
            .first()
        )
    if baseline is None:
        baseline = (
            db.query(DistrictYieldBaseline)
            .filter(
                DistrictYieldBaseline.district == DEFAULT_DISTRICT,
                DistrictYieldBaseline.crop == DEFAULT_CROP,
            )
            .first()
        )
    # Note: this can still legitimately be None if even the DEFAULT/DEFAULT
    # fallback row hasn't been seeded — see BaselineNotFoundError below,
    # which is the actual bug currently in production (field.district /
    # field.crop had no matching row, AND the fallback seed row was never
    # inserted, so both queries returned None here).
    return baseline


def compute_health_score(latest_ndvi_mean: float, baseline_ndvi: float) -> int:
    raw = round((latest_ndvi_mean / baseline_ndvi) * 100)
    return max(0, min(100, raw))


def get_crop_health(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> CropHealthResponse:
    field = db.query(Field).filter(Field.id == field_id,
                                   Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    # satellite_image_date alone is day-granularity and, since re-analysis
    # can run more than once per day, no longer unique — computed_at breaks
    # ties by actual recency instead of leaving same-day order undefined.
    history_rows: List[NdviHistory] = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.asc(), NdviHistory.computed_at.asc())
        .all()
    )

    baseline = _get_baseline(db, field.district, field.crop)

    if baseline is None:
        # Previously this fell through to `baseline.baseline_ndvi` on a None
        # object, crashing with an unhandled AttributeError -> 500 -> the
        # browser reporting it as a CORS failure (Starlette's CORS
        # middleware doesn't attach headers to an unhandled-exception
        # response). Raising a named, catchable exception here instead lets
        # callers (e.g. ledger_service.build_report) decide how to degrade
        # gracefully — e.g. return null health/NDVI fields instead of 500ing
        # the whole report.
        #
        # Real fix: seed a DistrictYieldBaseline row with
        # district="DEFAULT", crop="DEFAULT" so this fallback always
        # resolves. This exception is a safety net, not a substitute for
        # that seed data existing.
        raise BaselineNotFoundError(
            f"No yield baseline found for district={field.district!r}, "
            f"crop={field.crop!r}, and no DEFAULT/DEFAULT fallback baseline "
            "is seeded."
        )

    if history_rows:
        latest_ndvi_mean = history_rows[-1].ndvi_mean
    else:
        # No analysis has completed yet — score against zero vegetation
        # signal rather than fabricating a number.
        latest_ndvi_mean = 0.0

    health_score = compute_health_score(
        latest_ndvi_mean, baseline.baseline_ndvi)

    return CropHealthResponse(
        field_id=str(field.id),
        health_score=health_score,
        status_label=_healthy_status_label(health_score),
        baseline_district=baseline.district,
        baseline_crop=baseline.crop,
        ndvi_trend=[
            NdviTrendPoint(date=row.satellite_image_date,
                           ndvi_mean=row.ndvi_mean)
            for row in history_rows
        ],
    )
