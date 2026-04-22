"""Health check — para uptime monitors y smoke tests en CI.

Dos endpoints con propósitos distintos:
  · `/health/live`: liveness probe — solo confirma que el proceso
    responde. Railway/K8s lo usan para decidir si matar el container.
    Si este falla durante el arranque el deploy se cae; por eso NO
    toca DB (una DB lenta no debería matar la API).
  · `/health`: deep check — valida DB + PostGIS. Úsalo desde uptime
    monitors externos o CI, no como startup probe del host.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live() -> dict:
    """Liveness probe — responde sin tocar DB. Úsalo como healthcheck
    del host (Railway, Fly, Render) para no caer el deploy si la DB
    aún no está lista mientras migraciones corren."""
    return {"status": "ok"}


@router.get("")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    """Deep check — chequea:
    · API responde.
    · DB alcanzable (una query trivial).
    · PostGIS instalado (query a postgis_version()).
    """
    await db.execute(text("SELECT 1"))
    postgis_version = (await db.execute(text("SELECT postgis_version()"))).scalar()
    return {
        "status": "ok",
        "postgis": postgis_version,
    }
