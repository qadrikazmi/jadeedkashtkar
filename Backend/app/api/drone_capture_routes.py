import os
import uuid
from io import BytesIO
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.drone_capture_band import BAND_TYPES
from app.models.user import User
from app.schemas.drone_capture import (
    DroneCaptureCreateRequest,
    DroneCaptureDateUpdateRequest,
    DroneCaptureResponse,
)
from app.services import drone_capture_service
from app.services.drone_capture_tile_service import (
    get_capture_band_tile_bytes,
    process_capture_band_to_cog,
)
from app.services.drone_index_service import compute_capture_indices, determine_computable_indices
from app.services.field_service import get_field_or_404

router = APIRouter(
    prefix="/fields/{field_id}/drone-captures", tags=["Drone Captures"])


@router.post("", response_model=DroneCaptureResponse, status_code=201)
def create_capture(
    field_id: uuid.UUID,
    body: DroneCaptureCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_field_or_404(db, current_user.id, field_id)
    capture = drone_capture_service.create_capture(
        db, field_id, current_user.id, body.name, body.capture_date
    )
    base_url = str(request.base_url).rstrip("/")
    return drone_capture_service.build_capture_response(capture, base_url)


@router.get("", response_model=List[DroneCaptureResponse])
def list_captures(
    field_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_field_or_404(db, current_user.id, field_id)
    captures = drone_capture_service.list_captures_for_field(db, field_id)
    base_url = str(request.base_url).rstrip("/")
    return [drone_capture_service.build_capture_response(c, base_url) for c in captures]


@router.post("/upload-band", response_model=DroneCaptureResponse, status_code=201)
async def upload_band_auto(
    field_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    band_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_field_or_404(db, current_user.id, field_id)
    if band_type not in BAND_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid band_type. Must be one of {BAND_TYPES}.",
        )

    # Read the file once
    contents = await file.read()

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Save to a real temporary file (Windows-safe)
    import tempfile

    suffix = os.path.splitext(file.filename)[1] if file.filename else ".tif"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(contents)

        # --- Integrity checks ---
        written_size = os.path.getsize(tmp_path)
        if written_size == 0:
            raise HTTPException(
                status_code=400, detail="Uploaded file is empty.")
        if written_size != len(contents):
            raise HTTPException(
                status_code=500,
                detail="Temp file write incomplete. Please retry the upload.",
            )

        import rasterio

        try:
            with rasterio.open(tmp_path) as src:
                for i in range(1, src.count + 1):
                    src.read(i, window=((0, 1), (0, 1)))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Uploaded file is corrupted or incomplete and could not "
                    f"be read: {e}. Please re-upload the file."
                ),
            )
        # --- end integrity checks ---

        capture_date = drone_capture_service.extract_capture_date(
            tmp_path, file.filename or "upload.tif"
        )
        name = drone_capture_service.derive_capture_name(
            file.filename or "upload.tif")

        capture = drone_capture_service.get_or_create_capture_for_date(
            db, field_id, current_user.id, capture_date, name
        )

        new_file = UploadFile(
            filename=file.filename or "upload.tif",
            file=BytesIO(contents),
        )

        band = await drone_capture_service.add_band_to_capture(
            db, capture, new_file, band_type
        )
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    if band_type == "rgb":
        background_tasks.add_task(process_capture_band_to_cog, band.id)

    db.refresh(capture)
    band_types_present = {
        b.band_type for b in capture.bands if b.band_type != "unknown"
    }
    # ← FIXED: was `if capture.status != "done" and determine_computable_indices(...)`.
    # That "!= done" half was the actual bug — it permanently locked out
    # recompute for any capture that had already finished once (e.g. an
    # RGB-only run), so uploading NIR afterward into the SAME capture never
    # re-triggered compute_capture_indices even though NDVI/EVI/SAVI/NDWI
    # had just become computable. This route only runs right after a band
    # was uploaded, so "there's something computable" is already the
    # correct and sufficient signal on its own — recompute whenever it's
    # non-empty, regardless of the capture's current status.
    if determine_computable_indices(band_types_present):
        capture.status = "processing"
        db.commit()
        background_tasks.add_task(compute_capture_indices, capture.id)
        db.refresh(capture)

    base_url = str(request.base_url).rstrip("/")
    return drone_capture_service.build_capture_response(capture, base_url)


@router.post("/{capture_id}/bands", response_model=DroneCaptureResponse, status_code=201)
async def upload_band(
    field_id: uuid.UUID,
    capture_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    band_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_field_or_404(db, current_user.id, field_id)

    capture = drone_capture_service.get_capture_or_404(
        db, capture_id, current_user.id)
    if capture is None or capture.field_id != field_id:
        raise HTTPException(status_code=404, detail="Drone capture not found")

    if band_type not in BAND_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid band_type. Must be one of {BAND_TYPES}.",
        )

    try:
        new_band = await drone_capture_service.add_band_to_capture(db, capture, file, band_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if band_type == "rgb":
        background_tasks.add_task(process_capture_band_to_cog, new_band.id)

    db.refresh(capture)

    band_types_present = {
        b.band_type for b in capture.bands if b.band_type != "unknown"}
    # ← FIXED: same bug/fix as upload_band_auto above.
    if determine_computable_indices(band_types_present):
        capture.status = "processing"
        db.commit()
        background_tasks.add_task(compute_capture_indices, capture.id)
        db.refresh(capture)

    base_url = str(request.base_url).rstrip("/")
    return drone_capture_service.build_capture_response(capture, base_url)


@router.patch("/{capture_id}", response_model=DroneCaptureResponse)
def update_capture_date(
    field_id: uuid.UUID,
    capture_id: uuid.UUID,
    body: DroneCaptureDateUpdateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manual override for the auto-extracted flight date.
    Safer version: update the date on the existing history row if possible,
    instead of deleting it and hoping the background job succeeds.
    """
    get_field_or_404(db, current_user.id, field_id)
    capture = drone_capture_service.get_capture_or_404(
        db, capture_id, current_user.id)
    if capture is None or capture.field_id != field_id:
        raise HTTPException(status_code=404, detail="Drone capture not found")

    capture.capture_date = body.capture_date

    # If we already have a history row, just update its date in place.
    # This is much safer than deleting + re-computing.
    if capture.ndvi_history_id:
        from app.models.ndvi_history import NdviHistory
        history = db.query(NdviHistory).filter(
            NdviHistory.id == capture.ndvi_history_id
        ).first()
        if history:
            history.satellite_image_date = body.capture_date
            history.date_range_start = body.capture_date
            # keep source_collection = "drone"
            db.commit()
            db.refresh(capture)
            base_url = str(request.base_url).rstrip("/")
            return drone_capture_service.build_capture_response(capture, base_url)

    # No history row yet (or it was lost) → fall back to re-compute
    if capture.status == "done" or capture.status == "processing":
        capture.status = "processing"
        capture.error_message = None
        db.commit()
        background_tasks.add_task(compute_capture_indices, capture.id)
    else:
        db.commit()

    db.refresh(capture)
    base_url = str(request.base_url).rstrip("/")
    return drone_capture_service.build_capture_response(capture, base_url)


@router.post("/{capture_id}/reprocess", response_model=DroneCaptureResponse, status_code=202)
def reprocess_capture(
    field_id: uuid.UUID,
    capture_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Re-runs compute_capture_indices against the capture's EXISTING band
    files already on disk -- no re-upload needed.
    """
    get_field_or_404(db, current_user.id, field_id)
    capture = drone_capture_service.get_capture_or_404(
        db, capture_id, current_user.id)
    if capture is None or capture.field_id != field_id:
        raise HTTPException(status_code=404, detail="Drone capture not found")

    capture.status = "processing"
    capture.error_message = None
    db.commit()
    background_tasks.add_task(compute_capture_indices, capture.id)
    db.refresh(capture)

    base_url = str(request.base_url).rstrip("/")
    return drone_capture_service.build_capture_response(capture, base_url)


@router.delete("/{capture_id}", status_code=204)
def delete_capture(
    field_id: uuid.UUID,
    capture_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_field_or_404(db, current_user.id, field_id)
    capture = drone_capture_service.get_capture_or_404(
        db, capture_id, current_user.id)
    if capture is None or capture.field_id != field_id:
        raise HTTPException(status_code=404, detail="Drone capture not found")
    drone_capture_service.delete_capture(db, capture)


@router.get("/{capture_id}/bands/{band_id}/tiles/{z}/{x}/{y}.png")
def get_capture_band_tile(
    field_id: uuid.UUID,
    capture_id: uuid.UUID,
    band_id: uuid.UUID,
    z: int,
    x: int,
    y: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Called by Mapbox itself, once per visible tile, on the Fields map."""
    get_field_or_404(db, current_user.id, field_id)
    tile_bytes = get_capture_band_tile_bytes(db, band_id, z, x, y)
    if tile_bytes is None:
        raise HTTPException(status_code=404, detail="Tile not found")
    return Response(content=tile_bytes, media_type="image/png")
