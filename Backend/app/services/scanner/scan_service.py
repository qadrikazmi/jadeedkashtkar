import os
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.exceptions.custom_exceptions import FieldNotFoundError, InvalidImageError, ScanNotFoundError
from app.models.field import Field
from app.models.ledger_entry import LedgerCategory, LedgerEntry
from app.models.scan import Scan
from app.services.scanner.inference_provider import get_inference_provider

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def create_scan(db: Session, user_id: uuid.UUID, filename: str, content_type: str, image_bytes: bytes) -> Scan:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise InvalidImageError(f"Unsupported image type: {content_type}")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise InvalidImageError("Image exceeds the 10 MB upload limit")

    provider = get_inference_provider()
    result = provider.classify(image_bytes)

    ext = os.path.splitext(filename)[1] or ".jpg"
    image_filename = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(settings.SCAN_IMAGES_DIR, exist_ok=True)
    image_path = os.path.join(settings.SCAN_IMAGES_DIR, image_filename)
    with open(image_path, "wb") as f:
        f.write(image_bytes)
    image_url = f"{settings.APP_BASE_URL}/{settings.SCAN_IMAGES_DIR}/{image_filename}"

    scan = Scan(
        user_id=user_id,
        image_url=image_url,
        disease=result.disease,
        latin_name=result.latin_name,
        confidence_pct=result.confidence_pct,
        breakdown=[{"label": b.label, "pct": b.pct} for b in result.breakdown],
        mitigations=result.mitigations,
        demo_mode=result.demo_mode,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def get_scan_or_404(db: Session, user_id: uuid.UUID, scan_id: uuid.UUID) -> Scan:
    scan = db.query(Scan).filter(Scan.id == scan_id,
                                 Scan.user_id == user_id).first()
    if scan is None:
        raise ScanNotFoundError()
    return scan


def list_scans_for_user(db: Session, user_id: uuid.UUID) -> list[Scan]:
    return db.query(Scan).filter(Scan.user_id == user_id).order_by(Scan.created_at.desc()).all()


def log_scan_to_ledger(db: Session, user_id: uuid.UUID, scan_id: uuid.UUID, field_id: uuid.UUID) -> LedgerEntry:
    scan = get_scan_or_404(db, user_id, scan_id)
    field = db.query(Field).filter(Field.id == field_id,
                                   Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    is_healthy = scan.disease.lower() == "healthy"
    entry = LedgerEntry(
        field_id=field.id,
        title=f"Leaf scan — {'healthy' if is_healthy else scan.disease}",
        detail=f"{scan.confidence_pct:.0f}% confidence · {field.name}",
        category=LedgerCategory.Scan.value,  # category is a String column now
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
