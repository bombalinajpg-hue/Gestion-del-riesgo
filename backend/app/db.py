"""
Conexión async a Postgres + base declarativa de SQLAlchemy 2.0.

Exponemos:
 · `engine`   → AsyncEngine compartido (pool de conexiones).
 · `SessionLocal` → AsyncSession factory usado por `get_db()`.
 · `Base`     → base declarativa para modelos.
 · `get_db()` → dependency de FastAPI que entrega una sesión y la cierra.

SQLAlchemy 2.0 + GeoAlchemy2 ya manejan tipos PostGIS nativamente.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    """Base declarativa — todos los modelos heredan de acá."""


def _normalize_async_url(url: str) -> str:
    """Convierte URLs de Postgres síncronas a asyncpg.

    Railway / Heroku / Render entregan `DATABASE_URL` como
    `postgres://...` o `postgresql://...`, que SQLAlchemy interpreta
    como driver síncrono psycopg2. Acá usamos el driver async `asyncpg`,
    por lo que el scheme correcto es `postgresql+asyncpg://...`.
    Transformarlo acá evita que el usuario tenga que saber esto al
    configurar la variable en el dashboard del host.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


engine = create_async_engine(
    _normalize_async_url(settings.database_url),
    echo=settings.is_dev,          # en dev logueamos SQL para debug
    pool_pre_ping=True,            # reconecta si la DB se reinició
    pool_size=5,
    max_overflow=10,
    # En Supabase, PostGIS vive en el schema `extensions`. Sin este
    # setting, el `search_path` de la sesión solo incluye `public` y
    # las funciones/tipos de PostGIS (`geometry`, `ST_DWithin`, etc.)
    # no son encontrados. `server_settings` se aplica cada vez que
    # asyncpg abre una nueva conexión física, así que cubre tanto las
    # conexiones directas como las que vienen del pooler de Supabase.
    connect_args={
        "server_settings": {
            "search_path": "public, extensions",
        },
    },
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,        # los objetos quedan usables tras commit
    autoflush=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Dependency inyectable en endpoints:

    ```
    @router.get("/...")
    async def handler(db: AsyncSession = Depends(get_db)): ...
    ```

    La sesión se cierra automáticamente al final del request.
    """
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        # commit explícito en el handler; el close es automático.
