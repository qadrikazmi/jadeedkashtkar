import app.models  # the package itself
import importlib
import pkgutil
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# --- Make sure we can import the app package (app/db/base.py, app/models/, app/core/config.py) ---
import os
import sys

sys.path.append(os.getcwd())

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402

# --- Import every model module so Base.metadata actually knows about all your tables. ---
# Without this, autogenerate only sees whatever happens to already be
# imported by the time this file runs — which, since app/db/base.py itself
# only declares an empty Base, would otherwise be nothing. Missing models
# here can cause autogenerate to think a table was deleted and generate a
# DROP TABLE migration for it, so this loop is not optional.

for _, module_name, _ in pkgutil.iter_modules(app.models.__path__, prefix="app.models."):
    importlib.import_module(module_name)

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Use the app's real DATABASE_URL (from .env via Settings) instead of
# whatever placeholder alembic.ini has — this is what fixed
# "column users.full_name does not exist": before this, autogenerate wasn't
# necessarily even pointed at the same Postgres database the app itself
# uses.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# PostGIS (enabled on this Supabase project) owns a few system tables that
# aren't part of our app's models. Without this filter, autogenerate sees
# them in the database, doesn't see them in Base.metadata, and generates a
# DROP TABLE for them — which then fails at migration time because the
# postgis extension depends on them. Exclude by name instead of trying to
# keep this list exhaustive; extend if PostGIS adds more.
POSTGIS_MANAGED_TABLES = {"spatial_ref_sys"}


def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and name in POSTGIS_MANAGED_TABLES:
        return False
    return True

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
