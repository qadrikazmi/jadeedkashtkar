import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.ledger_entry import LEDGER_ENTRY_TYPES

LedgerEntryType = Literal["expense", "income"]
# keep schema + model in sync
assert set(LEDGER_ENTRY_TYPES) == {"expense", "income"}


class LedgerEntryCreateRequest(BaseModel):
    field_id: uuid.UUID
    title: str
    detail: str
    # Free string so users can log against their own heads, not just built-ins.
    category: str = Field(min_length=1, max_length=64)
    amount: Optional[float] = Field(default=None, ge=0)
    entry_type: LedgerEntryType = "expense"
    # Lets a user backdate an entry. Omitted -> now (unchanged behavior).
    entry_date: Optional[date] = None


class LedgerEntryUpdateRequest(BaseModel):
    """Same editable surface as create, minus field_id — which field an entry
    belongs to is locked on edit; move it by deleting and re-creating."""

    title: str
    detail: str
    category: str = Field(min_length=1, max_length=64)
    amount: Optional[float] = Field(default=None, ge=0)
    entry_type: LedgerEntryType = "expense"
    entry_date: Optional[date] = None


class LedgerEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    field_id: uuid.UUID
    title: str
    detail: str
    category: str
    amount: Optional[float]
    entry_type: str
    timestamp: datetime
    # Real time-of-logging, separate from `timestamp` (which is
    # noon-UTC-anchored purely for date-safety — see
    # ledger_service._resolve_timestamp — and is no longer meant for
    # display). The frontend Timeline should show this field, not
    # `timestamp`.
    logged_at: datetime


class LedgerCategoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class TransactionItem(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    logged_at: datetime
    category: str
    title: str
    detail: str
    amount: Optional[float]
    entry_type: str


class ReportResponse(BaseModel):
    field_name: str
    crop: Optional[str]
    area_hectares: Optional[float]
    ndvi_mean: Optional[float]
    health_score: Optional[int]
    transactions: list[TransactionItem]
    total_spent: float
    total_earned: float
    net: float
    generated_at: datetime
