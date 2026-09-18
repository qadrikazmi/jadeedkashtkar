import uuid

from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.field import Field
from app.schemas.field import FieldResponse
from app.schemas.geometry import PolygonGeometry


def field_to_response(field: Field) -> FieldResponse:
    """
    Converts a Field ORM instance (whose `geometry` is a PostGIS WKB
    element) into a FieldResponse with a proper GeoJSON PolygonGeometry.
    Needed because Pydantic's from_attributes can't do this conversion
    automatically — WKB isn't GeoJSON.
    """
    shapely_geom = to_shape(field.geometry)
    geojson_dict = mapping(shapely_geom)

    return FieldResponse(
        id=field.id,
        name=field.name,
        geometry=PolygonGeometry(
            type="Polygon",
            coordinates=[[list(coord) for coord in ring]
                         for ring in geojson_dict["coordinates"]],
        ),
        area_hectares=field.area_hectares,
        district=field.district,
        crop=field.crop,
        irrigation_type=field.irrigation_type,
        sowing_date=field.sowing_date,
        created_at=field.created_at,
        updated_at=field.updated_at,
    )


def list_fields_for_user(db: Session, user_id: uuid.UUID):
    return db.query(Field).filter(Field.user_id == user_id).order_by(Field.created_at.desc()).all()


def get_field_or_404(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> Field:
    field = db.query(Field).filter(Field.id == field_id,
                                   Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()
    return field


def delete_field(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> None:
    """
    Row-level delete; ndvi_history/ndvi_jobs/alerts/ledger_entries for this
    field all have ON DELETE CASCADE foreign keys (see the Alembic
    migrations), so Postgres cleans up the related rows itself.
    """
    field = get_field_or_404(db, user_id, field_id)
    db.delete(field)
    db.commit()
