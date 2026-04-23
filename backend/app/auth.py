"""
Verificación de Firebase ID tokens + resolución de user en la DB.

Flujo de auth:
  1. La app RN hace login con Firebase Auth SDK (email/Google).
  2. Obtiene un ID token (JWT firmado por Google).
  3. Lo manda en cada request como `Authorization: Bearer <token>`.
  4. Acá verificamos la firma con firebase-admin, extraemos el `uid` +
     `email` + `name`, y upsert-eamos un registro en nuestra tabla `users`.
  5. Los endpoints reciben el objeto `User` via dependency injection.

Firebase Admin necesita credenciales de service-account. En dev se
descargan a `backend/firebase-credentials.json` (gitignored); en prod
se montan como secret en Fly.io.
"""

from __future__ import annotations

import logging
from pathlib import Path

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as fb_auth, credentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import User, UserRole

log = logging.getLogger(__name__)

_firebase_app: firebase_admin.App | None = None


def _init_firebase() -> firebase_admin.App:
    """Inicializa el SDK de Firebase Admin (idempotente).

    Dos fuentes posibles para el service-account:
      1. `FIREBASE_CREDENTIALS_JSON` (env): JSON inline. Modo de
         producción en hosts como Railway/Fly/Render que no aceptan
         archivos montados.
      2. `FIREBASE_CREDENTIALS_PATH` (env, default `./firebase-credentials.json`):
         ruta a un archivo. Modo de dev local.
    """
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    # 1) JSON inline (prod)
    if settings.firebase_credentials_json:
        import json
        try:
            cred_dict = json.loads(settings.firebase_credentials_json)
            cred = credentials.Certificate(cred_dict)
            _firebase_app = firebase_admin.initialize_app(cred)
            log.info("Firebase Admin inicializado desde FIREBASE_CREDENTIALS_JSON")
            return _firebase_app
        except Exception as e:
            log.error(
                "FIREBASE_CREDENTIALS_JSON inválido: %s — revisa que el JSON "
                "esté bien escapado. Auth deshabilitado.", e,
            )
            return None  # type: ignore[return-value]

    # 2) Archivo en disco (dev local)
    cred_path = Path(settings.firebase_credentials_path)
    if not cred_path.exists():
        # Sin credenciales los endpoints protegidos responden 503.
        # Esto permite desarrollar endpoints públicos (health,
        # municipios, alerts) sin configurar Firebase todavía.
        log.warning(
            "Firebase credentials no encontradas en %s — auth deshabilitado",
            cred_path,
        )
        return None  # type: ignore[return-value]

    cred = credentials.Certificate(str(cred_path))
    _firebase_app = firebase_admin.initialize_app(cred)
    log.info("Firebase Admin inicializado desde archivo %s", cred_path)
    return _firebase_app


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency: exige un Firebase ID token válido y devuelve el User.

    Side-effect: si el uid no existía en `users`, lo crea (upsert) con
    los datos del token (email, display_name). Esto centraliza la
    creación de users — la app nunca llama un "POST /register" explícito.
    """
    if _firebase_app is None:
        _init_firebase()
    if _firebase_app is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth no configurado en el servidor",
        )

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falta header Authorization: Bearer <token>",
        )

    try:
        # `check_revoked=True` valida que el usuario no haya sido
        # deshabilitado desde Firebase console (útil para bloquear
        # cuentas problemáticas sin tocar la DB).
        decoded = fb_auth.verify_id_token(credentials.credentials, check_revoked=True)
    except fb_auth.RevokedIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión revocada",
        )
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado",
        )
    except fb_auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
        )

    firebase_uid: str = decoded["uid"]
    email: str | None = decoded.get("email")
    display_name: str | None = decoded.get("name")
    photo_url: str | None = decoded.get("picture")

    # Role a asignar según la whitelist de admin_emails del config.
    # Si el correo del user está en `settings.admin_emails_set` → admin.
    # Si no → citizen. Un user que era admin y se sacó del whitelist
    # queda automáticamente degradado al siguiente request.
    #
    # Esto sustituye a un endpoint de "dar rol admin" explícito: la
    # fuente de verdad es la env var `ADMIN_EMAILS` de Railway.
    desired_role = (
        UserRole.admin
        if email and email.lower() in settings.admin_emails_set
        else UserRole.citizen
    )

    # Upsert del user. Usamos `ON CONFLICT` implícito via 2-pass para
    # simplicidad; si escala mucho pasamos a `INSERT ... ON CONFLICT`
    # nativo de Postgres.
    result = await db.execute(
        select(User).where(User.firebase_uid == firebase_uid)
    )
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            firebase_uid=firebase_uid,
            email=email,
            display_name=display_name,
            photo_url=photo_url,
            role=desired_role,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Refrescar datos básicos por si el usuario cambió su nombre /
        # foto en Google. El `last_seen_at` se auto-actualiza por el
        # onupdate server-side, pero aseguramos que algún campo cambie.
        changed = False
        if email and user.email != email:
            user.email = email; changed = True
        if display_name and user.display_name != display_name:
            user.display_name = display_name; changed = True
        if photo_url and user.photo_url != photo_url:
            user.photo_url = photo_url; changed = True
        # Sincronizar rol con la whitelist. Conserva `staff` (rol
        # intermedio asignado manualmente en DB); solo promociona a admin
        # o degrada desde admin a citizen según la env var.
        if user.role != UserRole.staff and user.role != desired_role:
            user.role = desired_role; changed = True
        if changed:
            await db.commit()

    return user


async def require_role(
    *allowed: UserRole,
):
    """Dependency factory para endpoints que exigen rol específico.

    Uso:
        @router.get("/admin/stats", dependencies=[Depends(require_role(UserRole.admin))])
    """
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requiere rol {[r.value for r in allowed]}",
            )
        return user
    return checker
