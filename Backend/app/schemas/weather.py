from datetime import date

from pydantic import BaseModel


class ForecastDayResponse(BaseModel):
    day: str
    date: date
    temp_hi: int
    temp_lo: int
    humidity_pct: int
    wind_kmh: int
    rain: bool
    desc: str
    precipitation_mm: float
