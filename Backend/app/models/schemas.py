from pydantic import BaseModel, EmailStr, Field, validator
from typing import Any, Dict, Optional
from datetime import datetime


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)


class AnalysisRequest(BaseModel):
    polygon: Dict[str, Any]
    date: str
    index: str
    max_cloud: int = Field(20, ge=0, le=100)

    @validator("date")
    def validate_date(cls, v):
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v

    @validator("index")
    def validate_index(cls, v):
        allowed = ["NDVI", "NDWI", "EVI", "SAVI", "NDMI", "NBR"]
        if v not in allowed:
            raise ValueError(f"Index must be one of: {', '.join(allowed)}")
        return v

    @validator("polygon")
    def validate_polygon(cls, v):
        geometry = v.get("geometry") if "geometry" in v else v

        if not geometry:
            raise ValueError("Polygon is missing")

        if geometry.get("type") != "Polygon":
            raise ValueError("Only Polygon geometry is supported")

        coordinates = geometry.get("coordinates")
        if not coordinates or not isinstance(coordinates, list):
            raise ValueError("Invalid polygon coordinates")

        return v


class Bounds(BaseModel):
    west: float
    south: float
    east: float
    north: float


class AnalysisResponse(BaseModel):
    status: str
    message: str
    request_id: str
    index: str
    date: str
    max_cloud: int
    stats: Optional[Dict[str, Any]] = None
    overlay_image: Optional[str] = None  # base64 PNG, no data-URI prefix
    bounds: Optional[Bounds] = None
