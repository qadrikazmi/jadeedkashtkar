"""add orders table for checkout/payment tracking

Revision ID: 2f8c4d6a9e13
Revises: 9d4b6e2a1f57
Create Date: 2026-08-26 00:00:00.000000
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '2f8c4d6a9e13'
down_revision: Union[str, Sequence[str], None] = '9d4b6e2a1f57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8),
                  nullable=False, server_default="PKR"),
        sa.Column("status", sa.String(length=32),
                  nullable=False, server_default="pending"),
        sa.Column("provider", sa.String(length=32),
                  nullable=False, server_default="stub"),
        sa.Column("provider_reference", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"])
    op.create_index("ix_orders_status", "orders", ["status"])


def downgrade() -> None:
    op.drop_table("orders")
