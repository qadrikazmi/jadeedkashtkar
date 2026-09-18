from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from app.core.config import settings

router = APIRouter(tags=["download"])

STATIC_DIR = Path("static").resolve()
SCAN_DIR = Path(settings.SCAN_IMAGES_DIR).resolve() if hasattr(
    settings, "SCAN_IMAGES_DIR") else STATIC_DIR


@router.get("/download/{file_path:path}")
def download_file(file_path: str):
    clean_path = file_path.replace("\\", "/").lstrip("/")
    filename = Path(clean_path).name

    print(f"\n[DOWNLOAD DEBUG] Requested file_path: {file_path}")
    print(f"[DOWNLOAD DEBUG] Target filename: {filename}")
    print(f"[DOWNLOAD DEBUG] STATIC_DIR: {STATIC_DIR}")
    print(f"[DOWNLOAD DEBUG] SCAN_DIR: {SCAN_DIR}")

    allowed_dirs = [STATIC_DIR, SCAN_DIR]
    requested = None

    # 1. Try direct path lookup
    for base_dir in allowed_dirs:
        potential = (base_dir / clean_path).resolve()
        print(
            f"[DOWNLOAD DEBUG] Checking path: {potential} (Exists: {potential.exists()})")
        if potential.exists() and potential.is_file():
            requested = potential
            break

    # 2. Fallback: Recursive search across static & scan dirs
    if not requested or not requested.exists():
        for base_dir in allowed_dirs:
            if base_dir.exists():
                matches = list(base_dir.glob(f"**/{filename}"))
                print(
                    f"[DOWNLOAD DEBUG] Glob search in {base_dir} for **/{filename}: found {len(matches)} matches")
                if matches:
                    requested = matches[0].resolve()
                    break

    if not requested or not requested.exists() or not requested.is_file():
        print(
            f"[DOWNLOAD DEBUG] ERROR: File '{filename}' not found anywhere on disk!")
        raise HTTPException(
            status_code=404,
            detail=f"File not found on disk: {clean_path}"
        )

    print(f"[DOWNLOAD DEBUG] SUCCESS: Serving file from {requested}")
    return FileResponse(
        path=str(requested),
        filename=requested.name,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{requested.name}"'
        },
    )
