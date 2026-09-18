"""merge reset_otp and orders branches

Revision ID: f03b8115cc6b
Revises: 979b1db2b31e, 2f8c4d6a9e13
Create Date: 2026-08-30 13:30:30.312095

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f03b8115cc6b'
down_revision: Union[str, Sequence[str], None] = ('979b1db2b31e', '2f8c4d6a9e13')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
