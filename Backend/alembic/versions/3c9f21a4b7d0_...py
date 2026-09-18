"""update starter plan for threshold-based data fetch mode

Revision ID: 3c9f21a4b7d0
Revises: 0f3a91cf7b21
Create Date: 2026-08-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = '3c9f21a4b7d0'
down_revision: Union[str, Sequence[str], None] = '0f3a91cf7b21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE plans
        SET features = features || '{
            "data_fetch_mode": "threshold",
            "full_weekly_max_days": 183,
            "sparse_points": 24
        }'::jsonb,
        updated_at = now()
        WHERE slug = 'starter'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE plans
        SET features = features - 'full_weekly_max_days' - 'sparse_points'
                        || '{"data_fetch_mode": "weekly"}'::jsonb,
        updated_at = now()
        WHERE slug = 'starter'
    """)