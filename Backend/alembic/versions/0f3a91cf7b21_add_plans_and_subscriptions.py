"""add plans and user_subscriptions tables

Revision ID: 0f3a91cf7b21
Revises: aa18f8de0ff9
Create Date: 2026-08-23 00:00:00.000000
"""
import json
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0f3a91cf7b21'
down_revision: Union[str, Sequence[str], None] = 'aa18f8de0ff9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=8),
                  nullable=False, server_default="PKR"),
        sa.Column("is_active", sa.Boolean(),
                  nullable=False, server_default=sa.true()),
        sa.Column("features", postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_plans_slug", "plans", ["slug"])
    op.create_index("ix_plans_slug", "plans", ["slug"])

    op.create_table(
        "user_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("status", sa.String(length=32),
                  nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("current_period_end", sa.DateTime(
            timezone=True), nullable=True),
        sa.Column("payment_provider", sa.String(length=64), nullable=True),
        sa.Column("payment_reference", sa.String(length=255), nullable=True),
    )
    op.create_unique_constraint(
        "uq_user_subscriptions_user_id", "user_subscriptions", ["user_id"])
    op.create_index("ix_user_subscriptions_user_id",
                    "user_subscriptions", ["user_id"])

    # --- Seed the 5 plans from your pricing sheet, plus an internal Developer plan ---
    conn = op.get_bind()
    plans = [
        {"slug": "guest", "name": "Guest", "price_cents": None, "features": {
            "max_fields": 1, "services": [], "data_fetch_window": "1_month",
            "data_fetch_mode": "sparse", "data_saving": False,
            "external_services": False, "free_trial_days": 0,
        }},
        {"slug": "free", "name": "Free", "price_cents": None, "features": {
            "max_fields": 2, "services": ["fields", "vegetation_indices", "dashboard"],
            "data_fetch_window": "1_month", "data_fetch_mode": "sparse", "data_saving": False,
            "external_services": True, "free_trial_days": 2,
        }},
        {"slug": "starter", "name": "Starter", "price_cents": None, "features": {
            "max_fields": 5, "services": ["fields", "vegetation_indices", "dashboard", "ledger"],
            "data_fetch_window": "6_months", "data_fetch_mode": "weekly", "data_saving": True,
            "external_services": True, "free_trial_days": 2,
        }},
        {"slug": "pro", "name": "Pro", "price_cents": None, "features": {
            "max_fields": 10, "services": ["fields", "vegetation_indices", "dashboard", "ledger", "fertilizer", "drone"],
            "data_fetch_window": "2_years", "data_fetch_mode": "weekly", "data_saving": True,
            "external_services": True, "free_trial_days": 2,
        }},
        {"slug": "enterprise", "name": "Enterprise", "price_cents": None, "features": {
            "max_fields": None, "services": ["fields", "vegetation_indices", "dashboard", "ledger", "fertilizer", "drone", "disease_scanner"],
            "data_fetch_window": "unlimited", "data_fetch_mode": "weekly", "data_saving": True,
            "external_services": True, "free_trial_days": 2,
        }},
        {"slug": "developer", "name": "Developer (Internal)", "price_cents": None, "features": {
            "max_fields": None, "services": ["fields", "vegetation_indices", "dashboard", "ledger", "fertilizer", "drone", "disease_scanner"],
            "data_fetch_window": "unlimited", "data_fetch_mode": "weekly", "data_saving": True,
            "external_services": True, "free_trial_days": 0,
        }},
    ]
    for p in plans:
        conn.execute(
            sa.text("""
                INSERT INTO plans (id, name, slug, price_cents, currency, is_active, features, created_at, updated_at)
                VALUES (:id, :name, :slug, :price_cents, 'PKR', true, CAST(:features AS jsonb), now(), now())
            """),
            {"id": str(uuid.uuid4()), "name": p["name"], "slug": p["slug"],
             "price_cents": p["price_cents"], "features": json.dumps(p["features"])},
        )


def downgrade() -> None:
    op.drop_table("user_subscriptions")
    op.drop_table("plans")
