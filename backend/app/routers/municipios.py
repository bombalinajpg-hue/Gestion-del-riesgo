"""
Endpoints de municipios — el app los consulta al arrancar para poblar
el selector "¿en qué municipio estás?".

Estos endpoints son públicos (sin auth): no hay info sensible y
necesitamos que la app pueda pintar la lista antes del login.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Municipio
from app.schemas import BBox, MunicipioOut

router = APIRouter(prefix="/municipios", tags=["municipios"])


def _bbox_from_geojson(geojson_str: str | None) -> BBox | None:
    """Convierte un polígono GeoJSON al BBox simple que espera la app."""
    if not geojson_str:
        return None
    import json
    gj = json.loads(geojson_str)
    if gj.get("type") != "Polygon":
        return None
    # Polygon coordinates = [[[lng,lat], ...]] — tomamos el ring exterior.
    ring = gj["coordinates"][0]
    lngs = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    return BBox(
        min_lat=min(lats), max_lat=max(lats),
        min_lng=min(lngs), max_lng=max(lngs),
    )


@router.get("", response_model=list[MunicipioOut])
async def list_municipios(db: AsyncSession = Depends(get_db)):
    """Lista de municipios activos (visibles en el selector de la app)."""
    q = (
        select(Municipio, ST_AsGeoJSON(Municipio.bbox).label("bbox_geojson"))
        .where(Municipio.active.is_(True))
        .order_by(Municipio.name)
    )
    rows = (await db.execute(q)).all()
    out = []
    for municipio, bbox_geojson in rows:
        out.append(
            MunicipioOut(
                id=municipio.id,
                slug=municipio.slug,
                name=municipio.name,
                active=municipio.active,
                bbox=_bbox_from_geojson(bbox_geojson),
            )
        )
    return out


@router.get("/{municipio_id}", response_model=MunicipioOut)
async def get_municipio(municipio_id: UUID, db: AsyncSession = Depends(get_db)):
    q = (
        select(Municipio, ST_AsGeoJSON(Municipio.bbox).label("bbox_geojson"))
        .where(Municipio.id == municipio_id)
    )
    row = (await db.execute(q)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")
    municipio, bbox_geojson = row
    return MunicipioOut(
        id=municipio.id,
        slug=municipio.slug,
        name=municipio.name,
        active=municipio.active,
        bbox=_bbox_from_geojson(bbox_geojson),
    )
