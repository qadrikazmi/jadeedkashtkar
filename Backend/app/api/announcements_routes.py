from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.announcement import Announcement
from app.schemas.announcement import AnnouncementResponse

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("/active", response_model=List[AnnouncementResponse])
def get_active_announcements(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    return (
        db.query(Announcement)
        .filter(
            Announcement.is_active.is_(True),
            Announcement.starts_at <= now,
            Announcement.ends_at >= now,
        )
        .order_by(Announcement.starts_at.desc())
        .all()
    )
