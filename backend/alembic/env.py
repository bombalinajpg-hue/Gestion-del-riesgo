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
from sqlalchemy import engine_from_config, event, pool, text

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

    # En Supabase, PostGIS vive en el schema `extensions`. Lo añadimos al
    # search_path a nivel del DBAPI (psycopg2) apenas cada conexión se
    # establece, ANTES de que SQLAlchemy/Alembic hagan cualquier cosa.
    # Esto es a prueba de pool y de transacciones: sin esto, Alembic
    # falla con `type "geometry" does not exist` al crear las tablas.
    # El event se dispara en cada `connect()` físico del pool.
    @event.listens_for(connectable, "connect")
    def _set_search_path(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("SET search_path TO public, extensions")
        finally:
            cursor.close()
        dbapi_connection.commit()  # asegurar que el SET persiste

    with connectable.connect() as connection:
        # Redundante pero barato: ejecutar el SET también a nivel
        # SQLAlchemy por si el event listener no disparó por alguna
        # razón (ej. pool warmup previo).
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
