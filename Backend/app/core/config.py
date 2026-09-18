from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    APP_NAME: str = "Satellite Index API"
    VERSION: str = "1.0.0"

    # Microsoft Planetary Computer STAC API
    STAC_API_URL: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    SENTINEL2_COLLECTION: str = "sentinel-2-l2a"
    MAX_CLOUD_COVER_PERCENT: int = 40
    NDVI_SEARCH_WINDOW_DAYS: int = 30
    APP_BASE_URL: str = "http://localhost:8000"  # change in production

    # Auth / database
    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-this")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    RESET_TOKEN_EXPIRE_MINUTES: int = 60

    # --- App / environment ---
    DEBUG: bool = False
    FRONTEND_URL: str = "http://localhost:5173"

    # --- SMTP / Email Settings ---
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = ""

    # --- Weather (Open-Meteo) — used by services/weather/open_meteo_client.py ---
    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1/forecast"
    WEATHER_CACHE_TTL_SECONDS: int = 60 * 30  # 30 minutes

    # --- WeatherAPI.com (added) ---
    WEATHERAPI_KEY: str = ""
    WEATHERAPI_BASE_URL: str = "https://api.weatherapi.com/v1/forecast.json"

    # --- Disease scanner — used by services/scanner/*.py ---
    INFERENCE_PROVIDER: str = "onnx"
    SCAN_IMAGES_DIR: str = "static/scan_images"

    # --- Alerts — used by services/alert_engine.py ---
    ALERT_SWEEP_INTERVAL_HOURS: int = 6

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
