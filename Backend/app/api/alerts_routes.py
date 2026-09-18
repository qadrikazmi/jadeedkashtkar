import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.alert import AlertResponse
from app.services.alert_engine import dismiss_alert, list_alerts_for_user, run_alert_sweep

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=list[AlertResponse])
def get_alerts(
    dismissed: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_alerts_for_user(db, current_user.id, dismissed=dismissed)


@router.post("/{alert_id}/dismiss", response_model=AlertResponse)
def post_dismiss_alert(
    alert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return dismiss_alert(db, current_user.id, alert_id)


@router.post("/sweep")
def trigger_alert_sweep(
    current_user: User = Depends(get_current_user),
):
    """
    Force pest/weather alert evaluation now.
    Use this while testing so you don't wait for the scheduled interval.
    """
    run_alert_sweep()
    return {"ok": True, "message": "Alert sweep completed"}
