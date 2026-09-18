"""
Engine + SessionLocal + get_db — the ONE place these are created.

app/core/database.py re-exports these instead of creating its own copies
(it used to create a second engine/SessionLocal/Base — that's what caused
the split-metadata issue). If any existing code does
`from app.core.database import get_db` it will keep working unchanged.
"""

from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.base import Base  # noqa: F401 — re-exported for convenience/back-compat

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # avoids "server closed the connection unexpectedly"
    # against Supabase's pooler after idle periods — but pre_ping only
    # catches a dead connection AT CHECKOUT time, right before a request
    # uses it. pool_recycle below closes the other half of the gap: it
    # proactively retires connections before they get old enough for
    # Supabase's pooler to have silently dropped them in the first place.
    # This matters more now that heavy drone background jobs can pin the
    # CPU for long stretches — a connection sitting idle in the pool
    # during that time is more likely to outlive the pooler's own
    # idle-timeout (commonly ~300-600s on hosted Postgres/pgbouncer setups).
    pool_recycle=280,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Iterator[Session]:
    """FastAPI dependency — yields a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
