"""
Re-clustering de reportes ciudadanos → alertas públicas.

La tabla `citizen_reports` almacena cada reporte crudo que manda la
app. El mapa y el cómputo de rutas NO usan esos reports directamente
— operan sobre `public_alerts`, que son clusters con "suficiente
soporte" (≥ N dispositivos únicos).

Esta función porta la lógica que ya vivía en el frontend
(`reportsService.ts → recomputePublicAlerts`) al backend, usando
PostGIS para el clustering en SQL. Ventaja: una sola vez se cluster-iza
para todos los usuarios de ese municipio (antes cada teléfono lo hacía
por su cuenta con su slice parcial de datos).

Estrategia: **delete-all-insert-all** por municipio. Simple, idempotente
y consistente. Para escala alta (cientos de miles de reports) habría
que pasar a actualización incremental; para MVP va bien.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PublicAlert

# Parámetros del clustering — los mismos que el frontend usaba en
# CLUSTER_PARAMS de reportsService.ts. Mantenerlos en sync cuando
# cambien es crítico para que el mapa refleje lo esperado.
CLUSTER_RADIUS_M = 30
CLUSTER_WINDOW_HOURS = 3
CLUSTER_MIN_UNIQUE_DEVICES = 3


async def recluster_municipio(
    db: AsyncSession,
    municipio_id: UUID,
    *,
    radius_m: int = CLUSTER_RADIUS_M,
    window_hours: int = CLUSTER_WINDOW_HOURS,
    min_unique_devices: int = CLUSTER_MIN_UNIQUE_DEVICES,
) -> int:
    """Re-calcula `public_alerts` para un municipio y devuelve cuántos
    clusters se produjeron."""
    # Borramos lo viejo del mismo municipio. Al estar todo en una
    # transacción, si el INSERT de abajo falla, el DELETE se revierte.
    await db.execute(
        delete(PublicAlert).where(PublicAlert.municipio_id == municipio_id)
    )

    # `ST_ClusterDBSCAN` opera en las unidades del SRID. Para 4326 eso
    # es grados; convertimos `radius_m` a grados asumiendo ~111 km por
    # grado. A la latitud de Colombia (~4-5°N) la distorsión lng vs lat
    # es <1 % — despreciable para un radio de 30 m.
    radius_deg = radius_m / 111_000.0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)

    # Un solo SQL hace:
    #   1) Filtra reports del municipio en la ventana temporal.
    #   2) Cluster-iza por (tipo × proximidad espacial).
    #   3) Agrega: centroide, conteo, devices únicos, timestamps.
    #   4) Filtra clusters con soporte suficiente.
    #   5) INSERT en public_alerts con `computed_at = NOW()`.
    sql = text("""
        WITH recent AS (
            SELECT
                id, type, user_id, device_id, location, severity,
                photo_url, created_at
            FROM citizen_reports
            WHERE municipio_id = :municipio_id
              AND created_at >= :cutoff
        ),
        clustered AS (
            SELECT
                *,
                ST_ClusterDBSCAN(
                    location::geometry,
                    eps := :radius_deg,
                    minpoints := 1
                ) OVER (PARTITION BY type) AS cid
            FROM recent
        ),
        aggregated AS (
            SELECT
                type,
                cid,
                COUNT(*) AS support_count,
                COUNT(DISTINCT COALESCE(user_id::text, device_id, 'anon'))
                    AS unique_device_count,
                ST_Centroid(ST_Collect(location)) AS centroid,
                MIN(created_at) AS first_at,
                MAX(created_at) AS last_at,
                MODE() WITHIN GROUP (ORDER BY severity) AS aggregated_severity,
                (array_agg(photo_url) FILTER (WHERE photo_url IS NOT NULL))[1]
                    AS sample_photo_url
            FROM clustered
            WHERE cid IS NOT NULL
            GROUP BY type, cid
            HAVING COUNT(DISTINCT COALESCE(user_id::text, device_id, 'anon'))
                >= :min_devices
        )
        INSERT INTO public_alerts (
            id, municipio_id, type, centroid, radius_m,
            aggregated_severity, support_count, unique_device_count,
            sample_photo_url, first_at, last_at, computed_at
        )
        SELECT
            gen_random_uuid(),
            :municipio_id,
            type,
            centroid,
            :radius_m,
            aggregated_severity,
            support_count,
            unique_device_count,
            sample_photo_url,
            first_at,
            last_at,
            NOW()
        FROM aggregated
        RETURNING id
    """)

    result = await db.execute(
        sql,
        {
            "municipio_id": municipio_id,
            "cutoff": cutoff,
            "radius_deg": radius_deg,
            "radius_m": radius_m,
            "min_devices": min_unique_devices,
        },
    )
    rows = result.fetchall()
    await db.commit()
    return len(rows)
