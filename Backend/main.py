from app.services.alert_engine import run_alert_sweep
from app.services.satellite.stac_client import initialize_stac_client
from app.api.quick_analysis_routes import router as quick_analysis_router
from app.api.scans_routes import router as scans_router
from app.api.weather_routes import router as weather_router
from app.api.settings_routes import router as settings_router
from app.api.download_routes import router as download_router
from app.api.ndvi_routes import router as ndvi_router
from app.api.ledger_routes import router as ledger_router
from app.api.fertilizer_recommendation_routes import router as fertilizer_router
from app.api.crop_health_routes import router as crop_health_router
from app.api.alerts_routes import router as alerts_router
from app.api.fields_routes import router as fields_router
from app.api.admin_routes import router as admin_router
from app.api.auth_routes import router as auth_router
from app.api.routes import router
from app.api.drone_capture_routes import router as drone_capture_router
from app.exceptions.custom_exceptions import register_exception_handlers
from app.api.payments_routes import router as payments_router
from app.services.subscription_expiry_service import run_subscription_expiry_sweep
from app.api.announcements_routes import router as announcements_router
from app.core.database import Base, engine
from app.core.config import settings
from app.api.plans_routes import router as plans_router
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.services.quick_analysis_service import check_guest_usage, record_guest_usage, quick_analyze
from fastapi import FastAPI
import os

# Set before anything imports rasterio/GDAL anywhere in the app — GDAL
# reads these env vars once, at first use, so they must exist before any
# rasterio.open() call happens (including ones buried in background tasks
# triggered later). Without a cap, GDAL's block cache can grow toward all
# available RAM while processing a large drone GeoTIFF, which is what was
# freezing the machine. 512MB is a sane ceiling for a laptop; raise it
# only on a machine with real headroom to spare.
os.environ.setdefault("GDAL_CACHEMAX", "512")
os.environ.setdefault("GDAL_NUM_THREADS", "1")


import app.models  # noqa: F401


Base.metadata.create_all(bind=engine)

os.makedirs("static/ndvi_images", exist_ok=True)
os.makedirs(settings.SCAN_IMAGES_DIR, exist_ok=True)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="API for calculating vegetation and water indices from satellite imagery",
)


# ────────────────────────────────────────────────
# CORS for API routes
# ────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://SERVER_IP",
        "http://SERVER_IP:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ────────────────────────────────────────────────
# CORS for static files (ndvi images, drone maps, etc.)
# This is what was missing and causing the 0 KB downloads
# ────────────────────────────────────────────────


class StaticCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if request.url.path.startswith("/static/"):
            origin = request.headers.get("origin")
            if origin in [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]:
                response.headers["Access-Control-Allow-Origin"] = origin
            else:
                response.headers["Access-Control-Allow-Origin"] = "*"

            response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Expose-Headers"] = "*"

        return response


app.add_middleware(StaticCORSMiddleware)


register_exception_handlers(app)

app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(drone_capture_router, prefix="/api")
app.include_router(router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(fields_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
app.include_router(crop_health_router, prefix="/api")
app.include_router(fertilizer_router, prefix="/api")
app.include_router(ledger_router, prefix="/api")
app.include_router(ndvi_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(weather_router, prefix="/api")
app.include_router(scans_router, prefix="/api")
app.include_router(plans_router, prefix="/api")
app.include_router(announcements_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(quick_analysis_router, prefix="/api")
app.include_router(download_router, prefix="/api")
scheduler = BackgroundScheduler()


@app.on_event("startup")
def on_startup():
    try:
        initialize_stac_client()
        print("[startup] Planetary Computer STAC client ready")
    except Exception as e:
        print(f"[startup] STAC client init failed: {e}")

    scheduler.add_job(
        run_alert_sweep,
        "interval",
        hours=settings.ALERT_SWEEP_INTERVAL_HOURS,
        id="alert_sweep",
        replace_existing=True,
    )
    scheduler.add_job(
        run_subscription_expiry_sweep,
        "interval",
        hours=6,
        id="subscription_expiry_sweep",
        replace_existing=True,
    )
    scheduler.start()
    print(
        f"[startup] Schedulers started "
        f"(alerts every {settings.ALERT_SWEEP_INTERVAL_HOURS}h, subscription every 6h)"
    )

    try:
        print("[startup] Running initial alert sweep…")
        run_alert_sweep()
        print("[startup] Initial alert sweep done")
    except Exception as e:
        print(f"[startup] Initial alert sweep failed: {e}")


@app.on_event("shutdown")
def on_shutdown():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[shutdown] Schedulers stopped")


@app.get("/")
def root():
    return {
        "message": "Satellite Index API is running",
        "version": settings.VERSION,
        "docs": "/docs",
    }
