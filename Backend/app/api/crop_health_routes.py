import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.crop_health import CropHealthResponse
from app.services.crop_health_service import get_crop_health

router = APIRouter(prefix="/fields", tags=["Crop Health"])


@router.get("/{field_id}/crop-health", response_model=CropHealthResponse)
def get_field_crop_health(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_crop_health(db, current_user.id, field_id)
