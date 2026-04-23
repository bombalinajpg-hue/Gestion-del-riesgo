"""
Entrada de la app FastAPI.

Monta middleware (CORS, logging) + routers. La auto-doc de OpenAPI
queda en `/docs` — gratis por FastAPI.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.rate_limit import limiter
from app.routers import alerts, family_groups, health, me, municipios, reports

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hooks.

    De momento solo loguea; el pool de SQLAlchemy se crea al importar
    `db.py` y Firebase Admin se inicializa lazy en la primera auth.
    """
    log.info("Iniciando EvacuApp API · env=%s", settings.app_env)
    yield
    log.info("API cerrándose")


app = FastAPI(
    title="EvacuApp API",
    description=(
        "Backend de gestión del riesgo y evacuación. Expone municipios, "
        "reportes ciudadanos, alertas clusterizadas, desaparecidos, grupos "
        "familiares e infraestructura (refugios, instituciones, polígonos "
        "de amenaza) para la app móvil EvacuApp y un dashboard admin futuro."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiting — cada decorador `@limiter.limit(...)` en un endpoint
# consume la cuota del cliente identificado por IP. Cuando se excede,
# `_rate_limit_exceeded_handler` devuelve 429 con un mensaje claro.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS. En dev permitimos "*"; en prod la lista viene de settings.
cors_origins = (
    ["*"] if settings.cors_origins.strip() == "*"
    else [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers. Todos quedan bajo `/v1` para que si algún día cambiamos el
# contrato (v2) ambas convivan sin romper apps viejas.
app.include_router(health.router, prefix="/v1")
app.include_router(me.router, prefix="/v1")
app.include_router(municipios.router, prefix="/v1")
app.include_router(reports.router, prefix="/v1")
app.include_router(alerts.router, prefix="/v1")
app.include_router(family_groups.router, prefix="/v1")


@app.get("/", tags=["root"])
async def root():
    return {
        "service": "EvacuApp API",
        "version": app.version,
        "docs": "/docs",
    }
