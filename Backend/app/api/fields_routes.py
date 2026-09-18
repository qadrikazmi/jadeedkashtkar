import uuid
from fastapi import Response
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from app.services.vegetation_report_service import build_vegetation_report_docx
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.field import (
    CropHealthResponse,
    FieldCreateEphemeralResponse,
    FieldCreateRequest,
    FieldCreateResponse,
    FieldListItem,
    FieldNdviLatestResponse,
    FieldResponse,
    FieldUpdateRequest,
    FieldUpdateResponse,
    NdviHistoryItem,
)
from app.schemas.ndvi_job import FieldReanalyzeRequest, NdviJobStatusResponse
from app.services.field_service import (
    delete_field,
    field_to_response,
    get_field_or_404,
    list_fields_for_user,
)
from app.services.ndvi_job_service import (
    create_field_ephemeral,
    create_field_with_job,
    create_reanalysis_job,
    get_field_crop_health,
    get_field_ndvi,
    get_job_history_items,
    get_job_or_404,
    run_ndvi_job,
    update_field,
)
from app.services.plan_service import enforce_date_range_limit, get_user_plan, should_persist_fields

router = APIRouter(prefix="/fields", tags=["Fields"])


@router.post("", status_code=201)
def create_field(
    field_in: FieldCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = get_user_plan(db, current_user.id)
    enforce_date_range_limit(plan, field_in.start_date, field_in.end_date)

    if not should_persist_fields(plan):
        result = create_field_ephemeral(field_in)
        return FieldCreateEphemeralResponse(**result)

    field, job = create_field_with_job(db, current_user.id, field_in)
    background_tasks.add_task(run_ndvi_job, job.id)
    return FieldCreateResponse(field=field_to_response(field), job_id=job.id)


@router.get("", response_model=list[FieldListItem])
def list_fields(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_fields_for_user(db, current_user.id)


@router.get("/{field_id}", response_model=FieldResponse)
def get_field(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    field = get_field_or_404(db, current_user.id, field_id)
    return field_to_response(field)


@router.patch("/{field_id}", response_model=FieldUpdateResponse)
def update_field_endpoint(
    field_id: uuid.UUID,
    field_in: FieldUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = get_user_plan(db, current_user.id)
    enforce_date_range_limit(plan, field_in.start_date, field_in.end_date)

    field, job = update_field(db, current_user.id, field_id, field_in)

    if job is not None:
        background_tasks.add_task(run_ndvi_job, job.id)

    return FieldUpdateResponse(
        field=field_to_response(field),
        job_id=job.id if job is not None else None,
    )


@router.delete("/{field_id}", status_code=204)
def delete_field_endpoint(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    delete_field(db, current_user.id, field_id)


@router.get("/{field_id}/jobs/{job_id}", response_model=NdviJobStatusResponse)
def get_field_job(
    field_id: uuid.UUID,
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_field_or_404(db, current_user.id, field_id)
    job = get_job_or_404(db, job_id)
    response = NdviJobStatusResponse.model_validate(job)
    response.history = [NdviHistoryItem.model_validate(
        row) for row in get_job_history_items(db, job)]
    return response


@router.get("/{field_id}/ndvi", response_model=FieldNdviLatestResponse)
def get_field_ndvi_endpoint(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_field_ndvi(db, current_user.id, field_id)


@router.get("/{field_id}/crop-health", response_model=CropHealthResponse)
def get_field_crop_health_endpoint(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_field_crop_health(db, current_user.id, field_id)


@router.get("/{field_id}/vegetation-report")
def download_vegetation_report(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    field = get_field_or_404(db, current_user.id, field_id)
    docx_bytes = build_vegetation_report_docx(db, field_id, field.name)
    filename = f"{field.name}_vegetation_report.docx".replace(" ", "_")
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{field_id}/reanalyze", response_model=NdviJobStatusResponse, status_code=201)
def reanalyze_field(
    field_id: uuid.UUID,
    body: FieldReanalyzeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = get_user_plan(db, current_user.id)
    enforce_date_range_limit(plan, body.start_date, body.end_date)

    field = get_field_or_404(db, current_user.id, field_id)
    job = create_reanalysis_job(db, field, body)
    background_tasks.add_task(run_ndvi_job, job.id)
    return job
