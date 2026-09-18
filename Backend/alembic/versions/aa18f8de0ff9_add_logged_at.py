"""add logged at

Revision ID: aa18f8de0ff9
Revises: 47f755f9da49
Create Date: 2026-08-21 10:45:27.100014

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa18f8de0ff9'
down_revision: Union[str, Sequence[str], None] = '47f755f9da49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE ledger_entries SET logged_at = timestamp")
    op.alter_column("ledger_entries", "logged_at", nullable=False)


def downgrade() -> None:
    op.drop_column("ledger_entries", "logged_at")
