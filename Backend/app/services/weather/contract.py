"""
Shared forecast contract for every weather source client. Both
open_meteo_client.py and weatherapi_client.py build lists of this
dataclass, so weather_service.py can treat any source identically.
"""

from dataclasses import dataclass
from datetime import date


@dataclass
class ForecastDay:
    day: str            # "Mon", "Tue", ...
    date: date
    temp_hi: int
    temp_lo: int
    humidity_pct: int
    wind_kmh: int
    rain: bool
    pop_pct: int         # chance of precipitation, 0-100
    icon: str            # emoji for the UI
    desc: str
    precipitation_mm: float = 0.0


DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
