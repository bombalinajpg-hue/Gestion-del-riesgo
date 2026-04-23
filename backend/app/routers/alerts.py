"""
Endpoints de alertas públicas (clusters de reportes).

La app consume estos para pintar los markers rojos en el mapa y el
badge de "N alertas cerca" en Home. El clustering en sí se hará como
cron (TODO: `services/clustering.py`), por ahora los alerts se
crean/actualizan via admin tools o tests.
"""

import hmac
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from geoalchemy2.functions import ST_AsGeoJSON, ST_DWithin, ST_MakePoint, ST_SetSRID
from geoalchemy2.types import Geography
from sqlalchemy import cast, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import PublicAlert, User, UserRole
from app.schemas import AlertOut, LatLng
from app.services.clustering import recluster_municipio

# Scheme Bearer opcional — si el caller manda el header `X-Admin-Secret`
# puede pasarse sin Authorization. Si en cambio quiere autenticarse como
# admin humano, manda Bearer token de Firebase.
_bearer_optional = HTTPBearer(auto_error=False)

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
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_optional),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-calcula `public_alerts` a partir de `citizen_reports` recientes.

    Acepta DOS formas de autenticación (cualquiera vale):

    1. **Header `X-Admin-Secret`** con valor coincidente a la env var
       `ADMIN_SECRET` del backend. Pensado para crons externos o scripts
       sin sesión (p.ej. un job programado que reclusteriza cada hora).

    2. **Bearer token Firebase** de un usuario cuyo correo esté en la
       whitelist `ADMIN_EMAILS` del backend. Pensado para administradores
       humanos que operan desde su cuenta (ej. disparar recompute desde
       un dashboard futuro) sin tener que copiar el secret.

    Si ninguna de las dos se cumple → 403. Si `ADMIN_SECRET` y
    `ADMIN_EMAILS` están ambas vacías → 403 a todos (fail-closed).

    La app cliente NO llama este endpoint: el clustering del feed local
    se hace en el dispositivo (`reportsService.recomputePublicAlerts`).
    """
    # Camino 1: admin secret. `hmac.compare_digest` evita timing attacks.
    expected_secret = settings.admin_secret
    secret_ok = bool(
        expected_secret
        and x_admin_secret
        and hmac.compare_digest(x_admin_secret, expected_secret)
    )

    # Camino 2: Bearer de un admin logueado (email en whitelist).
    admin_user_ok = False
    if not secret_ok and credentials is not None:
        try:
            user = await get_current_user(credentials=credentials, db=db)
            admin_user_ok = user.role == UserRole.admin
        except HTTPException:
            # Token inválido o expirado: tratamos como no-auth; si el
            # secret tampoco vino, caerá al 403 de abajo.
            admin_user_ok = False

    if not secret_ok and not admin_user_ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere X-Admin-Secret válido o sesión de administrador.",
        )

    count = await recluster_municipio(db, municipio_id)
    return {"count": count, "municipio_id": str(municipio_id)}
