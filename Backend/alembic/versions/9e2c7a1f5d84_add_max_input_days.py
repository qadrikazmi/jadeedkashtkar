"""add max_input_days to plans

Revision ID: 9e2c7a1f5d84
Revises: 6b1d3e9f4a52
Create Date: 2026-08-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = '9e2c7a1f5d84'
down_revision: Union[str, Sequence[str], None] = '6b1d3e9f4a52'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE plans SET features = features || '{\"max_input_days\": 31}'::jsonb WHERE slug = 'free'")
    op.execute(
        "UPDATE plans SET features = features || '{\"max_input_days\": 183}'::jsonb WHERE slug = 'starter'")
    op.execute(
        "UPDATE plans SET features = features || '{\"max_input_days\": 730}'::jsonb WHERE slug = 'pro'")


def downgrade() -> None:
    op.execute(
        "UPDATE plans SET features = features - 'max_input_days' WHERE slug IN ('free','starter','pro')")
