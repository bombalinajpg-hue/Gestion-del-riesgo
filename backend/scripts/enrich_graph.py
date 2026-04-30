# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "shapely>=2.0",
#     "pyproj>=3.6",
# ]
# ///
"""
Enriquecimiento espacial del grafo vial — versión Python.

Reemplaza a `scripts/enrich-graph-catastro.js` y absorbe el bloque de
hazard-tagging que vivía en `scripts/build-graph.js`. Todas las
operaciones espaciales se hacen en **EPSG:9377 (CTM12, MAGNA-SIRGAS
proyectado, oficial Colombia, unidades en metros)** usando shapely +
STRtree, no aproximaciones planas en grados ni distancias al mid-point.

═══════════════════════════════════════════════════════════════════════
 Pipeline del grafo
═══════════════════════════════════════════════════════════════════════

  1) `node scripts/build-graph.js`     descarga OSM, arma topología,
                                       calcula costSeconds nominales.
                                       NO toca amenazas ni catastro.
  2) `python backend/scripts/enrich_graph.py`  (este archivo)
                                       enriquece el grafo con:
                                         · 3A pendiente + Tobler
                                         · 4A vulnerabilidad obras lineales
                                         · 4B predios en riesgo cercanos
                                         · hazard categorías por tipo
                                       todo por intersección/buffer real
                                       en CTM12.
  3) (futuro) subir a PostGIS para hacer ruteo server-side con pgrouting.

═══════════════════════════════════════════════════════════════════════
 Por qué EPSG:9377 (CTM12) y no Haversine ni grados
═══════════════════════════════════════════════════════════════════════

  · `enrich-graph-catastro.js` calculaba distancias con Haversine al
    mid-point — error sistemático ~0.3% (esfera) y, peor, ignoraba la
    forma real de la arista. Una arista de 200 m con un predio cercano
    al extremo (no al mid-point) quedaba fuera del conteo.
  · `build-graph.js` etiquetaba hazards con point-in-polygon en el
    mid-point. Una vía que cruza el límite Alta/Baja perdía la severa.
  · CTM12 es el sistema **proyectado oficial nacional** (Resolución
    IGAC 471/2020). Sus unidades son metros sin distorsión apreciable
    en todo el país. `line.buffer(25)` da exactamente 25 m de buffer.
  · STRtree (shapely 2.x) da O(log n) en los joins — para Santa Rosa
    (~7k aristas × ~5 capas con hasta 250 polígonos cada una) corre
    en pocos segundos.

Referencias normativas y científicas:
  · Resolución IGAC 471/2020 — adopta MAGNA-SIRGAS / CTM12.
  · Decreto 1807/2014 — estudios detallados de riesgo.
  · Tobler, W. (1993). Three presentations on geographical analysis
    and modeling. NCGIA Technical Report 93-1.
  · ALDESARROLLO (2025) — EDAVR río San Eugenio, Santa Rosa de Cabal.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Windows: la consola por defecto es cp1252 y rompe al imprimir unicode
# (flechas, check-marks, etc. del reporte final). Reconfiguramos stdout
# y stderr a UTF-8 con `errors='replace'` para que un terminal raro no
# nos tumbe el run completo.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from pyproj import Transformer
from shapely.geometry import LineString, shape
from shapely.ops import transform as shapely_transform
from shapely.strtree import STRtree


# ─── Paths ──────────────────────────────────────────────────────────
# El script vive en backend/scripts/, los datos en data/ a nivel raíz.
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CATASTRO = DATA / "catastro"
GRAPH_PATH = DATA / "graph.json"

# ─── Constantes de enriquecimiento ─────────────────────────────────
# Mantenidas en sync con catastroCostFactors.ts. Si cambian acá, los
# tests de validación (validate-routes-catastro.js) deben re-correrse.
OBRA_LINEAL_BUFFER_M = 15
PREDIO_RISK_BUFFER_M = 25
DEFAULT_SLOPE_DEGREES = 4.25  # midpoint del rango "0º-8.5º" — usado
                              # cuando la arista cae fuera del área
                              # de estudio detallado (EDAVR cubre el
                              # casco urbano; OSM se extiende más).

# Mapeo rango cualitativo → grados cuantitativos. Cada valor es el
# midpoint del rango. Idéntico al JS que reemplaza.
RANGO_A_GRADOS: dict[str, float] = {
    "0º-8.5º": 4.25,
    "8.5º-16.5º": 12.5,
    "16.5º-26.6º": 21.55,
    "26.6º-45º": 35.8,
    ">45º": 50.0,
}

# Severidad numérica para comparar cuando una arista cruza polígonos
# de distinta categoría — nos quedamos con la más severa.
CATEGORIA_RANK: dict[str, int] = {"Baja": 1, "Media": 2, "Alta": 3}


# ─── Reproyección (4326 ↔ 9377) ────────────────────────────────────
# CRS84 (lo que traen los GeoJSON) y EPSG:4326 son equivalentes en
# orden lng,lat — pyproj con `always_xy=True` los trata bien.
_TO_9377 = Transformer.from_crs("EPSG:4326", "EPSG:9377", always_xy=True).transform


def project_to_ctm12(geom):
    """Reproyecta una geometría 4326 → 9377 (metros). Devuelve None si
    la geometría es vacía o inválida."""
    if geom is None or geom.is_empty:
        return None
    try:
        return shapely_transform(_TO_9377, geom)
    except Exception:
        return None


# ─── Carga de capas ────────────────────────────────────────────────

def load_features(path: Path) -> list[tuple]:
    """Lee un GeoJSON y devuelve [(geom_9377, props), ...]. Las
    geometrías se reproyectan a CTM12 al cargar para hacer **una sola**
    transformación por feature, no una por edge.

    Si el archivo no existe, devuelve lista vacía con warning — útil
    para que el script no se caiga si una capa opcional falta en el
    repo (p.ej. `riesgo_movimientos_masa.geojson` aún no entregado).
    """
    if not path.exists():
        print(f"  ⚠  {path.name} no existe — capa omitida", file=sys.stderr)
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    out: list[tuple] = []
    skipped = 0
    for feat in raw.get("features", []):
        gj = feat.get("geometry")
        if gj is None:
            skipped += 1
            continue
        try:
            geom_4326 = shape(gj)
        except Exception:
            skipped += 1
            continue
        geom_9377 = project_to_ctm12(geom_4326)
        if geom_9377 is None:
            skipped += 1
            continue
        out.append((geom_9377, feat.get("properties", {})))
    msg = f"  ✓ {path.name}: {len(out)} features"
    if skipped:
        msg += f" ({skipped} omitidas por geometría inválida)"
    print(msg)
    return out


def build_tree(features: list[tuple]) -> STRtree | None:
    """STRtree para joins espaciales O(log n). Devuelve None si la lista
    está vacía (capa ausente) — el caller debe chequear."""
    if not features:
        return None
    return STRtree([g for g, _ in features])


# ─── Helpers de enriquecimiento ────────────────────────────────────

def hazard_category_for_edge(
    line_9377, tree: STRtree | None, features: list[tuple]
) -> str | None:
    """**P0.3 — line-polygon intersection.** Devuelve la categoría más
    severa entre los polígonos de amenaza que la arista cruza. None si
    no hay intersección.

    Acepta `Categoria` o `categoria` — el JS legacy probaba ambos y
    algunos shapefiles antiguos aún vienen en minúscula.
    """
    if tree is None:
        return None
    best_cat: str | None = None
    best_rank = 0
    for idx in tree.query(line_9377, predicate="intersects"):
        _, props = features[idx]
        cat = props.get("Categoria") or props.get("categoria")
        if not cat:
            continue
        rank = CATEGORIA_RANK.get(cat, 0)
        if rank > best_rank:
            best_rank = rank
            best_cat = cat
    return best_cat


def slope_degrees_for_edge(
    line_9377, tree: STRtree | None, features: list[tuple]
) -> tuple[float | None, str | None]:
    """**3A — slope por longitud de intersección, no por mid-point.**
    Si la arista cruza varios polígonos de pendiente, gana el que
    contenga el tramo más largo de la arista. Devuelve (grados, rango).
    """
    if tree is None:
        return None, None
    best_len = 0.0
    best_grados: float | None = None
    best_rango: str | None = None
    for idx in tree.query(line_9377, predicate="intersects"):
        geom, props = features[idx]
        try:
            inter = geom.intersection(line_9377)
        except Exception:
            continue
        # `.length` funciona para LineString/MultiLineString/GeometryCollection.
        # Si intersection es un punto o vacío, length=0 → no compite.
        L = getattr(inter, "length", 0.0) or 0.0
        if L > best_len:
            rango = props.get("INCLINA")
            grados = RANGO_A_GRADOS.get(rango) if rango else None
            if grados is not None:
                best_len = L
                best_grados = grados
                best_rango = rango
    return best_grados, best_rango


def tobler_kmh(grados_ascendentes: float) -> float:
    """Función de marcha de Tobler (1993):
        W = 6 · exp(-3.5 · |S + 0.05|)  km/h
    donde S = tan(pendiente). Conserva la versión del JS para
    consistencia con el documento de pasantía.
    """
    S = math.tan(math.radians(grados_ascendentes))
    return 6.0 * math.exp(-3.5 * abs(S + 0.05))


def obra_lineal_for_edge(
    line_9377,
    line_buf_obra,
    tree: STRtree | None,
    features: list[tuple],
) -> str | None:
    """**4A — obra lineal más cercana dentro de 15 m del trazado completo
    de la arista**, no del mid-point. El buffer pre-calculado evita
    re-buffering por feature.
    """
    if tree is None:
        return None
    best_dist = float("inf")
    best_vul: str | None = None
    for idx in tree.query(line_buf_obra, predicate="intersects"):
        geom, props = features[idx]
        try:
            d = line_9377.distance(geom)
        except Exception:
            continue
        if d < best_dist:
            best_dist = d
            raw = (props.get("Clas_vulne") or "").strip()
            best_vul = raw or None
    return best_vul


def predios_riesgo_for_edge(
    line_buf_predio,
    tree: STRtree | None,
    features: list[tuple],
) -> dict[str, int]:
    """**4B — predios en riesgo dentro de un buffer geométrico real de
    25 m del trazado de la arista.** Cuenta features cuya geometría
    intersecta el buffer, no por distancia haversine al mid-point.

    Esto es estrictamente más correcto: un predio cuya fachada queda
    a 5 m de la vía pero cuyo centroide está a 30 m antes no se
    contaba; ahora sí.
    """
    out: dict[str, int] = {}
    if tree is None:
        return out
    for idx in tree.query(line_buf_predio, predicate="intersects"):
        _, props = features[idx]
        nivel = (props.get("CATEGORIA") or props.get("C_riesgo") or "").strip()
        if not nivel:
            continue
        out[nivel] = out.get(nivel, 0) + 1
    return out


# ─── Main ──────────────────────────────────────────────────────────

def main() -> int:
    if not GRAPH_PATH.exists():
        print(
            f"ERROR: no existe {GRAPH_PATH}. Corre primero "
            "`node scripts/build-graph.js`.",
            file=sys.stderr,
        )
        return 1

    print("[enrich_graph] Leyendo grafo base...")
    graph: dict[str, Any] = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    # El backup "flat" lo crea/refresca `build-graph.js` al terminar,
    # no este script — así siempre refleja el último OSM bajado.
    nodes = graph["nodes"]
    edges = graph["edges"]
    id_to_idx: dict[int, int] = {n["id"]: i for i, n in enumerate(nodes)}

    print("\n[enrich_graph] Cargando capas (4326 → reproyectando a 9377)...")
    pendiente = load_features(CATASTRO / "pendiente_grados.geojson")
    obras = load_features(CATASTRO / "vulnerabilidad_obras_lineales.geojson")
    riesgo_inund = load_features(CATASTRO / "riesgo_inundacion.geojson")
    riesgo_at = load_features(CATASTRO / "riesgo_avenidas_torrenciales.geojson")
    riesgo_mm = load_features(CATASTRO / "riesgo_movimientos_masa.geojson")
    amenaza_inund = load_features(DATA / "amenaza_inundacion.json")
    amenaza_mm = load_features(DATA / "amenaza_movimiento_en_masa.json")
    amenaza_at = load_features(DATA / "amenaza_avenida_torrencial.json")

    print("\n[enrich_graph] Construyendo índices STRtree...")
    pendiente_tree = build_tree(pendiente)
    obras_tree = build_tree(obras)
    riesgo_inund_tree = build_tree(riesgo_inund)
    riesgo_at_tree = build_tree(riesgo_at)
    riesgo_mm_tree = build_tree(riesgo_mm)
    amenaza_inund_tree = build_tree(amenaza_inund)
    amenaza_mm_tree = build_tree(amenaza_mm)
    amenaza_at_tree = build_tree(amenaza_at)

    # Estadísticas para el reporte final.
    stats: dict[str, Any] = {
        "edges": len(edges),
        "with_slope_assigned": 0,
        "slope_distribution": {},
        "with_obra_lineal": 0,
        "obra_by_vul": {"Alta": 0, "Media": 0, "Baja": 0},
        "tobler_orig_seconds": 0.0,
        "tobler_new_seconds": 0.0,
        "with_hazard": {
            "inundacion": 0,
            "movimiento_en_masa": 0,
            "avenida_torrencial": 0,
        },
        "with_predios_riesgo": {
            "inundacion": 0,
            "avenida_torrencial": 0,
            "movimiento_en_masa": 0,
        },
    }

    print(f"\n[enrich_graph] Procesando {len(edges)} aristas...")
    for edge in edges:
        a_idx = id_to_idx.get(edge["from"])
        b_idx = id_to_idx.get(edge["to"])
        if a_idx is None or b_idx is None:
            continue
        a, b = nodes[a_idx], nodes[b_idx]
        line_4326 = LineString([(a["lng"], a["lat"]), (b["lng"], b["lat"])])
        line_9377 = project_to_ctm12(line_4326)
        if line_9377 is None or line_9377.is_empty:
            continue
        line_buf_obra = line_9377.buffer(OBRA_LINEAL_BUFFER_M)
        line_buf_predio = line_9377.buffer(PREDIO_RISK_BUFFER_M)

        # ─── HAZARDS (P0.3) ───
        hazard: dict[str, str] = {}
        for ttype, tree, feats in (
            ("inundacion", amenaza_inund_tree, amenaza_inund),
            ("movimiento_en_masa", amenaza_mm_tree, amenaza_mm),
            ("avenida_torrencial", amenaza_at_tree, amenaza_at),
        ):
            cat = hazard_category_for_edge(line_9377, tree, feats)
            if cat:
                hazard[ttype] = cat
                stats["with_hazard"][ttype] += 1
        if hazard:
            edge["hazardByType"] = hazard
        else:
            # Si la arista no toca ninguna zona, asegura que el campo
            # no quede de un run anterior (idempotencia).
            edge.pop("hazardByType", None)

        # ─── 3A SLOPE + TOBLER ───
        grados, rango = slope_degrees_for_edge(line_9377, pendiente_tree, pendiente)
        if grados is not None and rango is not None:
            stats["with_slope_assigned"] += 1
            stats["slope_distribution"][rango] = (
                stats["slope_distribution"].get(rango, 0) + 1
            )
        if grados is None:
            grados = DEFAULT_SLOPE_DEGREES
        edge["slopeDegrees"] = round(grados, 2)

        v_kmh = tobler_kmh(grados)
        v_ms = v_kmh * 1000.0 / 3600.0
        # Idempotencia: si ya hubo un run de enriquecimiento, el tiempo
        # plano original (sin Tobler) está en `costSecondsFlat`. Lo
        # usamos como baseline para que correr el script N veces
        # produzca el mismo resultado que correrlo una sola vez. Si es
        # la primera vez, `costSecondsFlat['foot-walking']` no existe
        # y partimos del costSeconds vigente (que asumimos plano).
        flat = edge.get("costSecondsFlat") or {}
        t_flat = float(flat.get("foot-walking", edge["costSeconds"]["foot-walking"]))
        t_tobler = float(edge["lengthMeters"]) / v_ms
        edge.setdefault("costSecondsFlat", {})["foot-walking"] = round(t_flat, 2)
        edge["costSeconds"]["foot-walking"] = round(t_tobler, 2)
        stats["tobler_orig_seconds"] += t_flat
        stats["tobler_new_seconds"] += t_tobler

        # ─── 4A OBRA LINEAL ───
        vul = obra_lineal_for_edge(line_9377, line_buf_obra, obras_tree, obras)
        if vul:
            edge["obraLinealVul"] = vul
            stats["with_obra_lineal"] += 1
            if vul in stats["obra_by_vul"]:
                stats["obra_by_vul"][vul] += 1
        else:
            edge["obraLinealVul"] = None

        # ─── 4B PREDIOS RIESGO ───
        nearby: dict[str, dict[str, int]] = {}
        for emerg, tree, feats in (
            ("inundacion", riesgo_inund_tree, riesgo_inund),
            ("avenida_torrencial", riesgo_at_tree, riesgo_at),
            ("movimiento_en_masa", riesgo_mm_tree, riesgo_mm),
        ):
            counts = predios_riesgo_for_edge(line_buf_predio, tree, feats)
            if counts:
                nearby[emerg] = counts
                stats["with_predios_riesgo"][emerg] += 1
        if nearby:
            edge["nearbyRisk"] = nearby
        else:
            edge.pop("nearbyRisk", None)

    # ─── Meta del grafo enriquecido ────────────────────────────────
    meta = graph.setdefault("meta", {})
    meta["toblerApplied"] = True
    meta["obraLinealApplied"] = True
    meta["nearbyRiskApplied"] = True
    meta["hazardTaggedBy"] = "line-polygon-intersection (shapely 2.x, EPSG:9377)"
    meta["enrichedAt"] = datetime.now(timezone.utc).isoformat()
    meta["crs"] = "EPSG:4326"  # storage del JSON: lat/lng simples
    meta["originalDatum"] = "MAGNA-SIRGAS / Colombia CTM12 (EPSG:9377)"
    meta["spatialOpsCRS"] = "EPSG:9377"
    meta["taggedEdges"] = sum(1 for e in edges if e.get("hazardByType"))
    meta["toblerReference"] = (
        "Tobler, W. (1993). Three presentations on geographical analysis "
        "and modeling. NCGIA Technical Report 93-1."
    )
    meta["catastroSource"] = (
        "ALDESARROLLO (2025). Estudio Detallado de Amenaza, Vulnerabilidad y "
        "Riesgo — Río San Eugenio, Santa Rosa de Cabal. Escala 1:1000, "
        "Decreto 1807/2014."
    )
    meta["normativeRef"] = "Resolución IGAC 471/2020 (MAGNA-SIRGAS oficial)"

    GRAPH_PATH.write_text(json.dumps(graph), encoding="utf-8")
    size_kb = GRAPH_PATH.stat().st_size / 1024.0

    # ─── Reporte final ─────────────────────────────────────────────
    print("\n" + "═" * 67)
    print("  ENRIQUECIMIENTO DEL GRAFO VIAL — REPORTE")
    print("═" * 67)
    print(f"Aristas totales:                 {stats['edges']}")
    print(
        f"Con pendiente asignada (EDAVR):  {stats['with_slope_assigned']} "
        f"({(stats['with_slope_assigned'] / max(stats['edges'], 1)) * 100:.1f} %)"
    )
    if stats["slope_distribution"]:
        print("\nDistribución de rangos de pendiente:")
        for rango, n in sorted(stats["slope_distribution"].items()):
            print(f"  {rango:<14} → {n} aristas")

    delta = stats["tobler_new_seconds"] - stats["tobler_orig_seconds"]
    delta_rel = (
        (delta / stats["tobler_orig_seconds"]) * 100
        if stats["tobler_orig_seconds"]
        else 0.0
    )
    print("\nImpacto Tobler en tiempo de caminata (suma de aristas):")
    print(f"  Original (plano):   {stats['tobler_orig_seconds'] / 60:.1f} min")
    print(f"  Con Tobler:         {stats['tobler_new_seconds'] / 60:.1f} min")
    print(
        f"  Δ:                  {'+' if delta >= 0 else ''}{delta / 60:.1f} min  "
        f"({'+' if delta_rel >= 0 else ''}{delta_rel:.1f} %)"
    )

    print(f"\nAristas asociadas a obra lineal evaluada: {stats['with_obra_lineal']}")
    for k in ("Alta", "Media", "Baja"):
        print(f"  Vulnerabilidad {k:<6}: {stats['obra_by_vul'][k]}")

    print("\nAristas con hazard categórico (intersección real):")
    for k, v in stats["with_hazard"].items():
        print(f"  {k:<22} {v}")

    print("\nAristas con predios en riesgo cercanos (buffer 25 m):")
    for k, v in stats["with_predios_riesgo"].items():
        print(f"  {k:<22} {v}")

    print(f"\n✓ Grafo enriquecido escrito en {GRAPH_PATH.relative_to(ROOT)} "
          f"({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
