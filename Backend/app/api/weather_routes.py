from fastapi import APIRouter, Query

from app.services.weather import weather_service

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("")
def get_weather(
    lat: float = Query(...),
    lon: float = Query(...),
    source: str = Query(weather_service.DEFAULT_SOURCE),
):
    if source not in weather_service.VALID_SOURCES:
        source = weather_service.DEFAULT_SOURCE
    return weather_service.get_forecast(lat, lon, source)
