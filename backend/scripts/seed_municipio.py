"""
Ingesta de un municipio completo a la base.

Este es el script que corre una vez por municipio nuevo (Santa Rosa
de Cabal, Dosquebradas, Pereira…). Toma shapefiles o GeoJSON del
equipo cartográfico y los vuelca a las tablas con PostGIS.

Uso (ejemplos):

    # Crear o actualizar un municipio
    python -m scripts.seed_municipio \\
        --slug santa-rosa \\
        --name "Santa Rosa de Cabal" \\
        --hazard inundacion:data/santa-rosa/amenaza_inundacion.geojson \\
        --hazard movimiento_en_masa:data/santa-rosa/amenaza_mm.geojson \\
        --hazard avenida_torrencial:data/santa-rosa/amenaza_av.geojson \\
        --shelters data/santa-rosa/refugios.geojson \\
        --institutions data/santa-rosa/instituciones.geojson

Formatos soportados (cualquiera que lea GeoPandas):
    .shp, .geojson, .gpkg, .kml

Convenciones de columnas en los archivos de entrada:

    Hazards:     columna `Categoria` ∈ {Baja, Media, Alta}. Geometría
                 MultiPolygon o Polygon (se convierte a Multi).

    Shelters:    columnas `nombre` (o `name`), opcional `capacity`.
                 Geometría Point.

    Institutions: columnas `nombre` y `tipo` ∈ {SALUD, SEGURIDAD,
                  CULTO, EDUCACION}. Opcional `telefono`, `direccion`.
                  Geometría Point.

El script es idempotente: si el municipio ya existe (match por slug),
actualiza sus datos en vez de duplicar.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.geometry.base import BaseGeometry
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

# Permite correr el script con `python -m scripts.seed_municipio`
# desde /app sin tener que instalar el paquete.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    EmergencyType,
    HazardCategory,
    HazardPolygon,
    Institution,
    InstitutionType,
    Municipio,
    Shelter,
)


WGS84 = "EPSG:4326"


@dataclass
class HazardSpec:
    emergency_type: EmergencyType
    path: Path


def parse_hazard(spec: str) -> HazardSpec:
    """Parsea `inundacion:data/x.geojson` → HazardSpec."""
    if ":" not in spec:
        raise argparse.ArgumentTypeError(
            f"Hazard spec inválido: {spec!r} (esperado TYPE:PATH)"
        )
    type_str, path_str = spec.split(":", 1)
    try:
        emergency_type = EmergencyType(type_str)
    except ValueError as e:
        valid = [t.value for t in EmergencyType]
        raise argparse.ArgumentTypeError(
            f"Tipo de emergencia inválido: {type_str!r}. Válidos: {valid}"
        ) from e
    return HazardSpec(emergency_type=emergency_type, path=Path(path_str))


def geometry_to_ewkt(geom: BaseGeometry, srid: int = 4326) -> str:
    """Shapely geom → EWKT que PostGIS entiende directo en INSERT."""
    return f"SRID={srid};{geom.wkt}"


def _load_plain_json_array(path: Path) -> gpd.GeoDataFrame | None:
    """Si el archivo es un array JSON plano con `lat`/`lng` (legacy),
    lo convertimos a GeoDataFrame con geometría Point. Devuelve None
    si el contenido no coincide (deja que GeoPandas intente)."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(raw, list) or not raw:
        return None
    first = raw[0]
    if not isinstance(first, dict) or "lat" not in first or "lng" not in first:
        return None
    geometries = [Point(r["lng"], r["lat"]) for r in raw]
    attrs = [{k: v for k, v in r.items() if k not in ("lat", "lng")} for r in raw]
    return gpd.GeoDataFrame(attrs, geometry=geometries, crs=WGS84)


def load_to_wgs84(path: Path) -> gpd.GeoDataFrame:
    """Carga un archivo geográfico y lo reproyecta a WGS84 si hace falta.

    Soporta:
      · Cualquier formato que GeoPandas lea (shapefile, geojson, gpkg, kml).
      · Array JSON plano con campos `lat`/`lng` (formato legacy del app;
        así no tenemos que pre-convertir destinos.json / instituciones.json).
    """
    if not path.exists():
        raise FileNotFoundError(path)
    plain = _load_plain_json_array(path)
    if plain is not None:
        return plain
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        print(f"⚠️  {path}: sin CRS declarado, asumo WGS84")
    elif str(gdf.crs) != WGS84:
        print(f"↪ Reproyectando {path} de {gdf.crs} a {WGS84}")
        gdf = gdf.to_crs(WGS84)
    return gdf


def ensure_multipolygon(geom: BaseGeometry) -> MultiPolygon:
    """Normaliza a MultiPolygon (la columna `geom` solo acepta eso)."""
    if isinstance(geom, MultiPolygon):
        return geom
    if isinstance(geom, Polygon):
        return MultiPolygon([geom])
    raise ValueError(f"Geometría incompatible con hazard: {geom.geom_type}")


async def upsert_municipio(
    db: AsyncSession,
    slug: str,
    name: str,
    bbox_gdf: gpd.GeoDataFrame | None,
) -> Municipio:
    existing = (
        await db.execute(select(Municipio).where(Municipio.slug == slug))
    ).scalar_one_or_none()
    bbox_wkt = None
    if bbox_gdf is not None and not bbox_gdf.empty:
        unioned = bbox_gdf.union_all()
        # Tomamos el bounding box rectangular como Polygon.
        minx, miny, maxx, maxy = unioned.bounds
        poly = Polygon.from_bounds(minx, miny, maxx, maxy)
        bbox_wkt = geometry_to_ewkt(poly)
    if existing:
        existing.name = name
        if bbox_wkt:
            existing.bbox = bbox_wkt
        print(f"✓ Municipio existente actualizado: {slug}")
        await db.commit()
        return existing
    muni = Municipio(slug=slug, name=name, bbox=bbox_wkt, active=True)
    db.add(muni)
    await db.commit()
    await db.refresh(muni)
    print(f"✓ Municipio creado: {slug} ({muni.id})")
    return muni


async def ingest_hazards(
    db: AsyncSession, municipio: Municipio, specs: list[HazardSpec]
) -> int:
    """Borra los hazards previos del municipio+tipo y reinserta.

    Borrar+reinsertar es intencional: la cartografía oficial puede
    rehacerse (POMCA actualizado) y queremos que la ingesta refleje
    el estado actual, no el acumulado histórico. Si en el futuro hace
    falta versionado, usamos valid_from/valid_to.
    """
    total = 0
    for spec in specs:
        gdf = load_to_wgs84(spec.path)
        if "Categoria" not in gdf.columns:
            raise ValueError(
                f"{spec.path}: falta columna 'Categoria' (Baja/Media/Alta)"
            )
        # Delete previos del mismo municipio+tipo.
        await db.execute(
            delete(HazardPolygon).where(
                HazardPolygon.municipio_id == municipio.id,
                HazardPolygon.emergency_type == spec.emergency_type,
            )
        )
        count = 0
        for _, row in gdf.iterrows():
            raw_cat = str(row["Categoria"]).strip()
            try:
                cat = HazardCategory(raw_cat)
            except ValueError:
                print(f"⚠️  Categoría desconocida {raw_cat!r}, saltando feature")
                continue
            multipoly = ensure_multipolygon(row.geometry)
            db.add(HazardPolygon(
                municipio_id=municipio.id,
                emergency_type=spec.emergency_type,
                categoria=cat,
                geom=geometry_to_ewkt(multipoly),
                source=spec.path.name,
            ))
            count += 1
        print(f"✓ Hazards {spec.emergency_type.value}: {count} features")
        total += count
    await db.commit()
    return total


async def ingest_shelters(
    db: AsyncSession, municipio: Municipio, path: Path
) -> int:
    gdf = load_to_wgs84(path)
    await db.execute(
        delete(Shelter).where(Shelter.municipio_id == municipio.id)
    )
    count = 0
    for _, row in gdf.iterrows():
        name = row.get("nombre") or row.get("name")
        if not name:
            continue
        capacity = row.get("capacity") or row.get("capacidad")
        db.add(Shelter(
            municipio_id=municipio.id,
            name=str(name),
            location=geometry_to_ewkt(row.geometry),
            capacity=int(capacity) if capacity and not gpd.pd.isna(capacity) else None,
            amenities={},
        ))
        count += 1
    await db.commit()
    print(f"✓ Shelters: {count}")
    return count


async def ingest_institutions(
    db: AsyncSession, municipio: Municipio, path: Path
) -> int:
    gdf = load_to_wgs84(path)
    await db.execute(
        delete(Institution).where(Institution.municipio_id == municipio.id)
    )
    count = 0
    for _, row in gdf.iterrows():
        name = row.get("nombre") or row.get("name")
        tipo_raw = row.get("tipo") or row.get("type")
        if not name or not tipo_raw:
            continue
        try:
            tipo = InstitutionType(str(tipo_raw).strip().upper())
        except ValueError:
            print(f"⚠️  Tipo inválido {tipo_raw!r} para {name}, saltando")
            continue
        db.add(Institution(
            municipio_id=municipio.id,
            name=str(name),
            type=tipo,
            location=geometry_to_ewkt(row.geometry),
            phone=str(row.get("telefono") or row.get("phone") or "") or None,
            address=str(row.get("direccion") or row.get("address") or "") or None,
        ))
        count += 1
    await db.commit()
    print(f"✓ Institutions: {count}")
    return count


async def main(args: argparse.Namespace) -> None:
    specs: list[HazardSpec] = args.hazard or []

    # Cargar todos los hazards primero solo para calcular el bbox
    # combinado antes de ingerir.
    bbox_gdf = None
    if specs:
        frames = [load_to_wgs84(s.path) for s in specs]
        bbox_gdf = gpd.GeoDataFrame(
            gpd.pd.concat(frames, ignore_index=True), crs=WGS84
        )

    async with SessionLocal() as db:
        muni = await upsert_municipio(db, args.slug, args.name, bbox_gdf)
        if specs:
            await ingest_hazards(db, muni, specs)
        if args.shelters:
            await ingest_shelters(db, muni, args.shelters)
        if args.institutions:
            await ingest_institutions(db, muni, args.institutions)

    print("\n✅ Ingesta completada.")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Ingesta de datos de un municipio.")
    p.add_argument("--slug", required=True, help="p.ej. santa-rosa")
    p.add_argument("--name", required=True, help="p.ej. 'Santa Rosa de Cabal'")
    p.add_argument(
        "--hazard", action="append", type=parse_hazard,
        help="TYPE:PATH — uno por cada tipo de amenaza",
    )
    p.add_argument("--shelters", type=Path, help="Archivo de puntos de encuentro")
    p.add_argument("--institutions", type=Path, help="Archivo de instituciones")
    return p


if __name__ == "__main__":
    args = build_parser().parse_args()
    asyncio.run(main(args))
