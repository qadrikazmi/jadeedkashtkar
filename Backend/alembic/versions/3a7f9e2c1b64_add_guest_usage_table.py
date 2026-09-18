"""add guest_usage table

Revision ID: 3a7f9e2c1b64
Revises: 9e2c7a1f5d84
Create Date: 2026-08-29 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '3a7f9e2c1b64'
down_revision: Union[str, Sequence[str], None] = '9e2c7a1f5d84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "guest_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("anon_id", sa.String(length=128), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )
    op.create_unique_constraint(
        "uq_guest_usage_anon_id", "guest_usage", ["anon_id"])
    op.create_index("ix_guest_usage_anon_id", "guest_usage", ["anon_id"])


def downgrade() -> None:
    op.drop_table("guest_usage")
