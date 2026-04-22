"""
Endpoints de alertas públicas (clusters de reportes).

La app consume estos para pintar los markers rojos en el mapa y el
badge de "N alertas cerca" en Home. El clustering en sí se hará como
cron (TODO: `services/clustering.py`), por ahora los alerts se
crean/actualizan via admin tools o tests.
"""

import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from geoalchemy2.functions import ST_AsGeoJSON, ST_DWithin, ST_MakePoint, ST_SetSRID
from geoalchemy2.types import Geography
from sqlalchemy import cast, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import PublicAlert, User
from app.schemas import AlertOut, LatLng
from app.services.clustering import recluster_municipio

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _row_to_alert_out(row: Row) -> AlertOut:
    alert, geojson = row
    coords = json.loads(geojson)["coordinates"]
    return AlertOut(
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


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    municipio_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Todas las alertas activas de un municipio — sin filtro espacial.

    Lo que el Visor consume para mostrar el heatmap completo del
    municipio en la pantalla. Filtrar por radio no aplica acá: el
    usuario ya eligió "todo Santa Rosa", el mapa centra en el bbox.
    """
    q = (
        select(PublicAlert, ST_AsGeoJSON(PublicAlert.centroid).label("geojson"))
        .where(PublicAlert.municipio_id == municipio_id)
        .order_by(PublicAlert.last_at.desc())
        .limit(500)
    )
    rows = (await db.execute(q)).all()
    return [_row_to_alert_out(r) for r in rows]


@router.get("/near", response_model=list[AlertOut])
async def alerts_near(
    municipio_id: UUID,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(2_000, ge=100, le=50_000),
    db: AsyncSession = Depends(get_db),
):
    """Alertas dentro de un radio del punto dado — útil para la vista
    "alertas cerca de mí" en Home (cuando hay fix de GPS). El Visor usa
    el endpoint sin filtro espacial (arriba)."""
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
    return [_row_to_alert_out(r) for r in rows]


@router.post("/recompute")
async def recompute_alerts(
    municipio_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-calcula `public_alerts` a partir de `citizen_reports` recientes
    del municipio dado. Requiere auth (ciudadano vale) — en el futuro
    puede restringirse a staff si se vuelve costoso.

    La app puede llamar este endpoint tras enviar un reporte para que
    el cluster aparezca en el mapa de inmediato. En producción conviene
    dispararlo también desde un cron + desde el handler de POST /reports
    como BackgroundTask para que el usuario no espere el cómputo.
    """
    count = await recluster_municipio(db, municipio_id)
    return {"count": count, "municipio_id": str(municipio_id)}
