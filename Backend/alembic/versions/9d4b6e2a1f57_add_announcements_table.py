"""add announcements table for landing-page banners

Revision ID: 9d4b6e2a1f57
Revises: 7a2e5f918c3d
Create Date: 2026-08-25 00:00:00.000000
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '9d4b6e2a1f57'
down_revision: Union[str, Sequence[str], None] = '7a2e5f918c3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("discount_percent", sa.Integer(), nullable=True),
        # null = applies to all plans
        sa.Column("plan_slug", sa.String(length=64), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(),
                  nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_announcements_active_window", "announcements", [
                    "is_active", "starts_at", "ends_at"])


def downgrade() -> None:
    op.drop_table("announcements")
