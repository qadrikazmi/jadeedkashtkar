import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


class DroneCaptureBandResponse(BaseModel):
    id: uuid.UUID
    band_type: str  # "rgb" | "nir" | "red_edge" | "swir1" | "swir2" | "thermal" | "unknown"
    original_filename: str
    uploaded_at: datetime

    tile_status: str = "pending"  # "pending" | "ready" | "failed"
    tile_url: Optional[str] = None
    bounds: Optional[List[List[float]]] = None
    footprint: Optional[List[List[float]]] = None

    class Config:
        from_attributes = True


class DroneCaptureResponse(BaseModel):
    id: uuid.UUID
    field_id: uuid.UUID
    name: Optional[str] = None
    capture_date: date
    status: str  # "collecting" | "processing" | "done" | "failed"
    error_message: Optional[str] = None
    ndvi_history_id: Optional[uuid.UUID] = None
    bands: List[DroneCaptureBandResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


class DroneCaptureCreateRequest(BaseModel):
    name: Optional[str] = None
    capture_date: date


class DroneCaptureDateUpdateRequest(BaseModel):
    """
    Manual correction for when the flight date auto-extracted from the
    file's own metadata (TIFFTAG_DATETIME / EXIF DateTimeOriginal) is
    wrong or missing — common for orthomosaics, where processing software
    often stamps the export date instead of the real flight date. Not
    tied to any particular band type; applies the same way whether the
    capture has RGB, NIR, Red Edge, SWIR, or any combination.
    """
    capture_date: date
