"""
Digital ledger CRUD + field-scoped production report.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import (
    BaselineNotFoundError,
    FieldNotFoundError,
    FutureEntryDateError,
    LedgerEntryNotFoundError,
)
from app.models.field import Field
from app.models.ledger_entry import (
    BUILTIN_LEDGER_CATEGORIES,
    LedgerCategoryRow,
    LedgerEntry,
)
from app.models.ndvi_history import NdviHistory
from app.schemas.ledger import (
    LedgerEntryCreateRequest,
    LedgerEntryUpdateRequest,
    ReportResponse,
    TransactionItem,
)
from app.services.crop_health_service import get_crop_health
from app.services.field_service import get_field_or_404


def _resolve_timestamp(entry_date: Optional[date]) -> datetime:
    """Anchor a user-picked entry date at noon UTC. Noon (not midnight, and
    not the current time-of-day) matters: this DB's session TimeZone is
    Asia/Karachi (+5), so TIMESTAMPTZ values are converted to +05:00 on every
    read. Combining `entry_date` with the current UTC time-of-day would push
    the displayed local date across midnight for part of each day (reliably
    reproduced during Karachi's ~00:00-05:00 window), silently landing the
    entry on the wrong day. Noon UTC has +-12h of headroom either side, so no
    realistic timezone conversion flips the calendar date. Same-day entries
    still sort deterministically via the created_at tie-break (see
    list_ledger_entries_for_user/build_report), so no time-of-day precision is
    lost by using a fixed anchor. Rejects dates more than a day in the future
    - the day of slack covers positive UTC offsets, where a user's local
    "today" can be one calendar day ahead of the server's UTC "today"."""
    now = datetime.now(timezone.utc)
    if entry_date is None:
        return now
    if entry_date > (now.date() + timedelta(days=1)):
        raise FutureEntryDateError()
    return datetime(entry_date.year, entry_date.month, entry_date.day, 12, tzinfo=timezone.utc)


def _get_owned_entry(db: Session, user_id: uuid.UUID, entry_id: uuid.UUID) -> LedgerEntry:
    entry = (
        db.query(LedgerEntry)
        .join(Field)
        .filter(LedgerEntry.id == entry_id, Field.user_id == user_id)
        .first()
    )
    if entry is None:
        raise LedgerEntryNotFoundError()
    return entry


def create_ledger_entry(
    db: Session, user_id: uuid.UUID, entry_in: LedgerEntryCreateRequest
) -> LedgerEntry:
    field = db.query(Field).filter(
        Field.id == entry_in.field_id, Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    # Any head used is remembered so it stays in the dropdown next time, even
    # if it wasn't created explicitly via POST /ledger/categories first.
    _register_category(db, user_id, entry_in.category)

    entry = LedgerEntry(
        field_id=entry_in.field_id,
        title=entry_in.title,
        detail=entry_in.detail,
        category=entry_in.category,
        amount=entry_in.amount,
        entry_type=entry_in.entry_type,
        timestamp=_resolve_timestamp(entry_in.entry_date),
        # Real wall-clock moment of creation — separate from `timestamp`,
        # which is deliberately noon-UTC-anchored for date-safety (see
        # _resolve_timestamp docstring) and therefore useless for display.
        # This is what the Timeline actually shows.
        logged_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_ledger_entry(
    db: Session, user_id: uuid.UUID, entry_id: uuid.UUID, entry_in: LedgerEntryUpdateRequest
) -> LedgerEntry:
    entry = _get_owned_entry(db, user_id, entry_id)

    _register_category(db, user_id, entry_in.category)

    entry.title = entry_in.title
    entry.detail = entry_in.detail
    entry.category = entry_in.category
    entry.amount = entry_in.amount
    entry.entry_type = entry_in.entry_type
    entry.timestamp = _resolve_timestamp(entry_in.entry_date)
    # logged_at deliberately NOT touched here — it records the real moment
    # the entry was first logged, and an edit (even one that changes the
    # entry_date) shouldn't rewrite history about when that happened.
    db.commit()
    db.refresh(entry)
    return entry


def delete_ledger_entry(db: Session, user_id: uuid.UUID, entry_id: uuid.UUID) -> None:
    entry = _get_owned_entry(db, user_id, entry_id)
    db.delete(entry)
    db.commit()


def _register_category(db: Session, user_id: uuid.UUID, name: str) -> None:
    """Persist a custom head so it's reusable. No-op for built-ins or dupes.
    Adds to the session without committing — the caller's commit covers it."""
    if name in BUILTIN_LEDGER_CATEGORIES:
        return
    exists = (
        db.query(LedgerCategoryRow)
        .filter(LedgerCategoryRow.user_id == user_id, LedgerCategoryRow.name == name)
        .first()
    )
    if exists is None:
        db.add(LedgerCategoryRow(user_id=user_id, name=name))


def list_ledger_categories(db: Session, user_id: uuid.UUID) -> list[str]:
    """Built-in heads first, then the user's custom heads (alphabetical)."""
    custom = (
        db.query(LedgerCategoryRow.name)
        .filter(LedgerCategoryRow.user_id == user_id)
        .order_by(LedgerCategoryRow.name)
        .all()
    )
    return BUILTIN_LEDGER_CATEGORIES + [name for (name,) in custom]


def create_ledger_category(db: Session, user_id: uuid.UUID, name: str) -> list[str]:
    _register_category(db, user_id, name)
    db.commit()
    return list_ledger_categories(db, user_id)


def list_ledger_entries_for_user(db: Session, user_id: uuid.UUID) -> list[LedgerEntry]:
    return (
        db.query(LedgerEntry)
        .join(Field)
        .filter(Field.user_id == user_id)
        # created_at tie-breaks entries that share the same (now user-editable)
        # entry date, so same-day ordering stays deterministic.
        .order_by(LedgerEntry.timestamp.desc(), LedgerEntry.created_at.desc())
        .all()
    )


def build_report(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> ReportResponse:
    field = get_field_or_404(db, user_id, field_id)

    entries = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.field_id == field_id)
        .order_by(LedgerEntry.timestamp.asc(), LedgerEntry.created_at.asc())
        .all()
    )

    total_spent = round(
        sum(float(e.amount)
            for e in entries if e.amount is not None and e.entry_type == "expense"), 2
    )
    total_earned = round(
        sum(float(e.amount)
            for e in entries if e.amount is not None and e.entry_type == "income"), 2
    )
    net = round(total_earned - total_spent, 2)

    # A missing yield baseline (district+crop AND the DEFAULT/DEFAULT
    # fallback both absent — see DistrictYieldBaseline docstring, which
    # promises the fallback always exists but it currently doesn't in this
    # database) previously crashed the *entire* report with an unhandled
    # AttributeError -> 500 -> browser-reported CORS failure. A field's
    # financial ledger (spend/earn/net, transaction list) has nothing to do
    # with its NDVI baseline, so there's no reason a missing baseline should
    # take down data that's otherwise perfectly available. Degrade instead:
    # health_score/ndvi_mean come back null and the rest of the report is
    # unaffected. The frontend already renders null stats as "—".
    try:
        health = get_crop_health(db, user_id, field_id)
        health_score = health.health_score
    except BaselineNotFoundError:
        health_score = None

    latest_history = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.desc())
        .first()
    )

    transactions = [
        TransactionItem(
            id=e.id,
            timestamp=e.timestamp,
            logged_at=e.logged_at,
            category=e.category,
            title=e.title,
            detail=e.detail,
            amount=float(e.amount) if e.amount is not None else None,
            entry_type=e.entry_type,
        )
        for e in entries
    ]

    return ReportResponse(
        field_name=field.name,
        crop=field.crop,
        area_hectares=field.area_hectares,
        ndvi_mean=latest_history.ndvi_mean if latest_history else None,
        health_score=health_score,
        transactions=transactions,
        total_spent=total_spent,
        total_earned=total_earned,
        net=net,
        generated_at=datetime.now(timezone.utc),
    )
