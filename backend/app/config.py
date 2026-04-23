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

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"


@lru_cache
def get_settings() -> Settings:
    """Singleton — pydantic-settings ya cachea, pero dejamos el wrapper
    explícito para poder mockearlo en tests con `dependency_overrides`."""
    return Settings()


settings = get_settings()
