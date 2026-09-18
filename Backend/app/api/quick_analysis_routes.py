from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.quick_analysis import QuickAnalyzeRequest, QuickAnalyzeResponse
from app.services.quick_analysis_service import (
    check_guest_usage,
    record_guest_usage,
    quick_analyze,
)

router = APIRouter(tags=["Quick Analysis"])


@router.post("/analyze", response_model=QuickAnalyzeResponse)
def analyze(
    body: QuickAnalyzeRequest,
    db: Session = Depends(get_db),
    x_anon_id: str = Header(..., alias="X-Anon-Id"),
):
    """
    Guest/landing-page one-shot analysis. Matches AnalysisPanel.jsx:
    api.post('/analyze', { polygon }).

    One use per browser (tracked via the X-Anon-Id header client.js
    already sends on every unauthenticated request) — a second attempt
    from the same browser gets a 403 prompting signup instead of running
    analysis again.

    Usage is only recorded AFTER a successful analysis — a failed attempt
    (no imagery found, invalid polygon, etc.) does not consume the
    guest's allowance. See check_guest_usage / record_guest_usage.
    """
    check_guest_usage(db, x_anon_id)
    result = quick_analyze(body.polygon)
    record_guest_usage(db, x_anon_id)
    return result
