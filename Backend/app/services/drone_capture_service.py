"""
DroneCapture — a labeled container for one drone flight over a field.

Files (RGB, NIR, Red Edge, etc.) uploaded for a field get grouped into a
DroneCapture rather than treated as loose files — this lets a user upload
bands separately (even days apart) and still have them combined into one
set of vegetation index results once enough tagged bands are present.
"""

import os
import uuid
import tempfile
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models.drone_capture import DroneCapture
from app.models.drone_capture_band import DroneCaptureBand, BAND_TYPES
from app.models.field import Field

try:
    import rasterio
except ImportError:
    rasterio = None

CAPTURE_BANDS_DIR = os.path.join("static", "drone_capture_bands")


def convert_to_clean_cog(src_path: str, dst_path: str) -> None:
    """
    Nuclear option: completely rewrite the GeoTIFF with no compression first,
    then turn it into a clean COG. This removes almost every 'Using code not
    yet in table' / TIFFReadEncodedStrip problem.
    """
    from rio_cogeo.cogeo import cog_translate
    from rio_cogeo.profiles import cog_profiles

    # Step 1 – rewrite to a completely uncompressed temporary TIFF
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        with rasterio.open(src_path) as src:
            profile = src.profile.copy()
            profile.update({
                "driver": "GTiff",
                "compress": "NONE",          # ← critical
                "tiled": True,
                "blockxsize": 512,
                "blockysize": 512,
                "interleave": "pixel",
                "BIGTIFF": "IF_SAFER",
            })

            # Remove any compression-related tags that can cause problems
            for key in list(profile.keys()):
                if key.upper() in (
                    "COMPRESS", "PREDICTOR", "PHOTOMETRIC",
                    "JPEG_QUALITY", "ZLEVEL", "QUALITY"
                ):
                    profile.pop(key, None)

            with rasterio.open(tmp_path, "w", **profile) as dst:
                for i in range(1, src.count + 1):
                    data = src.read(i)
                    dst.write(data, i)
                dst.transform = src.transform
                dst.crs = src.crs
                tags = src.tags()
                if tags:
                    dst.update_tags(**tags)

        # Step 2 – turn the clean uncompressed file into a proper COG
        profile = cog_profiles.get("deflate")
        profile.update({
            "BLOCKXSIZE": 512,
            "BLOCKYSIZE": 512,
            "COMPRESS": "DEFLATE",
            "PREDICTOR": 2,
            "NUM_THREADS": "ALL_CPUS",
        })

        cog_translate(
            tmp_path,
            dst_path,
            profile,
            in_memory=False,
            quiet=True,
            web_optimized=True,
        )

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def create_capture(
    db: Session, field_id: uuid.UUID, user_id: uuid.UUID, name: str | None, capture_date: date
) -> DroneCapture:
    capture = DroneCapture(
        field_id=field_id,
        user_id=user_id,
        name=name,
        capture_date=capture_date,
        status="collecting",
    )
    db.add(capture)
    db.commit()
    db.refresh(capture)
    return capture


def list_captures_for_field(db: Session, field_id: uuid.UUID) -> list[DroneCapture]:
    return (
        db.query(DroneCapture)
        .filter(DroneCapture.field_id == field_id)
        .order_by(DroneCapture.capture_date.desc())
        .all()
    )


def get_capture_or_404(db: Session, capture_id: uuid.UUID, user_id: uuid.UUID) -> DroneCapture | None:
    return (
        db.query(DroneCapture)
        .filter(DroneCapture.id == capture_id, DroneCapture.user_id == user_id)
        .first()
    )


def delete_capture(db: Session, capture: DroneCapture) -> None:
    """
    Deletes the capture, its band files off disk, its COG tile file if one
    exists, and its linked NdviHistory row (if analysis had completed) —
    so deleting a capture also makes its drone reading disappear from
    Vegetation Indices, not just the upload panel.
    """
    from app.models.ndvi_history import NdviHistory

    for band in capture.bands:
        for rel_path in (band.file_path, band.cog_path):
            if not rel_path:
                continue
            abs_path = os.path.join("static", rel_path)
            if os.path.exists(abs_path):
                try:
                    os.remove(abs_path)
                except OSError as e:
                    print(
                        f"[drone_capture_service] Could not delete file {abs_path}: {e}")

    if capture.ndvi_history_id:
        db.query(NdviHistory).filter(NdviHistory.id ==
                                     capture.ndvi_history_id).delete()

    db.delete(capture)  # cascades to bands via ondelete="CASCADE"
    db.commit()


def build_capture_response(capture: DroneCapture, base_url: str) -> dict:
    """
    tile_url is computed (base_url + band id), not a raw DB column, so it
    can't come from a plain from_attributes conversion — this builds the
    full response dict by hand instead.
    """
    bands = []
    for b in capture.bands:
        tile_url = None
        if b.tile_status == "ready" and b.cog_path:
            tile_url = (
                f"{base_url}/api/fields/{capture.field_id}/drone-captures/"
                f"{capture.id}/bands/{b.id}/tiles/{{z}}/{{x}}/{{y}}.png"
            )
        bands.append({
            "id": b.id,
            "band_type": b.band_type,
            "original_filename": b.original_filename,
            "uploaded_at": b.uploaded_at,
            "tile_status": b.tile_status,
            "tile_url": tile_url,
            "bounds": b.bounds,
            "footprint": b.footprint,
        })

    return {
        "id": capture.id,
        "field_id": capture.field_id,
        "name": capture.name,
        "capture_date": capture.capture_date,
        "status": capture.status,
        "error_message": capture.error_message,
        "ndvi_history_id": capture.ndvi_history_id,
        "bands": bands,
        "created_at": capture.created_at,
    }


async def add_band_to_capture(
    db: Session, capture: DroneCapture, file: UploadFile, band_type: str
) -> DroneCaptureBand:
    if band_type not in BAND_TYPES:
        raise ValueError(
            f"Unknown band_type '{band_type}'. Must be one of {BAND_TYPES}.")

    os.makedirs(CAPTURE_BANDS_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1].lower()
    unique_name = f"{uuid.uuid4()}{ext}"
    relative_path = os.path.join("drone_capture_bands", unique_name)
    absolute_path = os.path.join("static", relative_path)

    contents = await file.read()
    with open(absolute_path, "wb") as f:
        f.write(contents)

    # Always convert GeoTIFF to a clean version
    if ext in (".tif", ".tiff"):
        clean_name = f"{uuid.uuid4()}.tif"
        clean_relative = os.path.join("drone_capture_bands", clean_name)
        clean_absolute = os.path.join("static", clean_relative)

        conversion_ok = False
        conversion_error: Exception | None = None
        try:
            convert_to_clean_cog(absolute_path, clean_absolute)
            # Verify the new file can actually be opened and read
            with rasterio.open(clean_absolute) as test:
                # force a real read
                _ = test.read(1, window=((0, 10), (0, 10)))
            conversion_ok = True
            print(
                f"[drone_capture_service] Successfully converted {file.filename}")
        except Exception as e:
            conversion_error = e
            print(
                f"[drone_capture_service] COG conversion FAILED for {file.filename}: {e}")

        if conversion_ok:
            try:
                os.remove(absolute_path)
            except OSError:
                pass
            relative_path = clean_relative
        else:
            # IMPORTANT: do NOT silently fall back to the original file here.
            # convert_to_clean_cog already did a full per-band read of the
            # source file — if that failed, the source file itself is
            # corrupted/incomplete (this is exactly what produces the
            # "Using code not yet in table" / TIFFReadEncodedStrip crash
            # later in compute_capture_indices, just deferred to a point
            # where it's much harder to diagnose). Reject the upload
            # instead of saving a file we already know is broken.
            for path in (absolute_path, clean_absolute):
                try:
                    if os.path.exists(path):
                        os.remove(path)
                except OSError:
                    pass

            raise HTTPException(
                status_code=400,
                detail=(
                    f"'{file.filename}' could not be processed — the file "
                    "appears to be corrupted or incomplete (this can happen "
                    "if the export was interrupted or the upload was cut "
                    "off). Please re-export the file and try uploading it "
                    f"again. (Details: {conversion_error})"
                ),
            )

    band = DroneCaptureBand(
        capture_id=capture.id,
        band_type=band_type,
        original_filename=file.filename,
        file_path=relative_path,
    )
    db.add(band)
    db.commit()
    db.refresh(band)
    return band


def extract_capture_date(absolute_path: str, original_filename: str) -> date:
    """
    Reads the acquisition date embedded in the file itself — GeoTIFFs
    carry it in the TIFFTAG_DATETIME tag, JPEGs carry it in EXIF
    DateTimeOriginal — so the user never has to type a flight date by
    hand. Falls back to today's date when the file has no readable
    timestamp, so an upload is never blocked on this.
    """
    ext = os.path.splitext(original_filename)[1].lower()

    if ext in (".tif", ".tiff") and rasterio is not None:
        try:
            with rasterio.open(absolute_path) as src:
                tags = src.tags()
                raw = tags.get("TIFFTAG_DATETIME") or tags.get("DateTime")
                if raw:
                    return datetime.strptime(raw.strip(), "%Y:%m:%d %H:%M:%S").date()
        except Exception as e:
            print(
                f"[drone_capture_service] Could not read TIFF date tag from {absolute_path}: {e}")

    if ext in (".jpg", ".jpeg"):
        try:
            from PIL import Image
            from PIL.ExifTags import TAGS
            with Image.open(absolute_path) as img:
                exif = img._getexif() or {}
                for tag_id, value in exif.items():
                    if TAGS.get(tag_id) == "DateTimeOriginal":
                        return datetime.strptime(value.strip(), "%Y:%m:%d %H:%M:%S").date()
        except Exception as e:
            print(
                f"[drone_capture_service] Could not read EXIF date from {absolute_path}: {e}")

    return date.today()


def derive_capture_name(original_filename: str) -> str:
    """
    'M3_Optical_Ortho-001.tif' -> 'M3 Optical Ortho-001' — just the
    filename cleaned up for display, never invented.
    """
    stem = os.path.splitext(original_filename)[0]
    return stem.replace("_", " ").strip()


def get_or_create_capture_for_date(
    db: Session, field_id: uuid.UUID, user_id: uuid.UUID, capture_date: date, name: str
) -> DroneCapture:
    """
    Groups same-day band uploads into one capture automatically, since a
    single flight's RGB/NIR/etc. files share the same acquisition date.
    Reuses an existing capture for that date instead of creating a
    duplicate every time another band file comes in.
    """
    existing = (
        db.query(DroneCapture)
        .filter(
            DroneCapture.field_id == field_id,
            DroneCapture.user_id == user_id,
            DroneCapture.capture_date == capture_date,
        )
        .first()
    )
    if existing:
        return existing
    return create_capture(db, field_id, user_id, name, capture_date)
