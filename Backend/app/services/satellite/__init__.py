"""
Satellite package public exports.
Keeps old routes working (search_and_calculate) and exposes the new PC pipeline.
"""

from app.services.satellite.ndvi_processor import (
    compute_ndvi,
    compute_ndvi_periods,
    compute_weekly_tiles,
)
from app.services.satellite.legacy_analyze import search_and_calculate

__all__ = [
    "search_and_calculate",
    "compute_ndvi",
    "compute_ndvi_periods",
    "compute_weekly_tiles",
]
