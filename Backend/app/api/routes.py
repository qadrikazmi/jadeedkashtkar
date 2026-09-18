"""
General-purpose API router — for endpoints that don't belong to any single
feature (health checks under /api, version info, etc.).

This is deliberately NOT an aggregator of the feature routers
(alerts_routes, fields_routes, ...) — app/main.py already imports and
includes each of those individually. If this file also included them,
every endpoint would be registered twice.
"""

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["General"])


@router.get("/ping")
def ping():
    return {"status": "ok", "version": settings.VERSION}
