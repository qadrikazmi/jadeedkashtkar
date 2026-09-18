from typing import List, Literal

from pydantic import BaseModel, Field, field_validator


class PolygonGeometry(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[List[float]]]

    @field_validator("coordinates")
    @classmethod
    def validate_ring_structure(cls, v):
        if not v or len(v) == 0:
            raise ValueError("Polygon must have at least one ring")
        for ring in v:
            if len(ring) < 4:
                raise ValueError(
                    "Each polygon ring must have at least 4 coordinate pairs "
                    "(first and last must match to close the ring)"
                )
            if ring[0] != ring[-1]:
                raise ValueError(
                    "Polygon ring must be closed (first point == last point)")
            for coord in ring:
                if len(coord) != 2:
                    raise ValueError(
                        "Each coordinate must be [longitude, latitude]")
                lon, lat = coord
                if not (-180 <= lon <= 180):
                    raise ValueError(
                        f"Longitude {lon} out of range [-180, 180]")
                if not (-90 <= lat <= 90):
                    raise ValueError(f"Latitude {lat} out of range [-90, 90]")
        return v


class GeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PolygonGeometry
    properties: dict = Field(default_factory=dict)
