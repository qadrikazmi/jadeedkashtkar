"""add is_admin to users

Revision ID: c8dcf4bc6e4a
Revises: cc202149fcc5
Create Date: 2026-09-08 23:35:22.644378

"""
from alembic import op
import sqlalchemy as sa

revision = "c8dcf4bc6e4a"
down_revision = "cc202149fcc5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False,
                  server_default=sa.false()),
    )


def downgrade():
    op.drop_column("users", "is_admin")
