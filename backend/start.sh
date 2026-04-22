#!/bin/sh
# Script de arranque para Railway / Fly / Render.
#
# Corre migrations de Alembic antes de levantar el server. Si una
# migration falla, `set -e` detiene el script y el container no arranca
# — eso es lo que queremos: un deploy con DB inconsistente es peor que
# un deploy que no arranca.
#
# `exec uvicorn` reemplaza el shell con el proceso de uvicorn para que
# reciba las señales (SIGTERM) directamente y haga graceful shutdown.

set -e

echo "[start] Corriendo migrations..."
alembic upgrade head

echo "[start] Levantando API en puerto ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
