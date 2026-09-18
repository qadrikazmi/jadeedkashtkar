"""
Rule-based alert engine — evaluated on a periodic sweep (APScheduler, see
main.py, interval from settings.ALERT_SWEEP_INTERVAL_HOURS).

Two rule categories, matching the two non-SMS toggles in UserSettings:
- pest: stripe rust proliferation risk (humidity/temperature window, the
  example rule from the build instructions).
- weather: upcoming monsoon rain warning.

Both are heuristic scoring, not validated agronomic/statistical
models — flagged in GAPS.md alongside the crop-health formula for the
agronomy team to refine.

Each rule is gated by the matching UserSettings toggle *before* the Alert
row is even created — so a disabled toggle actually stops delivery (there's
no separate "silent" alert state to gate afterwards; the alerts table is
the in-app delivery channel).
"""

import logging
import uuid
from typing import Optional

from geoalchemy2.shape import to_shape
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.exceptions.custom_exceptions import AlertNotFoundError
from app.models.alert import Alert, AlertCategory
from app.models.field import Field
from app.services.notifications.notifier import InAppNotifier
from app.services.user_settings_service import get_or_create_settings
from app.services.weather.open_meteo_client import ForecastDay, get_forecast

logger = logging.getLogger("app")

RUST_MIN_HUMIDITY_PCT = 70
RUST_TEMP_LOW_C = 26
RUST_TEMP_HIGH_C = 31
RUST_MIN_CONSECUTIVE_DAYS = 3

MONSOON_LOOKAHEAD_DAYS = 3
MONSOON_MIN_RAIN_DAYS = 2


def _has_active_alert(db: Session, field_id: uuid.UUID, category: AlertCategory) -> bool:
    return (
        db.query(Alert)
        .filter(Alert.field_id == field_id, Alert.category == category, Alert.dismissed.is_(False))
        .first()
        is not None
    )


def _stripe_rust_qualifying_streak(forecast: list[ForecastDay]) -> list[ForecastDay]:
    """Leading run of consecutive forecast days meeting the rust risk window."""
    streak: list[ForecastDay] = []
    for day in forecast:
        favorable = (
            day.humidity_pct > RUST_MIN_HUMIDITY_PCT
            and day.temp_lo <= RUST_TEMP_HIGH_C
            and day.temp_hi >= RUST_TEMP_LOW_C
        )
        if favorable:
            streak.append(day)
        else:
            break
    return streak


def _stripe_rust_risk_pct(qualifying_days: list[ForecastDay]) -> float:
    avg_humidity = sum(
        d.humidity_pct for d in qualifying_days) / len(qualifying_days)
    risk = (
        50
        + (avg_humidity - RUST_MIN_HUMIDITY_PCT) * 1.2
        + (len(qualifying_days) - RUST_MIN_CONSECUTIVE_DAYS) * 5
    )
    return round(max(0.0, min(97.0, risk)), 1)


def evaluate_field_pest_alerts(db: Session, field: Field, forecast: list[ForecastDay]) -> list[Alert]:
    streak = _stripe_rust_qualifying_streak(forecast)
    if len(streak) < RUST_MIN_CONSECUTIVE_DAYS:
        return []
    if _has_active_alert(db, field.id, AlertCategory.pest):
        return []

    risk_pct = _stripe_rust_risk_pct(streak)
    alert = Alert(
        field_id=field.id,
        category=AlertCategory.pest,
        title=f"Pest warning — stripe rust risk {risk_pct:.0f}%",
        message=(
            f"{RUST_MIN_CONSECUTIVE_DAYS}+ consecutive days of humidity above "
            f"{RUST_MIN_HUMIDITY_PCT}% with {RUST_TEMP_LOW_C}–{RUST_TEMP_HIGH_C}°C "
            f"temperatures favor stripe rust (Puccinia striiformis) proliferation on {field.name}."
        ),
        risk_pct=risk_pct,
    )
    db.add(alert)
    return [alert]


def evaluate_field_weather_alerts(db: Session, field: Field, forecast: list[ForecastDay]) -> list[Alert]:
    upcoming = forecast[:MONSOON_LOOKAHEAD_DAYS]
    rain_days = [d for d in upcoming if d.rain]
    if len(rain_days) < MONSOON_MIN_RAIN_DAYS:
        return []
    if _has_active_alert(db, field.id, AlertCategory.weather):
        return []

    alert = Alert(
        field_id=field.id,
        category=AlertCategory.weather,
        title="Weather warning — monsoon rain expected",
        message=(
            f"{len(rain_days)} of the next {MONSOON_LOOKAHEAD_DAYS} days forecast rain for "
            f"{field.name} — plan irrigation and spray timing accordingly."
        ),
        risk_pct=None,
    )
    db.add(alert)
    return [alert]


def evaluate_field(db: Session, field: Field) -> list[Alert]:
    settings_row = get_or_create_settings(db, field.user_id)
    new_alerts: list[Alert] = []

    forecast: Optional[list[ForecastDay]] = None
    if settings_row.alert_pest or settings_row.alert_weather:
        centroid = to_shape(field.geometry).centroid
        forecast = get_forecast(centroid.y, centroid.x)

    if settings_row.alert_pest:
        new_alerts += evaluate_field_pest_alerts(db, field, forecast)
    if settings_row.alert_weather:
        new_alerts += evaluate_field_weather_alerts(db, field, forecast)

    return new_alerts


def run_alert_sweep() -> None:
    """
    APScheduler job target. Owns its own DB session end-to-end (mirrors
    ndvi_job_service.run_ndvi_job) since it runs outside any request.
    """
    db = SessionLocal()
    try:
        fields = db.query(Field).all()
        for field in fields:
            try:
                new_alerts = evaluate_field(db, field)
                if not new_alerts:
                    continue
                db.commit()

                notifier = InAppNotifier()
                for alert in new_alerts:
                    db.refresh(alert)
                    notifier.notify(field.owner, alert)
            except Exception:
                logger.error(
                    f"Alert sweep failed for field {field.id}", exc_info=True)
                db.rollback()
    finally:
        db.close()


def list_alerts_for_user(
    db: Session, user_id: uuid.UUID, dismissed: Optional[bool] = None
) -> list[Alert]:
    query = db.query(Alert).join(Field).filter(Field.user_id == user_id)
    if dismissed is not None:
        query = query.filter(Alert.dismissed.is_(dismissed))
    return query.order_by(Alert.created_at.desc()).all()


def dismiss_alert(db: Session, user_id: uuid.UUID, alert_id: uuid.UUID) -> Alert:
    alert = (
        db.query(Alert).join(Field).filter(
            Alert.id == alert_id, Field.user_id == user_id).first()
    )
    if alert is None:
        raise AlertNotFoundError()
    alert.dismissed = True
    db.commit()
    db.refresh(alert)
    return alert
