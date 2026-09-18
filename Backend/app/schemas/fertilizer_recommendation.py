from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel

EvidenceLabel = Literal[
    "adequate", "possible_n_stress", "possible_water_stress", "waterlogged", "insufficient_observation"
]
TimingStatus = Literal["due", "upcoming", "deferred_weather", "past"]


class NutrientTargets(BaseModel):
    n_kg_acre: float
    p2o5_kg_acre: float
    k2o_kg_acre: float


class FertilizerBags(BaseModel):
    urea_bags: float
    dap_bags: float
    sop_bags: float


class TimingEvent(BaseModel):
    stage: str
    action: str
    status: TimingStatus
    note: Optional[str] = None


class EvidenceClassification(BaseModel):
    label: EvidenceLabel
    basis: str
    ndre_mean: Optional[float] = None
    ndmi_mean: Optional[float] = None
    ndwi_mean: Optional[float] = None
    cci_mean: Optional[float] = None


class FertilizerRecommendationResponse(BaseModel):
    field_id: str
    crop: str
    district: Optional[str] = None

    irrigation_type: str
    irrigation_source: Literal["field_setting",
                               "district_default", "fallback_irrigated"]

    soil_tier: str
    soil_tier_source: Literal["user_override",
                              "assumed_medium_default", "not_applicable"]

    nutrient_targets: NutrientTargets
    previous_crop_n_credit_kg_acre: float
    bags: FertilizerBags

    micronutrient_notes: List[str]
    timing: List[TimingEvent]
    evidence: EvidenceClassification

    confidence: str
    warnings: List[str]
    generated_at: datetime
