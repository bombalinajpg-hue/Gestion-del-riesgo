# Imagen base slim para que el contenedor de producción sea chico.
# Python 3.12 viene con asyncio mejorado; GeoAlchemy2 + asyncpg lo usan.
FROM python:3.12-slim

# Dependencias del sistema:
#   · build-essential y libpq-dev: compilación de asyncpg y otras extensiones C
#   · libgeos-dev, libproj-dev, gdal-bin: requeridas por GeoPandas/Shapely
#     (scripts de ingesta de shapefiles usan estas).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgeos-dev \
    libproj-dev \
    gdal-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build context: la RAÍZ del repo (no la carpeta backend/). Esto nos
# permite copiar tanto el código del backend como los archivos `data/`
# del frontend — que el script `seed_municipio.py` necesita para
# poblar la DB con refugios, instituciones y polígonos de amenaza.
#
# En Railway: Settings → Root Directory = "." (o vacío) + Dockerfile
# Path = "backend/Dockerfile".

# Copiamos requirements primero para cachear el layer de pip.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código del backend. Incluye app/, alembic/, scripts/ y start.sh.
COPY backend/ .

# Datos geográficos del frontend (Santa Rosa de Cabal). Quedan en
# `/seed/` para que el script de ingesta los lea con paths absolutos:
#   python -m scripts.seed_municipio \
#     --shelters /seed/destinos.json \
#     --institutions /seed/instituciones.json \
#     --hazard inundacion:/seed/amenaza_inundacion.json ...
COPY data/ /seed/

EXPOSE 8000
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
