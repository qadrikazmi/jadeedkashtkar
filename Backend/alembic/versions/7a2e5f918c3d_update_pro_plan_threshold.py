"""update pro plan for threshold-based data fetch mode

Revision ID: 7a2e5f918c3d
Revises: 3c9f21a4b7d0
Create Date: 2026-08-24 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = '7a2e5f918c3d'
down_revision: Union[str, Sequence[str], None] = '3c9f21a4b7d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE plans
        SET features = features || '{
            "data_fetch_mode": "threshold",
            "full_weekly_max_days": 730,
            "sparse_points": 104
        }'::jsonb,
        updated_at = now()
        WHERE slug = 'pro'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE plans
        SET features = features - 'full_weekly_max_days' - 'sparse_points'
                        || '{"data_fetch_mode": "weekly"}'::jsonb,
        updated_at = now()
        WHERE slug = 'pro'
    """)
