from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user_settings import UserSettingsResponse, UserSettingsUpdateRequest
from app.services.user_settings_service import get_or_create_settings, update_settings

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=UserSettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_or_create_settings(db, current_user.id)


@router.patch("", response_model=UserSettingsResponse)
def patch_settings(
    patch: UserSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_settings(db, current_user.id, patch)
