"""
Background NDVI/NDMI analysis job orchestration.

POST /fields creates the Field row and a `pending` NdviJob row in the same
request/transaction, then hands off to `run_ndvi_job` via FastAPI's
BackgroundTasks. `run_ndvi_job` runs *after* the HTTP response has already
been sent, so it cannot reuse the request-scoped `Depends(get_db)` session
(that generator would already be closed) — it opens and closes its own
SessionLocal() instead, mirroring the same lifecycle by hand.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from geoalchemy2.shape import from_shape, to_shape
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.exceptions.custom_exceptions import FieldNotFoundError, JobNotFoundError
from app.models.field import Field
from app.models.ndvi_history import NdviHistory
from app.models.ndvi_job import NdviJob, NdviJobStatus
from app.schemas.field import (
    CropHealthResponse,
    FieldCreateRequest,
    FieldNdviLatestResponse,
    FieldUpdateRequest,
    NdviHistoryItem,
    NdviTrendPoint,
)
from app.schemas.ndvi_job import FieldReanalyzeRequest
from app.schemas.ndvi import NdviAnalyzeResponse
from app.services.field_service import get_field_or_404
from app.services.geometry_validator import calculate_area_hectares, validate_polygon
from app.services.satellite.ndvi_processor import compute_ndvi_periods, compute_weekly_tiles

logger = logging.getLogger("app")


def create_field_with_job(
    db: Session, user_id: uuid.UUID, field_in: FieldCreateRequest
) -> Tuple[Field, NdviJob]:
    shapely_polygon = validate_polygon(field_in.geometry)
    area_hectares = calculate_area_hectares(shapely_polygon)
    postgis_geometry = from_shape(shapely_polygon, srid=4326)

    field = Field(
        user_id=user_id,
        name=field_in.name,
        geometry=postgis_geometry,
        area_hectares=area_hectares,
        district=field_in.district,
        crop=field_in.crop,
        irrigation_type=field_in.irrigation_type,
        sowing_date=field_in.sowing_date,
    )
    db.add(field)
    db.flush()

    job = NdviJob(
        field_id=field.id,
        status=NdviJobStatus.pending,
        requested_start_date=field_in.start_date,
        requested_end_date=field_in.end_date,
    )
    db.add(job)

    db.commit()
    db.refresh(field)
    db.refresh(job)
    return field, job


def create_field_ephemeral(field_in: FieldCreateRequest) -> dict:
    """
    Free-tier path: runs the same real Sentinel-2/NDVI analysis as
    create_field_with_job, but entirely synchronously (no NdviJob row,
    no background task — there's nothing to persist, so nothing to poll).
    Returns the full result directly in one response. Nothing here ever
    touches the database; the caller is responsible for holding this in
    memory only, per the Free-tier "session-only" spec.
    """
    shapely_polygon = validate_polygon(field_in.geometry)
    area_hectares = calculate_area_hectares(shapely_polygon)

    history: list[dict] = []
    for result in compute_ndvi_periods(
        shapely_polygon,
        area_hectares=area_hectares,
        start_date=field_in.start_date,
        end_date=field_in.end_date,
    ):
        fields = _history_fields(result)
        history.append({
            "id": uuid.uuid4(),
            **fields,
            "computed_at": datetime.now(timezone.utc),
        })

    now = datetime.now(timezone.utc)
    return {
        "field": {
            "id": str(uuid.uuid4()),
            "name": field_in.name,
            "geometry": field_in.geometry,
            "area_hectares": area_hectares,
            "district": field_in.district,
            "crop": field_in.crop,
            "irrigation_type": field_in.irrigation_type,
            "sowing_date": field_in.sowing_date,
            "created_at": now,
            "updated_at": now,
        },
        "persisted": False,
        "history": history,
    }


def update_field(
    db: Session,
    user_id: uuid.UUID,
    field_id: uuid.UUID,
    field_in: FieldUpdateRequest,
) -> Tuple[Field, Optional[NdviJob]]:
    """
    Metadata-only update  →  returns (field, None)
    Geometry change       →  validates + recomputes area exactly like create_field_with_job,
                             hard-deletes all existing NdviHistory for the field,
                             creates a new pending NdviJob, returns (field, job)
    """
    field = get_field_or_404(db, user_id, field_id)

    geometry_changed = field_in.geometry is not None

    if geometry_changed:
        shapely_polygon = validate_polygon(field_in.geometry)
        area_hectares = calculate_area_hectares(shapely_polygon)
        postgis_geometry = from_shape(shapely_polygon, srid=4326)

        field.geometry = postgis_geometry
        field.area_hectares = area_hectares

        db.query(NdviHistory).filter(NdviHistory.field_id == field.id).delete(
            synchronize_session=False
        )

        job = NdviJob(
            field_id=field.id,
            status=NdviJobStatus.pending,
            requested_start_date=field_in.start_date,
            requested_end_date=field_in.end_date,
        )
        db.add(job)
    else:
        job = None

    if field_in.name is not None:
        field.name = field_in.name
    if field_in.district is not None:
        field.district = field_in.district
    if field_in.crop is not None:
        field.crop = field_in.crop
    if field_in.irrigation_type is not None:
        field.irrigation_type = field_in.irrigation_type
    if field_in.sowing_date is not None:
        field.sowing_date = field_in.sowing_date

    db.commit()
    db.refresh(field)
    if job is not None:
        db.refresh(job)

    return field, job


def create_reanalysis_job(db: Session, field: Field, body: FieldReanalyzeRequest) -> NdviJob:
    job = NdviJob(
        field_id=field.id,
        status=NdviJobStatus.pending,
        requested_start_date=body.start_date,
        requested_end_date=body.end_date,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


JOB_STALE_AFTER_FLOOR = timedelta(minutes=20)
JOB_STALE_AFTER_PER_TILE = timedelta(seconds=90)


def _job_stale_after(job: NdviJob) -> timedelta:
    if job.requested_start_date is None or job.requested_end_date is None:
        return JOB_STALE_AFTER_FLOOR
    tile_count = len(compute_weekly_tiles(
        job.requested_start_date, job.requested_end_date))
    return max(JOB_STALE_AFTER_FLOOR, JOB_STALE_AFTER_PER_TILE * tile_count)


def get_job_or_404(db: Session, job_id: uuid.UUID) -> NdviJob:
    job = db.query(NdviJob).filter(NdviJob.id == job_id).first()
    if job is None:
        raise JobNotFoundError()
    stale_after = _job_stale_after(job)
    if (
        job.status == NdviJobStatus.running
        and job.started_at is not None
        and datetime.now(timezone.utc) - job.started_at > stale_after
    ):
        logger.error(
            f"NDVI job {job_id} stuck in running past {stale_after}; marking failed")
        _fail_job(db, job, "Analysis timed out")
    return job


def _fail_job(db: Session, job: NdviJob, message: str) -> None:
    job.status = NdviJobStatus.failed
    job.error_message = message
    job.finished_at = datetime.now(timezone.utc)
    db.commit()


def _history_fields(result: NdviAnalyzeResponse) -> dict:
    fields: dict = {
        "ndvi_mean": result.stats.mean,
        "ndvi_min": result.stats.min,
        "ndvi_max": result.stats.max,
        "ndvi_png_url": result.visualization.image_url,
        "date_range_start": result.source.date_range_start,
        "satellite_image_date": result.source.date_range_end,
        "cloud_cover_percent": result.source.max_cloud_cover_filter_percent,
        "source_collection": result.source.collection,
    }
    # NOTE: was missing "exg", "vari", "gli" here — those three indices are
    # genuinely computed by compute_ndvi/_build_index_response for every
    # scene (satellite or drone), but this loop only ever copied the old
    # index set onto the history dict, so exg_mean/vari_mean/gli_mean (and
    # their *_png_url columns) never got set and stayed NULL in the DB —
    # that's why they rendered as "—" in the UI even though the backend was
    # calculating them correctly.
    for key in ("ndmi", "ndre", "nbr2", "ndwi", "cci", "evi", "savi", "exg", "vari", "gli"):
        stats = getattr(result, f"{key}_stats", None)
        vis = getattr(result, f"{key}_visualization", None)
        if stats is not None:
            fields[f"{key}_mean"] = stats.mean
            fields[f"{key}_min"] = stats.min
            fields[f"{key}_max"] = stats.max
        if vis is not None:
            fields[f"{key}_png_url"] = vis.image_url
    return fields


def upsert_history_row(db: Session, field_id: uuid.UUID, fields: dict) -> uuid.UUID:
    """
    fields["source_collection"] must always be set by the caller — a
    Sentinel-2 collection name for satellite rows (see _history_fields
    above) or the literal string "drone" for drone-capture rows (see
    drone_index_service.compute_capture_indices). Both the pre-check lookup
    and the ON CONFLICT clause below filter/match on it, so a satellite row
    and a drone row on the same (or overlapping) date never collide or
    silently overwrite each other — matches the real 3-column unique
    constraint on ndvi_history (uq_ndvi_history_field_id_date_source).
    """
    window_start = fields.get(
        "date_range_start", fields["satellite_image_date"])
    window_end = fields["satellite_image_date"]
    source_collection = fields["source_collection"]
    existing_start = func.coalesce(
        NdviHistory.date_range_start, NdviHistory.satellite_image_date)
    existing = (
        db.query(NdviHistory)
        .filter(
            NdviHistory.field_id == field_id,
            NdviHistory.source_collection == source_collection,
            NdviHistory.satellite_image_date >= window_start,
            existing_start <= window_end,
        )
        .order_by(NdviHistory.satellite_image_date.asc())
        .first()
    )
    if existing is not None:
        for key, value in fields.items():
            if key != "satellite_image_date":
                setattr(existing, key, value)
        existing.computed_at = datetime.now(timezone.utc)
        db.commit()
        return existing.id

    stmt = (
        pg_insert(NdviHistory)
        .values(field_id=field_id, **fields)
        .on_conflict_do_update(
            index_elements=[NdviHistory.field_id,
                            NdviHistory.satellite_image_date,
                            NdviHistory.source_collection],
            set_={**fields, "computed_at": datetime.now(timezone.utc)},
        )
        .returning(NdviHistory.id)
    )
    history_id = db.execute(stmt).scalar_one()
    db.commit()
    return history_id


def run_ndvi_job(job_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        job = db.query(NdviJob).filter(NdviJob.id == job_id).first()
        if job is None:
            logger.error(
                f"NDVI job {job_id} not found when background task ran")
            return

        job.status = NdviJobStatus.running
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        field = db.query(Field).filter(Field.id == job.field_id).first()
        if field is None:
            _fail_job(db, job, "Field no longer exists")
            return

        polygon = to_shape(field.geometry)

        first_history_id = None
        try:
            for result in compute_ndvi_periods(
                polygon,
                area_hectares=field.area_hectares,
                start_date=job.requested_start_date,
                end_date=job.requested_end_date,
            ):
                if db.query(Field).filter(Field.id == field.id).first() is None:
                    logger.info(
                        f"NDVI job {job_id}: field {field.id} deleted mid-analysis; stopping")
                    return
                history_id = upsert_history_row(
                    db, field.id, _history_fields(result))
                if first_history_id is None:
                    first_history_id = history_id
        except Exception as e:
            logger.error(
                f"NDVI job {job_id} analysis failed: {e}", exc_info=True)
            if first_history_id is None:
                _fail_job(db, job, str(e))
                return

        if first_history_id is None:
            _fail_job(
                db, job, "No cloud-free Sentinel-2 imagery found for this area/window")
            return

        job.ndvi_history_id = first_history_id
        job.status = NdviJobStatus.done
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        logger.error(f"NDVI job {job_id} failed unexpectedly", exc_info=True)
        db.rollback()
        try:
            job = db.query(NdviJob).filter(NdviJob.id == job_id).first()
            if job is not None:
                _fail_job(db, job, "Unexpected internal error")
        except Exception:
            db.rollback()
    finally:
        db.close()


def get_job_history_items(db: Session, job: NdviJob) -> list[NdviHistory]:
    if job.status != NdviJobStatus.done or job.started_at is None:
        return []
    return (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == job.field_id, NdviHistory.computed_at >= job.started_at)
        .order_by(NdviHistory.satellite_image_date.asc())
        .all()
    )


def get_field_ndvi(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> FieldNdviLatestResponse:
    field = db.query(Field).filter(Field.id == field_id,
                                   Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    history_rows = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.asc(), NdviHistory.computed_at.asc())
        .all()
    )
    history_items = [NdviHistoryItem.model_validate(
        row) for row in history_rows]
    latest = history_items[-1] if history_items else None
    return FieldNdviLatestResponse(latest=latest, history=history_items)


# --- Crop health summary (GET /fields/{field_id}/crop-health) ---
HEALTHY_NDVI_THRESHOLD = 0.6
STRESSED_NDVI_THRESHOLD = 0.3


def _status_label(ndvi_mean: float | None) -> str:
    if ndvi_mean is None:
        return "No data"
    if ndvi_mean >= HEALTHY_NDVI_THRESHOLD:
        return "Healthy"
    if ndvi_mean >= STRESSED_NDVI_THRESHOLD:
        return "Stressed"
    return "Critical"


def get_field_crop_health(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> CropHealthResponse:
    field = db.query(Field).filter(Field.id == field_id,
                                   Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    history_rows = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.asc())
        .all()
    )

    # The summary card is specifically an NDVI-based score — a reading
    # with no NDVI at all (e.g. an RGB-only drone capture computing
    # ExG/VARI/GLI instead) is real, valid data and still belongs in the
    # trend list below, but it shouldn't blank the health card just
    # because it happens to sort as the chronologically last row. Pick
    # the latest row that actually HAS an ndvi_mean; fall back to "No
    # data" only if none of the field's history has one at all.
    ndvi_rows = [r for r in history_rows if r.ndvi_mean is not None]
    latest = ndvi_rows[-1] if ndvi_rows else None
    latest_ndvi = latest.ndvi_mean if latest is not None else None
    health_score = (
        round(max(0.0, min(1.0, latest_ndvi)) * 100, 1)
        if latest_ndvi is not None
        else 0.0
    )

    return CropHealthResponse(
        field_id=field_id,
        health_score=health_score,
        status_label=_status_label(latest_ndvi),
        ndvi_trend=[
            NdviTrendPoint(
                satellite_image_date=row.satellite_image_date,
                ndvi_mean=row.ndvi_mean,
            )
            for row in history_rows
        ],
    )
