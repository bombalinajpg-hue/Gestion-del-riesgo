"""
Endpoints de reportes ciudadanos.

Flujo simplificado (el clustering a alertas corre aparte, ver
`services/clustering.py` cuando lo implementemos como cron):

  POST /reports         crea un reporte (requiere auth)
  GET  /reports/near    lista reportes crudos cerca de un punto

Los públicos ven `/alerts/near` (clusters), que es el endpoint
que realmente consume el mapa del Visor. Los reports crudos quedan
para auditoría / dashboard staff.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from geoalchemy2.functions import ST_AsGeoJSON, ST_DWithin, ST_MakePoint, ST_SetSRID
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.types import Geography

from app.auth import get_current_user
from app.db import get_db
from app.models import CitizenReport, User
from app.schemas import LatLng, ReportIn, ReportOut

router = APIRouter(prefix="/reports", tags=["reports"])


def _point_wkt(lat: float, lng: float) -> str:
    """WKT de un punto en WGS84. Para insertar en columnas geometry."""
    return f"SRID=4326;POINT({lng} {lat})"


@router.post("", response_model=ReportOut, status_code=201)
async def create_report(
    payload: ReportIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Crea un reporte atado al user autenticado."""
    report = CitizenReport(
        municipio_id=payload.municipio_id,
        user_id=user.id,
        type=payload.type,
        severity=payload.severity,
        note=payload.note,
        photo_url=payload.photo_url,
        location=_point_wkt(payload.location.lat, payload.location.lng),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    # Convertir geometry de vuelta a LatLng para la response.
    row = await db.execute(
        select(ST_AsGeoJSON(CitizenReport.location)).where(CitizenReport.id == report.id)
    )
    geojson = row.scalar()
    import json
    coords = json.loads(geojson)["coordinates"]
    return ReportOut(
        id=report.id,
        municipio_id=report.municipio_id,
        type=report.type,
        severity=report.severity,
        note=report.note,
        photo_url=report.photo_url,
        location=LatLng(lat=coords[1], lng=coords[0]),
        created_at=report.created_at,
    )


@router.get("/near", response_model=list[ReportOut])
async def reports_near(
    municipio_id: UUID,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(500, ge=10, le=10_000),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve reportes crudos dentro de `radius_m` metros del punto.

    Usa `ST_DWithin(geography, geography, meters)` — la conversión a
    geography hace que el radio esté en metros reales en vez de grados
    (que varían con la latitud).
    """
    query_point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    q = (
        select(CitizenReport, ST_AsGeoJSON(CitizenReport.location).label("geojson"))
        .where(
            CitizenReport.municipio_id == municipio_id,
            ST_DWithin(
                cast(CitizenReport.location, Geography),
                cast(query_point, Geography),
                radius_m,
            ),
        )
        .order_by(CitizenReport.created_at.desc())
        .limit(500)
    )
    rows = (await db.execute(q)).all()
    import json
    out = []
    for report, geojson in rows:
        coords = json.loads(geojson)["coordinates"]
        out.append(
            ReportOut(
                id=report.id,
                municipio_id=report.municipio_id,
                type=report.type,
                severity=report.severity,
                note=report.note,
                photo_url=report.photo_url,
                location=LatLng(lat=coords[1], lng=coords[0]),
                created_at=report.created_at,
            )
        )
    # Descontamos (_ = column func.count no usado, pero query ya hecha arriba)
    return out
