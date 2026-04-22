"""
Endpoints de grupos familiares.

Objetivo: que una familia pueda encontrarse durante una emergencia. El
creador recibe un código corto y lo comparte por WhatsApp; la familia
ingresa el código y entra al grupo. Cada miembro publica su ubicación
+ estado (safe / evacuating / help) y todos ven a todos en el grupo.

Endpoints:
  POST   /family-groups              crear grupo (yo = owner + primer miembro)
  POST   /family-groups/join         unirme a un grupo con código
  GET    /family-groups/me           mis grupos
  GET    /family-groups/{code}       detalle de grupo (con miembros)
  PATCH  /family-groups/{code}/members/me   actualizar mi location + status
  DELETE /family-groups/{code}/members/me   salir del grupo

Seguridad: todos requieren auth. Un usuario solo ve grupos a los que
pertenece (el GET con código valida que el requester es miembro).

Código del grupo: 6 chars, alfabeto sin caracteres confundibles
(O/0, I/1, L) para que se lea bien en el celular de la abuela.
"""

from __future__ import annotations

import json
import logging
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import FamilyGroup, GroupMember, MemberStatus, User
from app.schemas import (
    GroupDetail,
    GroupIn,
    GroupJoinIn,
    GroupOut,
    LatLng,
    MemberLocationUpdate,
    MemberOut,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/family-groups", tags=["family-groups"])

# Alfabeto sin O/0/I/1/L — en pantallas chicas y con estrés, la abuela
# no se equivoca copiando el código.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LEN = 6


def _gen_code() -> str:
    """Código aleatorio criptográficamente seguro (no random.random)."""
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LEN))


def _point_wkt(lat: float, lng: float) -> str:
    return f"SRID=4326;POINT({lng} {lat})"


async def _get_group_by_code(db: AsyncSession, code: str) -> FamilyGroup:
    """Normaliza case + valida que exista."""
    result = await db.execute(
        select(FamilyGroup).where(FamilyGroup.code == code.upper())
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grupo no encontrado. Verifica el código.",
        )
    return group


async def _get_my_membership(
    db: AsyncSession, group_id: UUID, user_id: UUID,
) -> GroupMember | None:
    result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def _load_members(
    db: AsyncSession, group_id: UUID,
) -> list[MemberOut]:
    """Carga todos los miembros de un grupo + convierte la geometría
    PostGIS a LatLng para la response."""
    q = (
        select(
            GroupMember,
            ST_AsGeoJSON(GroupMember.last_location).label("geojson"),
        )
        .where(GroupMember.group_id == group_id)
        .order_by(GroupMember.joined_at.asc())
    )
    rows = (await db.execute(q)).all()
    out: list[MemberOut] = []
    for member, geojson in rows:
        loc: LatLng | None = None
        if geojson:
            coords = json.loads(geojson)["coordinates"]
            loc = LatLng(lat=coords[1], lng=coords[0])
        out.append(
            MemberOut(
                id=member.id,
                user_id=member.user_id,
                display_name=member.display_name,
                last_location=loc,
                last_status=member.last_status,
                last_seen_at=member.last_seen_at,
            )
        )
    return out


# ─── Endpoints ──────────────────────────────────────────────────────

@router.post("", response_model=GroupDetail, status_code=201)
async def create_group(
    payload: GroupIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupDetail:
    """Crea un grupo y añade al usuario actual como primer miembro.

    Retorna el grupo con la lista de miembros (un solo miembro: tú),
    para que el cliente pueda pintar el detalle sin un GET extra.
    """
    # Intentar hasta 5 códigos — si aun así choca, es un caso tan raro
    # que conviene devolver error claro y que el usuario reintente.
    last_err: Exception | None = None
    for _ in range(5):
        code = _gen_code()
        group = FamilyGroup(
            code=code,
            name=payload.name,
            municipio_id=payload.municipio_id,
            created_by_user_id=user.id,
        )
        db.add(group)
        try:
            await db.flush()
            break
        except IntegrityError as e:
            await db.rollback()
            last_err = e
            group = None  # type: ignore[assignment]
    else:
        log.error("No se pudo generar código único tras 5 intentos: %s", last_err)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo generar código único. Intenta de nuevo.",
        )

    # Añadir al creador como miembro.
    member = GroupMember(
        group_id=group.id,  # type: ignore[union-attr]
        user_id=user.id,
        display_name=payload.my_name,
    )
    db.add(member)
    await db.commit()
    await db.refresh(group)  # type: ignore[arg-type]

    members = await _load_members(db, group.id)  # type: ignore[union-attr]
    return GroupDetail(
        id=group.id,  # type: ignore[union-attr]
        code=group.code,  # type: ignore[union-attr]
        name=group.name,  # type: ignore[union-attr]
        municipio_id=group.municipio_id,  # type: ignore[union-attr]
        created_at=group.created_at,  # type: ignore[union-attr]
        is_owner=True,
        my_name=payload.my_name,
        members=members,
    )


@router.post("/join", response_model=GroupDetail)
async def join_group(
    payload: GroupJoinIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupDetail:
    """Une al usuario autenticado a un grupo existente por código.

    Idempotente: si ya eres miembro, devuelve el detalle sin crear un
    registro duplicado (pero actualiza tu `display_name` si mandaste
    uno nuevo — útil si te cambiaste de celular y reingresaste).
    """
    group = await _get_group_by_code(db, payload.code)
    existing = await _get_my_membership(db, group.id, user.id)
    if existing is None:
        member = GroupMember(
            group_id=group.id,
            user_id=user.id,
            display_name=payload.my_name,
        )
        db.add(member)
        await db.commit()
    elif existing.display_name != payload.my_name:
        existing.display_name = payload.my_name
        await db.commit()

    members = await _load_members(db, group.id)
    return GroupDetail(
        id=group.id,
        code=group.code,
        name=group.name,
        municipio_id=group.municipio_id,
        created_at=group.created_at,
        is_owner=(group.created_by_user_id == user.id),
        my_name=payload.my_name,
        members=members,
    )


@router.get("/me", response_model=list[GroupOut])
async def my_groups(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GroupOut]:
    """Lista los grupos a los que pertenezco."""
    q = (
        select(FamilyGroup, GroupMember.display_name)
        .join(GroupMember, GroupMember.group_id == FamilyGroup.id)
        .where(GroupMember.user_id == user.id)
        .order_by(FamilyGroup.created_at.desc())
    )
    rows = (await db.execute(q)).all()
    return [
        GroupOut(
            id=g.id,
            code=g.code,
            name=g.name,
            municipio_id=g.municipio_id,
            created_at=g.created_at,
            is_owner=(g.created_by_user_id == user.id),
            my_name=my_name,
        )
        for g, my_name in rows
    ]


@router.get("/{code}", response_model=GroupDetail)
async def group_detail(
    code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupDetail:
    """Detalle del grupo con miembros. Requiere que el user sea miembro."""
    group = await _get_group_by_code(db, code)
    my_membership = await _get_my_membership(db, group.id, user.id)
    if my_membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No perteneces a este grupo.",
        )
    members = await _load_members(db, group.id)
    return GroupDetail(
        id=group.id,
        code=group.code,
        name=group.name,
        municipio_id=group.municipio_id,
        created_at=group.created_at,
        is_owner=(group.created_by_user_id == user.id),
        my_name=my_membership.display_name,
        members=members,
    )


@router.patch("/{code}/members/me", response_model=MemberOut)
async def update_my_membership(
    code: str,
    payload: MemberLocationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MemberOut:
    """Actualiza mi ubicación y/o estado en el grupo.

    Este es el endpoint que se dispara cada vez que el usuario toca
    "Compartir mi ubicación" o cambia su `SafetyStatus`. Los otros
    miembros ven el cambio al hacer GET /{code}.
    """
    group = await _get_group_by_code(db, code)
    my_membership = await _get_my_membership(db, group.id, user.id)
    if my_membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No perteneces a este grupo.",
        )

    if payload.location is not None:
        my_membership.last_location = _point_wkt(  # type: ignore[assignment]
            payload.location.lat, payload.location.lng,
        )
    my_membership.last_status = payload.status
    from sqlalchemy import func
    my_membership.last_seen_at = func.now()  # type: ignore[assignment]
    await db.commit()
    await db.refresh(my_membership)

    # Cargar el geojson de la ubicación actualizada para la response.
    loc: LatLng | None = None
    if my_membership.last_location is not None:
        row = await db.execute(
            select(ST_AsGeoJSON(GroupMember.last_location)).where(
                GroupMember.id == my_membership.id
            )
        )
        geojson = row.scalar()
        if geojson:
            coords = json.loads(geojson)["coordinates"]
            loc = LatLng(lat=coords[1], lng=coords[0])

    return MemberOut(
        id=my_membership.id,
        user_id=my_membership.user_id,
        display_name=my_membership.display_name,
        last_location=loc,
        last_status=my_membership.last_status,
        last_seen_at=my_membership.last_seen_at,
    )


@router.delete(
    "/{code}/members/me",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def leave_group(
    code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Me salgo del grupo. Si era el owner y quedan otros miembros,
    el grupo sobrevive (queda huérfano pero funcional); si era el
    último miembro, borramos el grupo.

    Devuelve 204 sin cuerpo — `Response` explícito es necesario porque
    FastAPI valida al registrar rutas que no haya `response_model` con
    status 204 (no-body). Sin `response_class=Response` el arranque
    falla con `AssertionError: Status code 204 must not have a
    response body`.
    """
    group = await _get_group_by_code(db, code)
    my_membership = await _get_my_membership(db, group.id, user.id)
    if my_membership is None:
        # Idempotente: si ya saliste, 204 igual.
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    await db.delete(my_membership)
    await db.flush()

    # Si no quedan miembros, borrar el grupo (cleanup).
    remaining = (await db.execute(
        select(GroupMember).where(GroupMember.group_id == group.id).limit(1)
    )).scalar_one_or_none()
    if remaining is None:
        await db.delete(group)

    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
