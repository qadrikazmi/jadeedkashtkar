"""
Fertilizer recommendation — a rules-engine MVP, not a machine-learning
model. Combines a field's district/crop/irrigation/sowing-date, its latest
satellite vegetation-index reading, and a 7-day-forward + 7-day-history
weather pull into a provisional N/P2O5/K2O target sourced from
app.data.sfri_fertilizer_data, following report.md's "resource-constrained
MVP" design: no soil test in, no fabricated precision out — a medium-
fertility default absent a soil test, satellite evidence classified into a
small set of labels rather than converted directly to a kg dose, and N
timing gated on imminent heavy rain.

Mirrors crop_health_service.py's split of pure/testable helper functions
(no DB/Session) vs. a thin DB-touching orchestrator at the bottom.
"""

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from geoalchemy2.shape import to_shape
from sqlalchemy.orm import Session

from app.data.sfri_fertilizer_data import (
    PREVIOUS_CROP_N_CREDIT_KG_ACRE,
    SATELLITE_THRESHOLDS,
    SFRI_DATA,
    SUPPORTED_CROPS,
    UNSUPPORTED_CROP_MESSAGE,
    infer_irrigation_regime,
    kg_to_bags,
)
from app.exceptions.custom_exceptions import FieldNotFoundError, UnsupportedCropError
from app.models.field import Field
from app.models.ndvi_history import NdviHistory
from app.schemas.fertilizer_recommendation import (
    EvidenceClassification,
    FertilizerBags,
    FertilizerRecommendationResponse,
    NutrientTargets,
    TimingEvent,
)
from app.services.weather.open_meteo_client import ForecastDay, get_forecast

DEFAULT_SOIL_TIER = "medium"
# ponytail: fixed threshold, tune once an agronomist gives a real one
HEAVY_RAIN_THRESHOLD_MM = 20.0


def resolve_irrigation_type(
    district: Optional[str], field_irrigation_type: Optional[str]
) -> tuple[str, str, Optional[str]]:
    """
    Pure. The field's own setting wins if present; otherwise infer from the
    district's known rainfed-zone membership; otherwise assume irrigated
    (the majority case in canal-irrigated Punjab).

    Returns (irrigation_type, source, rainfall_class) — rainfall_class is
    only meaningful when irrigation_type == "rainfed".
    """
    if field_irrigation_type in ("irrigated", "rainfed"):
        rainfall_class = None
        if field_irrigation_type == "rainfed":
            # District may not match any of SFRI's named rainfed area lists
            # even though the user knows this field is rainfed — fall back
            # to the lowest-rainfall bucket rather than silently treating it
            # as unclassified (which would otherwise fall through to the
            # irrigated tier lookup in _select_target_node).
            _, inferred_class = infer_irrigation_regime(district)
            rainfall_class = inferred_class or "low_rainfall"
        return field_irrigation_type, "field_setting", rainfall_class

    irrigation_type, rainfall_class = infer_irrigation_regime(district)
    source = "district_default" if irrigation_type == "rainfed" else "fallback_irrigated"
    return irrigation_type, source, rainfall_class


def resolve_soil_tier(tiered_rules: dict, soil_tier_override: Optional[str]) -> tuple[str, str]:
    """Pure. Honors a weak/medium/fertile override when the crop's rules are
    actually tiered that way; defaults to medium fertility absent a soil test."""
    if soil_tier_override in tiered_rules:
        return soil_tier_override, "user_override"
    return DEFAULT_SOIL_TIER, "assumed_medium_default"


def _select_target_node(
    crop: str,
    rules: dict,
    *,
    irrigation_type: str,
    rainfall_class: Optional[str],
    soil_tier_override: Optional[str],
    variety: Optional[str],
) -> tuple[dict, str, str]:
    """
    Pure. Crop-specific branching over SFRI_DATA's inconsistent per-crop
    shape (fertility tiers for wheat/cotton/sugarcane, rainfall-region keys
    for rainfed wheat/maize, variety keys for rice, a single block for
    chickpea). Returns (target_node, soil_tier, soil_tier_source).
    """
    if crop == "Wheat":
        if irrigation_type == "rainfed" and rainfall_class:
            rainfed_tiers = rules["rainfed"]
            node = rainfed_tiers.get(
                rainfall_class) or rainfed_tiers["high_rainfall"]
            return node, "not_applicable", "not_applicable"
        tier, source = resolve_soil_tier(
            rules["irrigated"], soil_tier_override)
        return rules["irrigated"][tier], tier, source

    if crop == "Cotton":
        type_key = variety if variety in (
            "BT_hybrid", "conventional") else rules["default_type"]
        tier, source = resolve_soil_tier(rules[type_key], soil_tier_override)
        return rules[type_key][tier], tier, source

    if crop == "Sugarcane":
        tier, source = resolve_soil_tier(
            rules["new_planting"], soil_tier_override)
        return rules["new_planting"][tier], tier, source

    if crop == "Maize":
        if irrigation_type == "rainfed" and rainfall_class:
            rainfed_tiers = rules["rainfed"]
            node = rainfed_tiers.get(
                rainfall_class) or rainfed_tiers["high_rainfall"]
            return node, "not_applicable", "not_applicable"
        type_key = variety if variety in rules["irrigated"] else rules["default_variety"]
        return rules["irrigated"][type_key], "not_applicable", "not_applicable"

    if crop == "Rice":
        variety_key = variety if variety in rules["varieties"] else rules["default_variety"]
        return rules["varieties"][variety_key], "not_applicable", "not_applicable"

    if crop == "Chickpea":
        return rules["recommendation"], "not_applicable", "not_applicable"

    raise UnsupportedCropError(UNSUPPORTED_CROP_MESSAGE)


def classify_evidence(
    crop: str,
    ndre_mean: Optional[float],
    ndmi_mean: Optional[float],
    ndwi_mean: Optional[float],
    cci_mean: Optional[float],
) -> EvidenceClassification:
    """
    Pure. Classifies canopy evidence into a small label set rather than
    converting an index directly to a kg dose — priority: waterlogged >
    possible N-stress > possible water-stress > adequate. Thresholds are
    the provisional SATELLITE_THRESHOLDS calibration (see
    sfri_fertilizer_data.py's module docstring).
    """
    thresholds = SATELLITE_THRESHOLDS.get(crop)
    common = dict(ndre_mean=ndre_mean, ndmi_mean=ndmi_mean,
                  ndwi_mean=ndwi_mean, cci_mean=cci_mean)

    if thresholds is None or all(v is None for v in (ndre_mean, ndmi_mean, ndwi_mean, cci_mean)):
        return EvidenceClassification(
            label="insufficient_observation",
            basis="No recent satellite reading is available for this field yet.",
            **common,
        )

    if ndwi_mean is not None and ndwi_mean > thresholds["ndwi_waterlog"]:
        return EvidenceClassification(
            label="waterlogged",
            basis=f"NDWI {ndwi_mean:.2f} is above the waterlogging threshold ({thresholds['ndwi_waterlog']:.2f}) for {crop}.",
            **common,
        )

    if (ndre_mean is not None and ndre_mean < thresholds["ndre_critical"]) or (
        cci_mean is not None and cci_mean < thresholds["cci_critical"]
    ):
        return EvidenceClassification(
            label="possible_n_stress",
            basis=f"NDRE/CCI is below {crop}'s critical threshold, consistent with nitrogen deficiency.",
            **common,
        )

    if (ndmi_mean is not None and ndmi_mean < thresholds["ndmi_stress"]) or (
        ndwi_mean is not None and ndwi_mean < thresholds["ndwi_stress"]
    ):
        return EvidenceClassification(
            label="possible_water_stress",
            basis=f"NDMI/NDWI is below {crop}'s water-stress threshold — check irrigation before treating this as a nutrient issue.",
            **common,
        )

    return EvidenceClassification(
        label="adequate",
        basis="Canopy indices are within the expected range for this crop.",
        **common,
    )


def weather_gate(forecast: list[ForecastDay]) -> tuple[bool, str]:
    """Pure. True + reason if any of the next 3 forward days forecasts more
    than HEAVY_RAIN_THRESHOLD_MM of rain — surface nitrogen should wait."""
    today = date.today()
    upcoming = [d for d in forecast if d.date >= today][:3]
    for day in upcoming:
        if day.precipitation_mm > HEAVY_RAIN_THRESHOLD_MM:
            return True, (
                f"Heavy rain forecast on {day.date.isoformat()} ({day.precipitation_mm:.0f} mm) — "
                "defer surface nitrogen until after it passes to avoid runoff/leaching loss."
            )
    return False, ""


def _micronutrient_lines(node: dict, crop_rules: dict) -> list[str]:
    """Pure. Formats tier-specific + crop-level micronutrient doses into
    farmer-facing lines, then appends the crop's general agronomy notes."""
    lines: list[str] = []
    for source in (node.get("micronutrients"), crop_rules.get("micronutrients")):
        if not source:
            continue
        for key, value in source.items():
            if key == "note":
                lines.append(value)
                continue
            if not value:
                continue
            label = key.replace("_kg_acre", "").replace("_", " ").title()
            # Reattach a "%" to a trailing concentration number, e.g. a key
            # like "zinc_sulphate_33_kg_acre" should read "Zinc Sulphate
            # 33%", not "Zinc Sulphate 33".
            prefix, _, last_word = label.rpartition(" ")
            if last_word.isdigit():
                label = f"{prefix} {last_word}%"
            lines.append(f"{label}: {value} kg/acre")
    lines.extend(crop_rules.get("general_notes", []))
    return lines


def _build_timing_events(
    node: dict,
    sowing_date: Optional[date],
    weather_deferred: bool,
    weather_reason: str,
    evidence: EvidenceClassification,
) -> list[TimingEvent]:
    """
    Pure. The basal/first event's status comes from sowing_date alone (no
    GDD/stage model in this version); the last split — the one most likely
    to be a nitrogen top-dress — is gated on weather + satellite evidence,
    per report.md's "make later N applications conditional on stage, crop
    status and weather" guidance. Middle splits are left "upcoming" — this
    version doesn't estimate calendar dates for them.
    """
    timing = node.get("timing", {})
    keys = [k for k in timing if k != "note"]
    events: list[TimingEvent] = []

    for i, key in enumerate(keys):
        action = timing[key]
        stage = key.replace("_", " ")
        is_basal = i == 0
        is_last_split = i == len(keys) - 1 and len(keys) > 1

        if is_basal:
            if sowing_date is None:
                status, note = "upcoming", "Set a sowing date on this field for stage-aware timing."
            elif sowing_date <= date.today():
                status, note = "past", None
            else:
                status, note = "upcoming", None
        elif is_last_split:
            if weather_deferred:
                status, note = "deferred_weather", weather_reason
            elif evidence.label == "insufficient_observation":
                status, note = "upcoming", "Waiting on a clear satellite pass to confirm crop status before this split."
            else:
                status, note = "due", None
        else:
            status, note = "upcoming", None

        events.append(TimingEvent(
            stage=stage, action=action, status=status, note=note))

    if "note" in timing:
        events.append(TimingEvent(
            stage="note", action=timing["note"], status="upcoming", note=None))

    return events


def _field_centroid(field: Field) -> tuple[float, float]:
    point = to_shape(field.geometry).centroid
    return point.y, point.x


def get_fertilizer_recommendation(
    db: Session,
    user_id: uuid.UUID,
    field_id: uuid.UUID,
    *,
    soil_tier_override: Optional[str] = None,
    previous_crop: Optional[str] = None,
    variety: Optional[str] = None,
) -> FertilizerRecommendationResponse:
    field = db.query(Field).filter(Field.id == field_id,
                                   Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    # Case-insensitive crop matching (Wheat / wheat / WHEAT / wHeAt all work)
    raw_crop = (field.crop or "").strip()
    crop = next(
        (c for c in SUPPORTED_CROPS if c.lower() == raw_crop.lower()),
        None,
    )
    if crop is None:
        raise UnsupportedCropError(UNSUPPORTED_CROP_MESSAGE)

    rules = SFRI_DATA[crop]

    irrigation_type, irrigation_source, rainfall_class = resolve_irrigation_type(
        field.district, field.irrigation_type
    )

    node, soil_tier, soil_tier_source = _select_target_node(
        crop,
        rules,
        irrigation_type=irrigation_type,
        rainfall_class=rainfall_class,
        soil_tier_override=soil_tier_override,
        variety=variety,
    )

    previous_crop_key = previous_crop.strip().lower().replace(
        " ", "_") if previous_crop else None
    n_credit = PREVIOUS_CROP_N_CREDIT_KG_ACRE.get(
        previous_crop_key, 0.0) if previous_crop_key else 0.0
    n_target = max(node["N_kg_acre"] - n_credit, 0.0)
    p2o5_target = node["P2O5_kg_acre"]
    k2o_target = node["K2O_kg_acre"]

    bags = kg_to_bags(n_target, p2o5_target, k2o_target)

    latest_history: Optional[NdviHistory] = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.desc(), NdviHistory.computed_at.desc())
        .first()
    )
    evidence = classify_evidence(
        crop,
        ndre_mean=latest_history.ndre_mean if latest_history else None,
        ndmi_mean=latest_history.ndmi_mean if latest_history else None,
        ndwi_mean=latest_history.ndwi_mean if latest_history else None,
        cci_mean=latest_history.cci_mean if latest_history else None,
    )

    lat, lon = _field_centroid(field)
    forecast = get_forecast(lat, lon, past_days=7)
    weather_deferred, weather_reason = weather_gate(forecast)

    timing = _build_timing_events(
        node, field.sowing_date, weather_deferred, weather_reason, evidence)
    micronutrient_notes = _micronutrient_lines(node, rules)

    warnings = [
        "Provisional, no-soil-test recommendation based on local SFRI crop priors — "
        "not a substitute for a laboratory soil test from your nearest Punjab soil and water testing lab.",
        "Phosphorus and potassium are shown as P2O5/K2O-equivalent (matching DAP/SOP bag conventions), "
        "not elemental P/K.",
        "Satellite-index thresholds used for evidence classification are a provisional starting "
        "calibration, not yet validated against Punjab field trials.",
        "Product prices, where shown, are indicative only and were not captured live — verify with your "
        "local dealer before purchase.",
    ]
    confidence = rules.get("kg_acre_confidence", "unverified")
    if confidence == "unverified":
        warnings.append(
            f"{crop}'s SFRI data has not yet been cross-checked against a clear brochure photo.")
    if crop == "Sugarcane":
        warnings.append(
            "Ratoon-crop adjustment is not calculated by this version — the supplied ratoon multiplier "
            "is internally inconsistent in the source brochure; consult SFRI directly for a ratoon crop."
        )

    return FertilizerRecommendationResponse(
        field_id=str(field.id),
        crop=crop,
        district=field.district,
        irrigation_type=irrigation_type,
        irrigation_source=irrigation_source,
        soil_tier=soil_tier,
        soil_tier_source=soil_tier_source,
        nutrient_targets=NutrientTargets(n_kg_acre=round(
            n_target, 1), p2o5_kg_acre=p2o5_target, k2o_kg_acre=k2o_target),
        previous_crop_n_credit_kg_acre=n_credit,
        bags=FertilizerBags(urea_bags=bags.Urea_bags,
                            dap_bags=bags.DAP_bags, sop_bags=bags.SOP_bags),
        micronutrient_notes=micronutrient_notes,
        timing=timing,
        evidence=evidence,
        confidence=confidence,
        warnings=warnings,
        generated_at=datetime.now(timezone.utc),
    )
