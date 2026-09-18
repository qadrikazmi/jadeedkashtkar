"""
WeatherAPI.com client — free-tier weather API (needs a key, no card).

Docs: https://www.weatherapi.com/docs/

Requires settings.WEATHERAPI_KEY (put the real key in your .env, never
in source). Cached the same way as open_meteo_client, same TTL setting.
"""

import logging
import time
from datetime import datetime

import requests

from app.core.config import settings
from app.exceptions.custom_exceptions import WeatherServiceError
from app.services.weather.contract import DAY_LABELS, ForecastDay

logger = logging.getLogger("app")

SOURCE_ID = "weatherapi"
SOURCE_LABEL = "WeatherAPI.com"

_cache: dict[tuple[float, float], tuple[float, list[ForecastDay]]] = {}


def _icon_and_rain(condition_text: str) -> tuple[str, bool]:
    """
    WeatherAPI's condition codes are from a different table than
    Open-Meteo's WMO codes, so rather than maintaining a second full
    lookup table, this matches on keywords in the condition text
    (which WeatherAPI always returns alongside the code) — simpler and
    robust to codes we haven't explicitly mapped.
    """
    text = condition_text.lower()
    if "thunder" in text:
        return "⛈️", True
    if "snow" in text or "sleet" in text or "ice" in text:
        return "🌨️", False
    if "drizzle" in text:
        return "🌦️", True
    if "rain" in text or "shower" in text:
        return "🌧️", True
    if "fog" in text or "mist" in text:
        return "🌫️", False
    if "overcast" in text:
        return "☁️", False
    if "cloud" in text:
        return "⛅", False
    if "clear" in text or "sunny" in text:
        return "☀️", False
    return "🌡️", False


def get_forecast(lat: float, lon: float) -> list[ForecastDay]:
    if not settings.WEATHERAPI_KEY:
        raise WeatherServiceError("WEATHERAPI_KEY is not configured")

    cache_key = (round(lat, 3), round(lon, 3))
    now = time.time()

    cached = _cache.get(cache_key)
    if cached is not None and now - cached[0] < settings.WEATHER_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        params = {
            "key": settings.WEATHERAPI_KEY,
            "q": f"{lat},{lon}",
            "days": 7,
            "aqi": "no",
            "alerts": "no",
        }
        response = requests.get(
            settings.WEATHERAPI_BASE_URL, params=params, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"WeatherAPI.com request failed for ({lat}, {lon}): {e}")
        raise WeatherServiceError(f"Could not fetch weather forecast: {e}")

    forecast_days = response.json().get("forecast", {}).get("forecastday")
    if not forecast_days:
        raise WeatherServiceError(
            "WeatherAPI.com returned no daily forecast data")

    forecast = []
    for entry in forecast_days:
        day_date = datetime.strptime(entry["date"], "%Y-%m-%d").date()
        day = entry["day"]
        condition_text = day.get("condition", {}).get("text", "—")
        icon, is_rain_condition = _icon_and_rain(condition_text)
        pop_pct = round(day.get("daily_chance_of_rain", 0))
        forecast.append(
            ForecastDay(
                day=DAY_LABELS[day_date.weekday()],
                date=day_date,
                temp_hi=round(day["maxtemp_c"]),
                temp_lo=round(day["mintemp_c"]),
                humidity_pct=round(day["avghumidity"]),
                wind_kmh=round(day["maxwind_kph"]),
                rain=is_rain_condition or pop_pct >= 50,
                pop_pct=pop_pct,
                icon=icon,
                desc=condition_text,
                precipitation_mm=day.get("totalprecip_mm", 0.0),
            )
        )

    _cache[cache_key] = (now, forecast)
    return forecast
