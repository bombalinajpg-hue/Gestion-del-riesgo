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

    # Firebase
    firebase_credentials_path: str = "./firebase-credentials.json"

    # Runtime
    app_env: Literal["development", "staging", "production"] = "development"
    log_level: Literal["debug", "info", "warning", "error"] = "info"

    # CORS — lista separada por coma, parseada en middleware.
    cors_origins: str = "*"

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"


@lru_cache
def get_settings() -> Settings:
    """Singleton — pydantic-settings ya cachea, pero dejamos el wrapper
    explícito para poder mockearlo en tests con `dependency_overrides`."""
    return Settings()


settings = get_settings()
