"""
LedgerEntry — one farm-input/operation record per the design's Digital
Ledger timeline (log-action form -> prepended entry). Always tied to a
field (matches the `LedgerEntry { ..., fieldId }` data contract).

Each entry carries an optional money `amount` and an `entry_type`
("expense" money out, or "income" — a sale / "sold" operation), which the
production report totals into spent/earned. `category` is a free string (not
a native enum) so users can create their own heads beyond the built-ins
below; the per-user custom heads live in LedgerCategoryRow.
"""

import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.field import Field


class LedgerCategory(str, enum.Enum):
    """The built-in heads every user starts with. Kept as an enum for the
    constant names; the DB column is a free String, so custom heads add no
    schema. `Sale` is the natural default head for income ("sold") entries."""

    Fertilizer = "Fertilizer"
    Irrigation = "Irrigation"
    Spray = "Spray"
    Operation = "Operation"
    Scan = "Scan"
    Sale = "Sale"


BUILTIN_LEDGER_CATEGORIES: list[str] = [c.value for c in LedgerCategory]

LEDGER_ENTRY_TYPES = ("expense", "income")


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True)
    # "expense" (money out) | "income" (a sale / "sold" operation). Server
    # default keeps existing rows and the scan-logging path valid.
    entry_type: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="expense")

    # User-facing entry date/time — settable at create/edit time to allow
    # backdating. Not the true insert time; see created_at for that.
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Real wall-clock moment this entry was first logged. Deliberately
    # separate from `timestamp` (which is noon-UTC-anchored for date-safety
    # across the Asia/Karachi conversion — see ledger_service._resolve_timestamp)
    # and from `created_at` (DB-insert bookkeeping). This is the only one of
    # the three meant to answer "what time did I actually log this," so it's
    # what the Timeline UI displays. Set once on creation; edits never touch
    # it, so the original log time is preserved even if the entry's date or
    # amount is corrected later.
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    field: Mapped["Field"] = relationship("Field")

    def __repr__(self) -> str:
        return f"<LedgerEntry id={self.id} field_id={self.field_id} category={self.category}>"


class LedgerCategoryRow(Base):
    """A user-created ledger head. The built-ins (BUILTIN_LEDGER_CATEGORIES)
    are virtual — only custom heads are stored — and the two are merged when
    listing categories for the entry-form dropdown."""

    __tablename__ = "ledger_categories"
    __table_args__ = (UniqueConstraint("user_id", "name",
                      name="uq_ledger_category_user_name"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    def __repr__(self) -> str:
        return f"<LedgerCategoryRow user_id={self.user_id} name={self.name}>"
