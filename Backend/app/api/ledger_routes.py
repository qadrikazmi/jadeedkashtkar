import re
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.ledger import (
    LedgerCategoryCreateRequest,
    LedgerEntryCreateRequest,
    LedgerEntryResponse,
    LedgerEntryUpdateRequest,
    ReportResponse,
)
from app.services.ledger_service import (
    build_report,
    create_ledger_category,
    create_ledger_entry,
    delete_ledger_entry,
    list_ledger_categories,
    list_ledger_entries_for_user,
    update_ledger_entry,
)
from app.services.report_pdf import render_report_pdf

router = APIRouter(tags=["Ledger & Report"])


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "field"


@router.post("/ledger", response_model=LedgerEntryResponse, status_code=201)
def post_ledger_entry(
    entry_in: LedgerEntryCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_ledger_entry(db, current_user.id, entry_in)


@router.get("/ledger", response_model=list[LedgerEntryResponse])
def get_ledger_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_ledger_entries_for_user(db, current_user.id)


@router.patch("/ledger/{entry_id}", response_model=LedgerEntryResponse)
def patch_ledger_entry(
    entry_id: uuid.UUID,
    entry_in: LedgerEntryUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_ledger_entry(db, current_user.id, entry_id, entry_in)


@router.delete("/ledger/{entry_id}", status_code=204)
def delete_ledger_entry_endpoint(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    delete_ledger_entry(db, current_user.id, entry_id)


@router.get("/ledger/categories", response_model=list[str])
def get_ledger_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_ledger_categories(db, current_user.id)


@router.post("/ledger/categories", response_model=list[str], status_code=201)
def post_ledger_category(
    category_in: LedgerCategoryCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_ledger_category(db, current_user.id, category_in.name)


@router.get("/report", response_model=ReportResponse)
def get_report(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_report(db, current_user.id, field_id)


@router.get("/report/pdf")
def get_report_pdf(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = build_report(db, current_user.id, field_id)
    pdf_bytes = render_report_pdf(report)
    filename = f"production-report-{_slugify(report.field_name)}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
