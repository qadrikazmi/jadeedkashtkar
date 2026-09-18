"""
Backward-compat shim.

Previously this file created its OWN engine/SessionLocal/Base, separate
from app/db/session.py's — two disconnected declarative_base() objects.
Now everything lives in app/db/session.py and app/db/base.py; this file
just re-exports the same objects, so any existing
`from app.core.database import get_db` (or engine, SessionLocal, Base)
import keeps working without change, and there's only ever one engine.

Prefer importing from app.db.session / app.db.base in new code.
"""

from app.db.base import Base  # noqa: F401
from app.db.session import SessionLocal, engine, get_db  # noqa: F401
