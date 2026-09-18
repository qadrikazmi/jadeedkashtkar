"""
Picks which weather source client to call based on a `source` id and
normalizes the response into one JSON-ready shape the frontend consumes,
including which source actually served the data (for the "Source: X"
label and the switch button in the UI).
"""

from app.services.weather import open_meteo_client, weatherapi_client
from app.services.weather.contract import ForecastDay

VALID_SOURCES = {open_meteo_client.SOURCE_ID, weatherapi_client.SOURCE_ID}
DEFAULT_SOURCE = open_meteo_client.SOURCE_ID


def _day_to_dict(d: ForecastDay) -> dict:
    return {
        "day": d.day,
        "date": d.date.isoformat(),
        "temp_hi": d.temp_hi,
        "temp_lo": d.temp_lo,
        "humidity_pct": d.humidity_pct,
        "wind_kmh": d.wind_kmh,
        "rain": d.rain,
        "pop_pct": d.pop_pct,
        "icon": d.icon,
        "desc": d.desc,
        "precipitation_mm": d.precipitation_mm,
    }


def get_forecast(lat: float, lon: float, source: str = DEFAULT_SOURCE) -> dict:
    if source == weatherapi_client.SOURCE_ID:
        days = weatherapi_client.get_forecast(lat, lon)
        source_id, source_label = weatherapi_client.SOURCE_ID, weatherapi_client.SOURCE_LABEL
    else:
        days = open_meteo_client.get_forecast(lat, lon)
        source_id, source_label = open_meteo_client.SOURCE_ID, open_meteo_client.SOURCE_LABEL

    return {
        "source": source_id,
        "source_label": source_label,
        "days": [_day_to_dict(d) for d in days],
    }
