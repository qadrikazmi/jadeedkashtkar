import uuid

from sqlalchemy.orm import Session

from app.models.user_settings import UserSettings
from app.schemas.user_settings import UserSettingsUpdateRequest


def get_or_create_settings(db: Session, user_id: uuid.UUID) -> UserSettings:
    settings_row = db.query(UserSettings).filter(
        UserSettings.user_id == user_id).first()
    if settings_row is None:
        settings_row = UserSettings(user_id=user_id)
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row


def update_settings(
    db: Session, user_id: uuid.UUID, patch: UserSettingsUpdateRequest
) -> UserSettings:
    settings_row = get_or_create_settings(db, user_id)
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(settings_row, field, value)
    db.commit()
    db.refresh(settings_row)
    return settings_row
