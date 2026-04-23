/**
 * Pre-cálculo offline de la exposición catastral por tipo de amenaza y nivel.
 *
 * Entrada: capas GeoJSON del Estudio Detallado ALDESARROLLO (2025)
 *   data/catastro/riesgo_inundacion.json
 *   data/catastro/riesgo_avenidas_torrenciales.json
 *   data/catastro/riesgo_movimientos_masa.json
 *   data/catastro/vulnerabilidad_edificaciones.json
 *
 * Salida: data/catastro/exposicion_catastral.json con métricas agregadas
 *   por emergencia × nivel:
 *   - # edificaciones expuestas
 *   - Valor catastral total (COP)
 *   - Valor de mercado estimado (COP)
 *   - Área construida total (m²)
 *   - Ocupación máxima total (personas)
 *   - Población vulnerable (niños + adultos mayores + personas con discapacidad)
 *
 * Método: para cada feature de riesgo se calcula el centroide aproximado,
 * y se busca cuál polígono de vulnerabilidad_edificaciones lo contiene.
 * Así se asocian los atributos económicos y sociales al nivel de riesgo.
 *
 * Este script se corre UNA sola vez (o cuando cambien los insumos). El JSON
 * resultante es pequeño y se consume en el cliente sin recálculo.
 */

const fs = require('fs');
const path = require('path');

const catastroDir = path.join(__dirname, '..', 'data', 'catastro');
const load = (fn) => JSON.parse(fs.readFileSync(path.join(catastroDir, fn), 'utf8'));

const vuln = load('vulnerabilidad_edificaciones.json');
const riesgos = {
  inundacion: load('riesgo_inundacion.json'),
  avenida_torrencial: load('riesgo_avenidas_torrenciales.json'),
  movimiento_en_masa: load('riesgo_movimientos_masa.json'),
};

// ─── Geometría: point-in-polygon (ray casting) ─────────────────────────────
function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  // polygon = [outerRing, ...holes]
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false; // está en un hueco
  }
  return true;
}

function pointInFeatureGeometry(point, geometry) {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (pointInPolygon(point, poly)) return true;
    }
  }
  return false;
}

// Centroide aproximado (promedio de vértices del primer anillo).
function approxCentroid(geometry) {
  let ring;
  if (geometry.type === 'Polygon') ring = geometry.coordinates[0];
  else if (geometry.type === 'MultiPolygon') ring = geometry.coordinates[0][0];
  else return null;
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return [sx / ring.length, sy / ring.length];
}

// ─── Asociar riesgo ↔ vulnerabilidad ──────────────────────────────────────
function matchRiesgoConVulnerabilidad(riesgoFeature) {
  const centro = approxCentroid(riesgoFeature.geometry);
  if (!centro) return null;
  for (const vf of vuln.features) {
    if (pointInFeatureGeometry(centro, vf.geometry)) return vf.properties;
  }
  // Fallback: buscar el centroide de vulnerabilidad más cercano (por distancia
  // euclidiana en grados; suficiente para confirmación de match en radio <100m).
  let best = null, bestD = Infinity;
  for (const vf of vuln.features) {
    const vc = approxCentroid(vf.geometry);
    if (!vc) continue;
    const dx = vc[0] - centro[0];
    const dy = vc[1] - centro[1];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = vf.properties; }
  }
  // Umbral ~30 m en grados (1° ≈ 111 km; 30 m ≈ 0.00027°, d² ≈ 7.3e-8)
  if (bestD < 7.3e-8) return best;
  return null;
}

// ─── Extraer nivel de un feature de riesgo ─────────────────────────────────
function extractNivel(props) {
  const v = (props.CATEGORIA || props.C_riesgo || '').trim();
  if (v === 'Alta' || v === 'Media' || v === 'Baja') return v;
  return null;
}

// ─── Agregación ────────────────────────────────────────────────────────────
function initStats() {
  return {
    numEdificaciones: 0,
    valorCatastralCOP: 0,
    valorMercadoCOP: 0,
    valorPorM2PromCOP: 0,
    areaConstruidaM2: 0,
    areaTerrenoM2: 0,
    poblacionOcupacionMax: 0,
    niños: 0,
    adultosMayores: 0,
    personasConDiscapacidad: 0,
    poblacionVulnerable: 0,
  };
}

function acumular(stats, props) {
  stats.numEdificaciones += 1;
  stats.valorCatastralCOP += Number(props.valor_cat) || 0;
  stats.valorMercadoCOP += Number(props.valor_esti) || 0;
  stats.valorPorM2PromCOP += Number(props.valorm2) || 0;
  stats.areaConstruidaM2 += Number(props.area_cons) || 0;
  stats.areaTerrenoM2 += Number(props.area_terr) || 0;
  stats.poblacionOcupacionMax += Number(props.oc_max) || 0;
  stats.niños += Number(props.niños) || 0;
  stats.adultosMayores += Number(props.adulto_may) || 0;
  stats.personasConDiscapacidad += Number(props.discap) || 0;
}

function finalizar(stats) {
  if (stats.numEdificaciones > 0) {
    stats.valorPorM2PromCOP = Math.round(stats.valorPorM2PromCOP / stats.numEdificaciones);
  }
  stats.poblacionVulnerable =
    stats.niños + stats.adultosMayores + stats.personasConDiscapacidad;
  return stats;
}

// ─── Cálculo principal ─────────────────────────────────────────────────────
const out = {
  generadoEn: new Date().toISOString(),
  fuente: 'Estudio Detallado de Amenaza, Vulnerabilidad y Riesgo del río San Eugenio - ALDESARROLLO (2025)',
  escala: '1:1.000',
  datumOriginal: 'MAGNA-SIRGAS Colombia CTM12',
  porEmergencia: {},
};

for (const [emergencia, coleccion] of Object.entries(riesgos)) {
  const porNivel = { Alta: initStats(), Media: initStats(), Baja: initStats() };
  const totalFeatures = coleccion.features.length;
  let matched = 0;
  for (const f of coleccion.features) {
    const nivel = extractNivel(f.properties);
    if (!nivel) continue;
    const vprops = matchRiesgoConVulnerabilidad(f);
    if (!vprops) continue;
    acumular(porNivel[nivel], vprops);
    matched++;
  }
  for (const n of ['Alta', 'Media', 'Baja']) finalizar(porNivel[n]);

  // Totales agregados
  const total = initStats();
  for (const n of ['Alta', 'Media', 'Baja']) {
    for (const k of Object.keys(total)) {
      if (k === 'valorPorM2PromCOP') continue; // se promedia al final
      total[k] += porNivel[n][k];
    }
  }
  if (total.numEdificaciones > 0) {
    total.valorPorM2PromCOP = Math.round(
      (['Alta', 'Media', 'Baja'].reduce(
        (s, n) => s + porNivel[n].valorPorM2PromCOP * porNivel[n].numEdificaciones, 0,
      )) / total.numEdificaciones,
    );
  }
  total.poblacionVulnerable =
    total.niños + total.adultosMayores + total.personasConDiscapacidad;

  out.porEmergencia[emergencia] = {
    matchedFeatures: matched,
    totalFeaturesRiesgo: totalFeatures,
    porNivel,
    total,
  };
}

// ─── Resumen en consola ────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════');
console.log('  EXPOSICIÓN CATASTRAL — Santa Rosa de Cabal');
console.log('  Fuente: ALDESARROLLO (2025), escala 1:1.000');
console.log('═══════════════════════════════════════════════════════════');
for (const [emergencia, stats] of Object.entries(out.porEmergencia)) {
  console.log(`\n▸ ${emergencia.toUpperCase()}`);
  console.log(`  Features de riesgo: ${stats.totalFeaturesRiesgo}`);
  console.log(`  Matcheadas con vulnerabilidad: ${stats.matchedFeatures}`);
  console.log(`  Total edificaciones expuestas: ${stats.total.numEdificaciones}`);
  console.log(
    `  Valor catastral: COP ${stats.total.valorCatastralCOP.toLocaleString('es-CO')}`,
  );
  console.log(
    `  Valor mercado:   COP ${stats.total.valorMercadoCOP.toLocaleString('es-CO')}`,
  );
  console.log(`  Población expuesta: ${stats.total.poblacionOcupacionMax} personas`);
  console.log(`    - Niños: ${stats.total.niños}`);
  console.log(`    - Adultos mayores: ${stats.total.adultosMayores}`);
  console.log(`    - Con discapacidad: ${stats.total.personasConDiscapacidad}`);
  console.log(`    - Total vulnerable: ${stats.total.poblacionVulnerable}`);
  console.log('  Por nivel:');
  for (const n of ['Alta', 'Media', 'Baja']) {
    const s = stats.porNivel[n];
    console.log(
      `    ${n.padEnd(6)}: ${String(s.numEdificaciones).padStart(3)} edif · ` +
        `COP ${s.valorCatastralCOP.toLocaleString('es-CO').padStart(15)} · ` +
        `${s.poblacionOcupacionMax} pers`,
    );
  }
}

// ─── Guardar JSON ──────────────────────────────────────────────────────────
const outPath = path.join(catastroDir, 'exposicion_catastral.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(`\n✔ JSON guardado en ${path.relative(process.cwd(), outPath)}`);
console.log('═══════════════════════════════════════════════════════════');
