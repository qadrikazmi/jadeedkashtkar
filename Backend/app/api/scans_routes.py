import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.ledger import LedgerEntryResponse
from app.schemas.scan import LogScanToLedgerRequest, ScanResponse
from app.services.scanner.scan_service import create_scan, list_scans_for_user, log_scan_to_ledger

router = APIRouter(prefix="/scans", tags=["Disease Scanner"])


@router.post("", response_model=ScanResponse, status_code=201)
async def post_scan(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Runs the configured InferenceProvider (demo classifier by default —
    see GAPS.md Gap 5) against the uploaded leaf photo and persists the
    result. Response is marked `demo_mode: true` when no real model is
    wired up.
    """
    image_bytes = await image.read()
    return create_scan(db, current_user.id, image.filename or "upload.jpg", image.content_type, image_bytes)


@router.get("", response_model=list[ScanResponse])
def get_scans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_scans_for_user(db, current_user.id)


@router.post("/{scan_id}/log-to-ledger", response_model=LedgerEntryResponse, status_code=201)
def post_log_scan_to_ledger(
    scan_id: uuid.UUID,
    body: LogScanToLedgerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return log_scan_to_ledger(db, current_user.id, scan_id, body.field_id)
