"""
One-shot, unauthenticated "guest" analysis for the landing page. Reuses
the exact same Sentinel-2/NDVI pipeline the logged-in app uses
(compute_ndvi_periods) instead of a separate implementation, so results
are consistent with the real product. Auto-picks the most recent
cloud-free scene within a fixed 30-day lookback instead of asking the
guest to choose a date, index, or cloud threshold — see AnalysisPanel.jsx.
"""
import uuid
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.guest_usage import GuestUsage
from app.models.plan import Plan
from app.services.geometry_validator import calculate_area_hectares, validate_polygon
from app.services.satellite.ndvi_processor import compute_ndvi_periods

LOOKBACK_DAYS = 30
INDEX_KEYS = ["ndvi", "ndmi", "ndre", "nbr2", "ndwi", "cci", "evi", "savi"]

# Used only if the "guest" plan row is somehow missing, so guests can't
# bypass the gate entirely if the plans table is misconfigured.
GUEST_LIMIT_FALLBACK = 1


def _get_guest_limit(db: Session) -> int:
    guest_plan = db.query(Plan).filter(Plan.slug == "guest").first()
    if guest_plan is None:
        return GUEST_LIMIT_FALLBACK

    max_fields = guest_plan.features.get("max_fields")
    if max_fields is None:
        # None means "unlimited" for logged-in plans, but that meaning
        # doesn't make sense for an anonymous guest gate — treat an
        # explicit null the same as "not configured" and fall back.
        return GUEST_LIMIT_FALLBACK
    return max_fields


def check_guest_usage(db: Session, anon_id: str) -> None:
    """Raises 403 if this anon_id has already used up its guest allowance.
    Does NOT record a new usage — call record_guest_usage separately,
    and only after the analysis actually succeeds. Splitting these two
    steps (instead of one check-and-record call before the analysis even
    runs) means a failed/errored attempt — e.g. no cloud-free imagery
    found, or a transient error — no longer permanently burns the guest's
    one-time allowance."""
    guest_limit = _get_guest_limit(db)

    used_count = db.query(GuestUsage).filter(
        GuestUsage.anon_id == anon_id).count()

    if used_count >= guest_limit:
        raise HTTPException(
            403,
            "You've already used your free analysis. Sign up to keep analyzing your fields.",
        )


def record_guest_usage(db: Session, anon_id: str) -> None:
    db.add(GuestUsage(id=uuid.uuid4(), anon_id=anon_id))
    db.commit()


def quick_analyze(polygon_geojson) -> dict:
    shapely_polygon = validate_polygon(polygon_geojson)
    area_hectares = calculate_area_hectares(shapely_polygon)

    end_date = date.today()
    start_date = end_date - timedelta(days=LOOKBACK_DAYS)

    latest_result = None
    for result in compute_ndvi_periods(
        shapely_polygon,
        area_hectares=area_hectares,
        start_date=start_date,
        end_date=end_date,
    ):
        latest_result = result  # keep the most recent period yielded

    if latest_result is None:
        raise HTTPException(
            404,
            f"No cloud-free Sentinel-2 imagery found for this area in the last {LOOKBACK_DAYS} days.",
        )

    indices = {
        "ndvi": {
            "mean": latest_result.stats.mean,
            "min": latest_result.stats.min,
            "max": latest_result.stats.max,
        }
    }
    for key in INDEX_KEYS[1:]:
        stats = getattr(latest_result, f"{key}_stats", None)
        indices[key] = {
            "mean": stats.mean if stats else None,
            "min": stats.min if stats else None,
            "max": stats.max if stats else None,
        }

    return {
        "image_date": latest_result.source.date_range_end,
        "cloud_cover_percent": latest_result.source.max_cloud_cover_filter_percent,
        "area_hectares": area_hectares,
        "indices": indices,
    }
