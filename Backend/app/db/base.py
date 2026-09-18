"""
The ONE declarative Base for the whole app.

Both app/db/session.py and app/core/database.py import Base from here —
neither creates its own anymore. This is what fixes the "two disconnected
Base objects" issue: every model in app/models/ does
`from app.db.base import Base`, so this file is what actually needs to be
imported (directly or indirectly) before Base.metadata.create_all() or
Alembic autogenerate will see all your tables.
"""

from sqlalchemy.orm import declarative_base

Base = declarative_base()
