"""
Configuración del backend — cargada desde variables de entorno.

Usamos pydantic-settings para validación fuerte: si `DATABASE_URL` falta o
está mal formado, la app falla al arrancar en vez de romperse tarde.
Todo se lee una sola vez al importar `settings`.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # DB
    database_url: str

    # Firebase — dos modos de cargar credenciales:
    #   · `firebase_credentials_json`: contenido JSON inline como string.
    #     Úsalo en Railway/Fly/Render donde no puedes montar archivos;
    #     pegas el JSON completo como variable de entorno.
    #   · `firebase_credentials_path`: ruta a un archivo en disco.
    #     Úsalo en dev local (el archivo queda gitignored).
    # Si ambos están puestos, gana el JSON inline (más seguro para prod).
    firebase_credentials_json: str | None = None
    firebase_credentials_path: str = "./firebase-credentials.json"

    # Runtime
    app_env: Literal["development", "staging", "production"] = "development"
    log_level: Literal["debug", "info", "warning", "error"] = "info"

    # CORS — lista separada por coma, parseada en middleware.
    cors_origins: str = "*"

    # Secret para proteger endpoints de admin / ops (ej. /alerts/recompute).
    # No es un sistema de roles — es un "pre-shared key" simple: el cliente
    # envía header `X-Admin-Secret: <valor>` y el backend lo compara. Si no
    # está configurado (None), los endpoints protegidos responden 403 a
    # todos, lo que es el default más seguro. Para habilitar, poner la
    # variable `ADMIN_SECRET` en Railway con un string largo aleatorio.
    admin_secret: str | None = None

    # Whitelist de correos con permisos de administrador. Formato: cadena
    # con correos separados por coma — ej:
    #   "cata@ctglobal.com,director@ctglobal.com"
    # Ideal para equipos pequeños (1–10 admins). Para agregar/quitar
    # admins, se edita la env var en Railway y el servicio redeploya.
    # Si la cadena está vacía, nadie es admin por esta vía (solo el
    # `ADMIN_SECRET` sigue sirviendo para disparar `/recompute` desde cron).
    admin_emails: str = ""

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"

    @property
    def admin_emails_set(self) -> set[str]:
        """Set normalizado (lowercase + sin espacios) para comparación
        case-insensitive. Se construye una vez y se cachea implícitamente
        gracias al lru_cache de `get_settings()`."""
        if not self.admin_emails:
            return set()
        return {
            e.strip().lower()
            for e in self.admin_emails.split(",")
            if e.strip()
        }


@lru_cache
def get_settings() -> Settings:
    """Singleton — pydantic-settings ya cachea, pero dejamos el wrapper
    explícito para poder mockearlo en tests con `dependency_overrides`."""
    return Settings()


settings = get_settings()
