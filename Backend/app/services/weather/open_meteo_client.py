"""
Open-Meteo client — free, keyless weather API (no account/key needed).

Cached in-process per (lat, lon) rounded to ~100m, TTL from
settings.WEATHER_CACHE_TTL_SECONDS (default 1h) — a plain dict is enough
since this is a single-process FastAPI app with no shared cache
infrastructure; if the app is ever scaled to multiple workers, swap this
for Redis without touching callers (they only see `get_forecast`).
"""

import logging
import time
from datetime import datetime

import requests

from app.core.config import settings
from app.exceptions.custom_exceptions import WeatherServiceError
from app.services.weather.contract import DAY_LABELS, ForecastDay

logger = logging.getLogger("app")

SOURCE_ID = "open_meteo"
SOURCE_LABEL = "Open-Meteo"

# WMO weather codes (Open-Meteo's `weathercode`) -> (description, emoji, is_rain_code)
_WEATHER_CODE_META = {
    0: ("Clear sky", "☀️", False), 1: ("Mainly clear", "🌤️", False),
    2: ("Partly cloudy", "⛅", False), 3: ("Overcast", "☁️", False),
    45: ("Fog", "🌫️", False), 48: ("Depositing rime fog", "🌫️", False),
    51: ("Light drizzle", "🌦️", True), 53: ("Moderate drizzle", "🌦️", True),
    55: ("Dense drizzle", "🌧️", True),
    56: ("Freezing drizzle", "🌧️", True), 57: ("Dense freezing drizzle", "🌧️", True),
    61: ("Slight rain", "🌦️", True), 63: ("Moderate rain", "🌧️", True),
    65: ("Heavy rain", "🌧️", True),
    66: ("Freezing rain", "🌧️", True), 67: ("Heavy freezing rain", "🌧️", True),
    71: ("Slight snow", "🌨️", False), 73: ("Moderate snow", "🌨️", False),
    75: ("Heavy snow", "❄️", False), 77: ("Snow grains", "🌨️", False),
    80: ("Slight rain showers", "🌦️", True), 81: ("Moderate rain showers", "🌧️", True),
    82: ("Violent rain showers", "🌧️", True),
    85: ("Slight snow showers", "🌨️", False), 86: ("Heavy snow showers", "❄️", False),
    95: ("Thunderstorm", "⛈️", True), 96: ("Thunderstorm with hail", "⛈️", True),
    99: ("Thunderstorm with heavy hail", "⛈️", True),
}

_cache: dict[tuple[float, float, int], tuple[float, list[ForecastDay]]] = {}


def get_forecast(lat: float, lon: float, past_days: int = 0) -> list[ForecastDay]:
    """
    past_days > 0 pulls that many days of recent history in the same call
    (Open-Meteo's forecast endpoint supports this natively) — used by the
    fertilizer recommendation service for rainfall-accumulation logic.
    Included in the cache key so a past_days=7 call is never served a
    plain forward-only cache entry from a past_days=0 call, or vice versa.
    """
    cache_key = (round(lat, 3), round(lon, 3), past_days)
    now = time.time()

    cached = _cache.get(cache_key)
    if cached is not None and now - cached[0] < settings.WEATHER_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": (
                "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,"
                "wind_speed_10m_max,precipitation_sum,precipitation_probability_max,"
                "weather_code"
            ),
            "timezone": "auto",
            "forecast_days": 7,
        }
        if past_days > 0:
            params["past_days"] = past_days
        response = requests.get(
            settings.OPEN_METEO_BASE_URL, params=params, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Open-Meteo request failed for ({lat}, {lon}): {e}")
        raise WeatherServiceError(f"Could not fetch weather forecast: {e}")

    daily = response.json().get("daily")
    if not daily:
        raise WeatherServiceError("Open-Meteo returned no daily forecast data")

    forecast = []
    for i, date_str in enumerate(daily["time"]):
        day_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        code = daily["weather_code"][i]
        desc, icon, is_rain_code = _WEATHER_CODE_META.get(
            code, ("—", "🌡️", False))
        pop = daily.get("precipitation_probability_max", [None])[i]
        pop_pct = round(pop) if pop is not None else 0
        forecast.append(
            ForecastDay(
                day=DAY_LABELS[day_date.weekday()],
                date=day_date,
                temp_hi=round(daily["temperature_2m_max"][i]),
                temp_lo=round(daily["temperature_2m_min"][i]),
                humidity_pct=round(daily["relative_humidity_2m_mean"][i]),
                wind_kmh=round(daily["wind_speed_10m_max"][i]),
                rain=is_rain_code or pop_pct >= 50,
                pop_pct=pop_pct,
                icon=icon,
                desc=desc,
                precipitation_mm=daily["precipitation_sum"][i],
            )
        )

    _cache[cache_key] = (now, forecast)
    return forecast
