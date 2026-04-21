"""
Endpoints de alertas públicas (clusters de reportes).

La app consume estos para pintar los markers rojos en el mapa y el
badge de "N alertas cerca" en Home. El clustering en sí se hará como
cron (TODO: `services/clustering.py`), por ahora los alerts se
crean/actualizan via admin tools o tests.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from geoalchemy2.functions import ST_AsGeoJSON, ST_DWithin, ST_MakePoint, ST_SetSRID
from geoalchemy2.types import Geography
from sqlalchemy import cast, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import PublicAlert
from app.schemas import AlertOut, LatLng

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/near", response_model=list[AlertOut])
async def alerts_near(
    municipio_id: UUID,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(2_000, ge=100, le=50_000),
    db: AsyncSession = Depends(get_db),
):
    """Alertas públicas (clusters) dentro del radio.

    `2_000 m` por defecto porque el mapa del usuario suele ver más
    amplio que el radio de un reporte individual.
    """
    query_point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    q = (
        select(PublicAlert, ST_AsGeoJSON(PublicAlert.centroid).label("geojson"))
        .where(
            PublicAlert.municipio_id == municipio_id,
            ST_DWithin(
                cast(PublicAlert.centroid, Geography),
                cast(query_point, Geography),
                radius_m,
            ),
        )
        .order_by(PublicAlert.last_at.desc())
        .limit(200)
    )
    rows = (await db.execute(q)).all()
    import json
    out = []
    for alert, geojson in rows:
        coords = json.loads(geojson)["coordinates"]
        out.append(
            AlertOut(
                id=alert.id,
                municipio_id=alert.municipio_id,
                type=alert.type,
                centroid=LatLng(lat=coords[1], lng=coords[0]),
                radius_m=alert.radius_m,
                aggregated_severity=alert.aggregated_severity,
                support_count=alert.support_count,
                unique_device_count=alert.unique_device_count,
                sample_photo_url=alert.sample_photo_url,
                first_at=alert.first_at,
                last_at=alert.last_at,
            )
        )
    return out
