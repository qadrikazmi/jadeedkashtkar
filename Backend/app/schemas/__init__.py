from app.schemas.geometry import GeoJSONFeature, PolygonGeometry
from app.schemas.ndvi import (
    NdviAnalyzeRequest,
    NdviAnalyzeResponse,
    NdviSourceInfo,
    NdviStats,
    NdviVisualization,
)
from app.schemas.field import (
    FieldCreateRequest,
    FieldCreateResponse,
    FieldListItem,
    FieldNdviLatestResponse,
    FieldResponse,
    NdviHistoryItem,
)
from app.schemas.ndvi_job import FieldReanalyzeRequest, NdviJobStatusResponse
from app.schemas.alert import AlertResponse
from app.schemas.crop_health import CropHealthResponse, NdviTrendPoint
from app.schemas.fertilizer_recommendation import FertilizerRecommendationResponse
from app.schemas.ledger import (
    LedgerCategoryCreateRequest,
    LedgerEntryCreateRequest,
    LedgerEntryResponse,
    LedgerEntryUpdateRequest,
    ReportResponse,
)
from app.schemas.scan import LogScanToLedgerRequest, ScanResponse
from app.schemas.user_settings import UserSettingsResponse, UserSettingsUpdateRequest
from app.schemas.weather import ForecastDayResponse

# NOTE: app/schemas/user.py from the original project is NOT imported here.
# This project's auth schemas (SignupRequest, LoginRequest, AuthResponse,
# etc.) already live in app/models/schemas.py — no need to duplicate them.

__all__ = [
    "GeoJSONFeature",
    "PolygonGeometry",
    "NdviAnalyzeRequest",
    "NdviAnalyzeResponse",
    "NdviSourceInfo",
    "NdviStats",
    "NdviVisualization",
    "FieldCreateRequest",
    "FieldCreateResponse",
    "FieldListItem",
    "FieldNdviLatestResponse",
    "FieldResponse",
    "NdviHistoryItem",
    "FieldReanalyzeRequest",
    "NdviJobStatusResponse",
    "AlertResponse",
    "CropHealthResponse",
    "NdviTrendPoint",
    "FertilizerRecommendationResponse",
    "LedgerCategoryCreateRequest",
    "LedgerEntryCreateRequest",
    "LedgerEntryResponse",
    "LedgerEntryUpdateRequest",
    "ReportResponse",
    "LogScanToLedgerRequest",
    "ScanResponse",
    "UserSettingsResponse",
    "UserSettingsUpdateRequest",
    "ForecastDayResponse",
]
