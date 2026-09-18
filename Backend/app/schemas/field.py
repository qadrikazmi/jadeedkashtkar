import uuid
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.geometry import PolygonGeometry

IrrigationType = Literal["irrigated", "rainfed"]


class FieldCreateRequest(BaseModel):
    """POST /fields — saves just the boundary; NDVI/NDMI are computed
    server-side by a background job (see ndvi_job_service.py)."""

    name: str = Field(..., min_length=1, max_length=255)
    geometry: PolygonGeometry
    district: Optional[str] = Field(default=None, max_length=100)
    crop: Optional[str] = Field(default=None, max_length=50)
    irrigation_type: Optional[IrrigationType] = None
    sowing_date: Optional[date] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class FieldUpdateRequest(BaseModel):
    """PATCH /fields/{field_id}

    - Metadata-only: omit geometry (and the date window). Existing NDVI history is left untouched.
    - Boundary redraw: send geometry + start_date + end_date. Existing NdviHistory rows are
      hard-deleted and a fresh analysis job is started (same path as create).
    """
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    geometry: Optional[PolygonGeometry] = None
    district: Optional[str] = Field(default=None, max_length=100)
    crop: Optional[str] = Field(default=None, max_length=50)
    irrigation_type: Optional[IrrigationType] = None
    sowing_date: Optional[date] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    @model_validator(mode="after")
    def require_dates_when_geometry_present(self):
        if self.geometry is not None:
            if self.start_date is None or self.end_date is None:
                raise ValueError(
                    "start_date and end_date are required when geometry is supplied "
                    "(boundary redraw triggers a fresh analysis job)"
                )
        return self


class FieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    geometry: PolygonGeometry
    area_hectares: Optional[float] = None
    district: Optional[str] = None
    crop: Optional[str] = None
    irrigation_type: Optional[IrrigationType] = None
    sowing_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime


class FieldCreateResponse(BaseModel):
    field: FieldResponse
    job_id: uuid.UUID = Field(
        ..., description="Poll GET /fields/{field_id}/jobs/{job_id} for analysis status"
    )


class FieldUpdateResponse(BaseModel):
    field: FieldResponse
    job_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Present only when geometry was changed; poll the job the same way as create",
    )


class FieldListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    area_hectares: Optional[float] = None
    created_at: datetime


class NdviHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # Optional — a drone capture with RGB but no NIR band tagged genuinely
    # has no NDVI value (it computes ExG/VARI/GLI instead; see
    # drone_index_service.py). This was previously required, which crashed
    # serialization the moment such a row existed.
    ndvi_mean: Optional[float] = None
    ndvi_min: Optional[float] = None
    ndvi_max: Optional[float] = None
    ndmi_mean: Optional[float] = None
    ndmi_min: Optional[float] = None
    ndmi_max: Optional[float] = None
    ndre_mean: Optional[float] = None
    ndre_min: Optional[float] = None
    ndre_max: Optional[float] = None
    nbr2_mean: Optional[float] = None
    nbr2_min: Optional[float] = None
    nbr2_max: Optional[float] = None
    ndwi_mean: Optional[float] = None
    ndwi_min: Optional[float] = None
    ndwi_max: Optional[float] = None
    cci_mean: Optional[float] = None
    cci_min: Optional[float] = None
    cci_max: Optional[float] = None
    evi_mean: Optional[float] = None
    evi_min: Optional[float] = None
    evi_max: Optional[float] = None
    savi_mean: Optional[float] = None
    savi_min: Optional[float] = None
    savi_max: Optional[float] = None
    # RGB-only indices — only populated when a drone capture had RGB but
    # no NIR (see ndvi_history.py / drone_index_service.py).
    exg_mean: Optional[float] = None
    exg_min: Optional[float] = None
    exg_max: Optional[float] = None
    vari_mean: Optional[float] = None
    vari_min: Optional[float] = None
    vari_max: Optional[float] = None
    gli_mean: Optional[float] = None
    gli_min: Optional[float] = None
    gli_max: Optional[float] = None
    date_range_start: Optional[date] = None
    satellite_image_date: date
    cloud_cover_percent: Optional[float] = None
    source_collection: str
    ndvi_png_url: Optional[str] = None
    ndmi_png_url: Optional[str] = None
    ndre_png_url: Optional[str] = None
    nbr2_png_url: Optional[str] = None
    ndwi_png_url: Optional[str] = None
    cci_png_url: Optional[str] = None
    evi_png_url: Optional[str] = None
    savi_png_url: Optional[str] = None
    exg_png_url: Optional[str] = None
    vari_png_url: Optional[str] = None
    gli_png_url: Optional[str] = None
    computed_at: datetime


class FieldNdviLatestResponse(BaseModel):
    latest: Optional[NdviHistoryItem] = None
    history: List[NdviHistoryItem] = Field(default_factory=list)


# --- Crop health summary (GET /fields/{field_id}/crop-health) ---
# A lighter-weight view than FieldNdviLatestResponse: just what the
# dashboard gauges/cards need (a single 0-100 score, a status label, and a
# minimal NDVI-only trend line) rather than every index's full stats. Backed
# by the same NdviHistory rows — see ndvi_job_service.get_field_crop_health.

class NdviTrendPoint(BaseModel):
    satellite_image_date: date
    # Optional for the same reason as NdviHistoryItem.ndvi_mean above — an
    # RGB-only drone row has no NDVI value at all.
    ndvi_mean: Optional[float] = None


class CropHealthResponse(BaseModel):
    field_id: uuid.UUID
    health_score: float = Field(...,
                                description="0-100, derived from latest NDVI mean")
    status_label: Literal["Healthy", "Stressed", "Critical", "No data"]
    ndvi_trend: List[NdviTrendPoint] = Field(default_factory=list)


# --- Free-tier ephemeral field response (never written to the DB) ---
# Returned by POST /fields instead of FieldCreateResponse when the
# caller's plan has features.data_saving == false. See
# ndvi_job_service.create_field_ephemeral.

class EphemeralFieldPayload(BaseModel):
    """Free-tier field data — never written to the DB. `id` is a
    client-generated stand-in (not a real, queryable field), since there's
    no row for it to reference."""
    id: str
    name: str
    geometry: PolygonGeometry
    area_hectares: Optional[float] = None
    district: Optional[str] = None
    crop: Optional[str] = None
    irrigation_type: Optional[IrrigationType] = None
    sowing_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime


class FieldCreateEphemeralResponse(BaseModel):
    """persisted is always False here — included so the frontend can
    branch on one flag rather than inferring it from response shape."""
    field: EphemeralFieldPayload
    persisted: bool = False
    history: List[NdviHistoryItem] = Field(default_factory=list)
