"""
Modelos SQLAlchemy + PostGIS para el backend de EvacuApp.

Decisiones de esquema:

1. **Multi-municipio desde el día 1**: todas las tablas con datos
   territoriales tienen `municipio_id` FK → `municipios.id`. Replicar
   a Dosquebradas/Pereira/otro = insertar un municipio + correr el
   script de seed con sus shapefiles.

2. **IDs como UUID v4**: evitamos enumeración (`/reports/1`, `/2`) y
   permiten que los clientes generen IDs offline si algún día hace
   falta (sync optimista).

3. **Geometrías en SRID 4326 (WGS84 lat/lng)**: mismo SRID que usa el
   resto del app y react-native-maps. Todas las queries de distancia
   las hacemos con `ST_DWithin(geography, geography, meters)` —
   castear a geography da distancias en metros nativamente.

4. **Timestamps en UTC con zona**: `TIMESTAMPTZ` evita el clásico
   lío de "¿qué hora es esta?". El cliente formatea en la TZ local.

5. **Soft delete / TTL**: reportes y desaparecidos usan columnas
   `expired_at` / `status` en vez de borrar filas — necesario para
   auditoría + análisis histórico (la empresa de gestión de riesgo
   querrá reportes retrospectivos).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from geoalchemy2 import Geometry
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


# ─── Enums ────────────────────────────────────────────────────────

class EmergencyType(str, Enum):
    inundacion = "inundacion"
    movimiento_en_masa = "movimiento_en_masa"
    avenida_torrencial = "avenida_torrencial"


class ReportType(str, Enum):
    bloqueo_vial = "bloqueo_vial"
    sendero_obstruido = "sendero_obstruido"
    inundacion_local = "inundacion_local"
    deslizamiento_local = "deslizamiento_local"
    riesgo_electrico = "riesgo_electrico"
    refugio_saturado = "refugio_saturado"
    refugio_cerrado = "refugio_cerrado"
    otro = "otro"  # "Otro incidente" — agregado vía migración 0002


class Severity(str, Enum):
    leve = "leve"
    moderada = "moderada"
    grave = "grave"


class HazardCategory(str, Enum):
    Baja = "Baja"
    Media = "Media"
    Alta = "Alta"


class UserRole(str, Enum):
    citizen = "citizen"      # ciudadano normal
    staff = "staff"          # personal de la empresa / organismo
    admin = "admin"          # admin técnico


class MemberStatus(str, Enum):
    safe = "safe"
    evacuating = "evacuating"
    help = "help"
    unknown = "unknown"


class MissingStatus(str, Enum):
    active = "active"
    found = "found"
    closed = "closed"


class InstitutionType(str, Enum):
    SALUD = "SALUD"
    SEGURIDAD = "SEGURIDAD"
    CULTO = "CULTO"
    EDUCACION = "EDUCACION"


# ─── Helpers ──────────────────────────────────────────────────────

def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


def _ts_created() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


def _ts_updated() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ─── Tablas ───────────────────────────────────────────────────────

class Municipio(Base):
    __tablename__ = "municipios"

    id: Mapped[uuid.UUID] = _uuid_pk()
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Bbox opcional — util para centrar el mapa al elegir municipio.
    bbox = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    active: Mapped[bool] = mapped_column(default=True, server_default="true")
    created_at: Mapped[datetime] = _ts_created()

    # Relaciones (lazy para no cargar todo al fetch de municipio).
    reports: Mapped[list[CitizenReport]] = relationship(back_populates="municipio")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    # Unique ID de Firebase — así encontramos al usuario en cada request.
    firebase_uid: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True
    )
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Preservamos el device_id del esquema legacy AsyncStorage por si
    # queremos mergear reportes viejos anónimos a la cuenta.
    legacy_device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"),
        default=UserRole.citizen,
        nullable=False,
    )
    municipio_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=True
    )

    created_at: Mapped[datetime] = _ts_created()
    last_seen_at: Mapped[datetime] = _ts_updated()


class CitizenReport(Base):
    """Reporte crudo enviado por un ciudadano.

    Los reportes individuales se clusterizan (post-proceso o cron) en
    `public_alerts` — el mapa consume alerts, no reports directos.
    """

    __tablename__ = "citizen_reports"

    id: Mapped[uuid.UUID] = _uuid_pk()
    municipio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    # Para reportes anónimos legacy (sin cuenta Firebase). Los nuevos
    # reportes ya tendrán user_id desde auth.
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    type: Mapped[ReportType] = mapped_column(
        SAEnum(ReportType, name="report_type"), nullable=False
    )
    severity: Mapped[Severity | None] = mapped_column(
        SAEnum(Severity, name="severity"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    location = mapped_column(Geometry("POINT", srid=4326), nullable=False)

    created_at: Mapped[datetime] = _ts_created()
    expired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    municipio: Mapped[Municipio] = relationship(back_populates="reports")


class PublicAlert(Base):
    """Cluster de reportes — lo que el mapa mostró en la app.

    Se recomputa periódicamente desde CitizenReport (radio + ventana
    temporal + mínimo de dispositivos únicos, igual lógica que el
    clustering local original en reportsService.ts).
    """

    __tablename__ = "public_alerts"

    id: Mapped[uuid.UUID] = _uuid_pk()
    municipio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=False, index=True
    )

    type: Mapped[ReportType] = mapped_column(
        SAEnum(ReportType, name="report_type"), nullable=False
    )
    centroid = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    aggregated_severity: Mapped[Severity | None] = mapped_column(
        SAEnum(Severity, name="severity"), nullable=True
    )
    support_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unique_device_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sample_photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    first_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    last_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    computed_at: Mapped[datetime] = _ts_updated()


class MissingPerson(Base):
    __tablename__ = "missing_persons"

    id: Mapped[uuid.UUID] = _uuid_pk()
    municipio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=False, index=True
    )
    reporter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_seen = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[MissingStatus] = mapped_column(
        SAEnum(MissingStatus, name="missing_status"),
        default=MissingStatus.active,
        nullable=False,
    )
    contact_info: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = _ts_created()
    updated_at: Mapped[datetime] = _ts_updated()


class FamilyGroup(Base):
    __tablename__ = "family_groups"

    id: Mapped[uuid.UUID] = _uuid_pk()
    # Código corto que el creador comparte por WhatsApp para que la
    # familia se una. Uppercase hex, 6 caracteres.
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    municipio_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = _ts_created()


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_member"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("family_groups.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_location = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    last_status: Mapped[MemberStatus] = mapped_column(
        SAEnum(MemberStatus, name="member_status"),
        default=MemberStatus.unknown,
        nullable=False,
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    joined_at: Mapped[datetime] = _ts_created()


class Shelter(Base):
    """Punto de encuentro — antes `destinos` con tipo=punto_encuentro."""

    __tablename__ = "shelters"

    id: Mapped[uuid.UUID] = _uuid_pk()
    municipio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=False, index=True
    )
    external_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amenities: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _ts_created()


class Institution(Base):
    __tablename__ = "institutions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    municipio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=False, index=True
    )
    external_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[InstitutionType] = mapped_column(
        SAEnum(InstitutionType, name="institution_type"), nullable=False
    )
    location = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)


class HazardPolygon(Base):
    """Polígono de amenaza — lo que el Visor pinta en el mapa.

    Sustituye los JSONs `amenaza_*.json` bundled en el APK. Ventaja:
    admin puede actualizar la cartografía oficial sin rebuild + nueva
    versión de app.
    """

    __tablename__ = "hazard_polygons"

    id: Mapped[uuid.UUID] = _uuid_pk()
    municipio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=False, index=True
    )
    emergency_type: Mapped[EmergencyType] = mapped_column(
        SAEnum(EmergencyType, name="emergency_type"), nullable=False
    )
    categoria: Mapped[HazardCategory] = mapped_column(
        SAEnum(HazardCategory, name="hazard_category"), nullable=False
    )
    # MultiPolygon soporta geometrías complejas (islas, agujeros).
    geom = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=True), nullable=False
    )
    # Metadata opcional para auditoría: de dónde salió el dato.
    source: Mapped[str | None] = mapped_column(String(200), nullable=True)
    valid_from: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    valid_to: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = _ts_created()


class GraphArtifact(Base):
    """Referencia al grafo vial pre-calculado por municipio.

    El JSON en sí se guarda en storage (Firebase Storage / R2 / S3) y
    acá solo registramos la URL firmada + metadata. Así el APK no
    carga el grafo hardcodeado; lo descarga al primer login según
    el municipio elegido.
    """

    __tablename__ = "graph_artifacts"
    __table_args__ = (
        UniqueConstraint("municipio_id", name="uq_graph_municipio"),
        CheckConstraint("node_count >= 0", name="ck_graph_node_count_positive"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    municipio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("municipios.id"), nullable=False
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    node_count: Mapped[int] = mapped_column(Integer, nullable=False)
    edge_count: Mapped[int] = mapped_column(Integer, nullable=False)
    graph_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    built_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = _ts_created()
