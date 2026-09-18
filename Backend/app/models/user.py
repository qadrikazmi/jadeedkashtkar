"""
User model.

full_name and phone_number were added to support the profile section of
Settings — previously this table was intentionally minimal (see git history
/ original docstring) and only had auth fields (email, hashed_password).

reset_otp + reset_otp_expires were added for the phone OTP password-reset flow.

is_admin was added to support the admin panel (/admin) — gates access to
admin-only routes (user list, plan changes, etc.) via a require_admin
dependency.
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.field import Field


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    is_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Profile fields
    full_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    phone_number: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True, index=True   # indexed for OTP lookups
    )

    # ---------- Phone OTP reset ----------
    reset_otp: Mapped[Optional[str]] = mapped_column(
        String(6), nullable=True
    )
    reset_otp_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    fields: Mapped[List["Field"]] = relationship(
        "Field", back_populates="owner", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"
