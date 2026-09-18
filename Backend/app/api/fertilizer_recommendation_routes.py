import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.fertilizer_recommendation import FertilizerRecommendationResponse
from app.services.fertilizer_recommendation_pdf import render_fertilizer_recommendation_pdf
from app.services.fertilizer_recommendation_service import get_fertilizer_recommendation
from app.services.field_service import get_field_or_404

router = APIRouter(prefix="/fields", tags=["Fertilizer Recommendation"])


@router.get("/{field_id}/fertilizer-recommendation", response_model=FertilizerRecommendationResponse)
def get_field_fertilizer_recommendation(
    field_id: uuid.UUID,
    soil_tier: Optional[str] = Query(
        default=None, pattern="^(weak|medium|fertile)$"),
    previous_crop: Optional[str] = Query(default=None),
    variety: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_fertilizer_recommendation(
        db,
        current_user.id,
        field_id,
        soil_tier_override=soil_tier,
        previous_crop=previous_crop,
        variety=variety,
    )


@router.get("/{field_id}/fertilizer-recommendation/pdf")
def get_field_fertilizer_recommendation_pdf(
    field_id: uuid.UUID,
    soil_tier: Optional[str] = Query(
        default=None, pattern="^(weak|medium|fertile)$"),
    previous_crop: Optional[str] = Query(default=None),
    variety: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recommendation = get_fertilizer_recommendation(
        db,
        current_user.id,
        field_id,
        soil_tier_override=soil_tier,
        previous_crop=previous_crop,
        variety=variety,
    )
    field = get_field_or_404(db, current_user.id, field_id)
    pdf_bytes = render_fertilizer_recommendation_pdf(
        recommendation, field.name)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=fertilizer-recommendation.pdf"},
    )
