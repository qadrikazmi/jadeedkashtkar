"""add has_used_trial to user_subscriptions

Revision ID: 6b1d3e9f4a52
Revises: f03b8115cc6b
Create Date: 2026-08-27 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '6b1d3e9f4a52'
down_revision: Union[str, Sequence[str], None] = 'f03b8115cc6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_subscriptions",
        sa.Column("has_used_trial", sa.Boolean(),
                  nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("user_subscriptions", "has_used_trial")
