"""Health check — para uptime monitors y smoke tests en CI."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    """Chequea:
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
