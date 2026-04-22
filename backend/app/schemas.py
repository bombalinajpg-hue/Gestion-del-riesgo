"""
Schemas Pydantic — DTOs para requests y responses.

Separamos Schemas (wire format) de Models (DB). Así los cambios de
schema no rompen el contrato público y podemos exponer una vista
distinta de la que tenemos en la DB (ej. GeoJSON en vez de WKB).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    EmergencyType,
    HazardCategory,
    InstitutionType,
    MemberStatus,
    MissingStatus,
    ReportType,
    Severity,
    UserRole,
)


class LatLng(BaseModel):
    """Punto en WGS84. Usamos snake_case (`lat`, `lng`) que es lo que
    ya usa el front; el backend convierte a GEOMETRY POINT internamente."""
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class BBox(BaseModel):
    min_lat: float; min_lng: float; max_lat: float; max_lng: float


# ─── Municipio ────────────────────────────────────────────────────

class MunicipioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    slug: str
    name: str
    bbox: BBox | None = None
    active: bool


# ─── User ─────────────────────────────────────────────────────────

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str | None
    display_name: str | None
    photo_url: str | None
    role: UserRole
    municipio_id: UUID | None


# ─── Citizen Report ───────────────────────────────────────────────

class ReportIn(BaseModel):
    municipio_id: UUID
    type: ReportType
    severity: Severity | None = None
    note: str | None = Field(None, max_length=500)
    photo_url: str | None = None
    location: LatLng


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    municipio_id: UUID
    type: ReportType
    severity: Severity | None
    note: str | None
    photo_url: str | None
    location: LatLng
    created_at: datetime


# ─── Public Alert ─────────────────────────────────────────────────

class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    municipio_id: UUID
    type: ReportType
    centroid: LatLng
    radius_m: int
    aggregated_severity: Severity | None
    support_count: int
    unique_device_count: int
    sample_photo_url: str | None
    first_at: datetime
    last_at: datetime


# ─── Missing Person ───────────────────────────────────────────────

class MissingIn(BaseModel):
    municipio_id: UUID
    name: str = Field(..., max_length=200)
    description: str = Field(..., max_length=2000)
    photo_url: str | None = None
    last_seen: LatLng
    last_seen_at: datetime
    contact_info: str | None = Field(None, max_length=200)


class MissingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    municipio_id: UUID
    name: str
    description: str
    photo_url: str | None
    last_seen: LatLng
    last_seen_at: datetime
    status: MissingStatus
    created_at: datetime


# ─── Family Group ─────────────────────────────────────────────────

class GroupIn(BaseModel):
    name: str = Field(..., max_length=200)
    my_name: str = Field(..., max_length=200)
    municipio_id: UUID | None = None


class GroupJoinIn(BaseModel):
    """Unirse a un grupo existente por código."""
    code: str = Field(..., min_length=4, max_length=8)
    my_name: str = Field(..., max_length=200)


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    code: str
    name: str
    municipio_id: UUID | None
    created_at: datetime
    is_owner: bool = False
    my_name: str | None = None


class MemberLocationUpdate(BaseModel):
    """Actualiza mi estado + (opcionalmente) mi ubicación. Si no hay
    ubicación aún (GPS denegado), el status igual se actualiza."""
    location: LatLng | None = None
    status: MemberStatus = MemberStatus.safe


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    display_name: str | None
    last_location: LatLng | None
    last_status: MemberStatus
    last_seen_at: datetime | None


class GroupDetail(GroupOut):
    """Detalle de grupo con la lista de miembros — lo que el modal del
    frontend pinta al abrir un grupo."""
    members: list[MemberOut]


# ─── Infraestructura ──────────────────────────────────────────────

class ShelterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    location: LatLng
    capacity: int | None
    amenities: dict
    description: str | None


class InstitutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    type: InstitutionType
    location: LatLng
    phone: str | None
    address: str | None


# ─── Hazards ──────────────────────────────────────────────────────

class HazardPolygonOut(BaseModel):
    """GeoJSON Feature completa — así la app la pinta tal cual en react-native-maps."""
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    emergency_type: EmergencyType
    categoria: HazardCategory
    geometry: dict  # GeoJSON MultiPolygon
    properties: dict


# ─── Graph ────────────────────────────────────────────────────────

class GraphArtifactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    url: str
    node_count: int
    edge_count: int
    graph_hash: str
    built_at: datetime
