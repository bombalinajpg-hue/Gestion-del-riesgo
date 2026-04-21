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


engine = create_async_engine(
    settings.database_url,
    echo=settings.is_dev,          # en dev logueamos SQL para debug
    pool_pre_ping=True,            # reconecta si la DB se reinició
    pool_size=5,
    max_overflow=10,
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
