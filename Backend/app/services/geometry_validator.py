from shapely.geometry import Polygon, shape
from shapely.validation import explain_validity

from app.exceptions.custom_exceptions import InvalidGeometryError
from app.schemas.geometry import PolygonGeometry

MAX_AREA_HECTARES = 5000.0
MIN_AREA_HECTARES = 0.001


def geojson_to_shapely(geometry: PolygonGeometry) -> Polygon:
    geojson_dict = {"type": geometry.type, "coordinates": geometry.coordinates}
    try:
        polygon = shape(geojson_dict)
    except Exception as e:
        raise InvalidGeometryError(f"Could not parse geometry: {e}")

    if not polygon.is_valid:
        reason = explain_validity(polygon)
        raise InvalidGeometryError(f"Polygon is not valid: {reason}")

    if polygon.is_empty:
        raise InvalidGeometryError("Polygon is empty")

    return polygon


def calculate_area_hectares(polygon: Polygon) -> float:
    # Rough equal-area approximation: project degrees to meters using a
    # local latitude-based scale factor, good enough for field-sized
    # polygons. For very large or high-precision needs, reproject via
    # PostGIS ST_Transform to a proper equal-area CRS instead.
    import math

    centroid_lat = polygon.centroid.y
    meters_per_degree_lat = 111_320.0
    meters_per_degree_lon = 111_320.0 * math.cos(math.radians(centroid_lat))

    coords = list(polygon.exterior.coords)
    projected = [(x * meters_per_degree_lon, y * meters_per_degree_lat)
                 for x, y in coords]
    projected_polygon = Polygon(projected)

    area_m2 = projected_polygon.area
    return round(area_m2 / 10_000.0, 4)


def validate_polygon(geometry: PolygonGeometry) -> Polygon:
    polygon = geojson_to_shapely(geometry)

    area_ha = calculate_area_hectares(polygon)
    if area_ha < MIN_AREA_HECTARES:
        raise InvalidGeometryError(
            f"Polygon area ({area_ha} ha) is too small to analyze"
        )
    if area_ha > MAX_AREA_HECTARES:
        raise InvalidGeometryError(
            f"Polygon area ({area_ha} ha) exceeds the maximum allowed ({MAX_AREA_HECTARES} ha)"
        )

    if len(list(polygon.interiors)) > 0:
        raise InvalidGeometryError(
            "Polygons with holes are not currently supported")

    return polygon
