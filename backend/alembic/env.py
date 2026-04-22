"""
Entorno de Alembic — adaptado para SQLAlchemy 2.0 async.

Alembic corre en modo sync (no async), así que:
  · Tomamos la URL async del settings (`postgresql+asyncpg://...`).
  · La convertimos a sync (`postgresql+psycopg://...` o similar) SOLO
    para generar migraciones. Acá usamos psycopg2 implícito al quitar
    el `+asyncpg`.
  · Los modelos se importan para que autogenerate detecte cambios.
"""

from logging.config import fileConfig

from alembic import context
from geoalchemy2 import alembic_helpers
from sqlalchemy import engine_from_config, pool, text

from app.config import settings
from app.db import Base
from app import models  # noqa: F401 — fuerza registro de todas las tablas

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _sync_url(async_url: str) -> str:
    """Quita el driver async para que Alembic use el driver sync.
    `postgresql+asyncpg://...` → `postgresql://...` (psycopg2 default)."""
    return async_url.replace("+asyncpg", "")


target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Genera SQL sin tocar DB — útil para CI / revisar diffs."""
    url = _sync_url(settings.database_url)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=alembic_helpers.include_object,
        process_revision_directives=alembic_helpers.writer,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Modo normal: se conecta a la DB y aplica migraciones."""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _sync_url(settings.database_url)
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # En Supabase, PostGIS vive en el schema `extensions`. Lo
        # añadimos al `search_path` apenas abre la conexión para que
        # los `CREATE TABLE ... geometry(...)` encuentren el tipo.
        # Sin esto, Alembic falla con `type "geometry" does not exist`.
        connection.execute(text("SET search_path TO public, extensions"))
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=alembic_helpers.include_object,
            process_revision_directives=alembic_helpers.writer,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
