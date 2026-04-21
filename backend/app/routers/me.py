"""Endpoint de auto-consulta del usuario autenticado.

Pensado para que la app RN, tras hacer login en Firebase, llame
`GET /me` y reciba el registro local (nuestro UUID, rol, municipio).
También fuerza el upsert inicial del user en la DB — el primer login
de cualquier usuario pasa por acá.
"""

from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
