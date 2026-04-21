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

# Copiamos requirements primero para cache de layer en Docker.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código del backend. En dev este COPY se sobrescribe con el volumen
# de docker-compose; en prod es lo que queda empaquetado.
COPY . .

EXPOSE 8000

# Default: uvicorn en modo producción (sin --reload). En dev el
# docker-compose override lo cambia a --reload.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
