/**
 * Enriquece graph.json con 3 factores catastrales:
 *
 *   3A — Pendiente + Tobler   : calcula grados por arista desde
 *                               pendiente_grados.json y reemplaza el
 *                               `costSeconds.foot-walking` por el tiempo
 *                               derivado de la función de marcha de
 *                               Tobler (1993):
 *                                 W = 6 · exp(-3.5 · |S + 0.05|) km/h
 *                               donde S = tan(pendiente en rad).
 *
 *   4A — Vulnerabilidad vial  : asocia cada arista a la obra lineal más
 *                               cercana (<15 m) de
 *                               vulnerabilidad_obras_lineales.json.
 *                               Marca `obraLinealVul = Alta|Media|Baja|null`.
 *
 *   4B — Riesgo predial       : cuenta predios en cada categoría de
 *                               riesgo (Alta/Media/Baja) dentro del buffer
 *                               de la arista (~20 m), por cada emergencia.
 *                               Se consume desde el motor de ruteo para
 *                               multiplicar el costo.
 *
 * El grafo resultante reemplaza data/graph.json (con backup automático
 * en data/graph.flat.backup.json). La estructura se mantiene compatible
 * con el código actual; solo se agregan campos opcionales a cada edge.
 *
 * Metodología y referencias:
 *   - Tobler, W. (1993). Three presentations on geographical analysis
 *     and modeling. NCGIA Technical Report 93-1.
 *   - Decreto 1807/2014 (Colombia) — estudios detallados de riesgo
 *     como determinante de ordenamiento territorial.
 *   - ALDESARROLLO (2025) — Estudio Detallado de Amenaza, Vulnerabilidad
 *     y Riesgo del río San Eugenio, Santa Rosa de Cabal.
 */

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const CATASTRO = path.join(DATA, 'catastro');

const graphPath = path.join(DATA, 'graph.json');
const backupPath = path.join(DATA, 'graph.flat.backup.json');

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(graphPath, backupPath);
  console.log(`Backup original → ${path.relative(process.cwd(), backupPath)}`);
}

const graph = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const pendiente = JSON.parse(fs.readFileSync(path.join(CATASTRO, 'pendiente_grados.json'), 'utf8'));
const obras = JSON.parse(fs.readFileSync(path.join(CATASTRO, 'vulnerabilidad_obras_lineales.json'), 'utf8'));
const riesgoInun = JSON.parse(fs.readFileSync(path.join(CATASTRO, 'riesgo_inundacion.json'), 'utf8'));
const riesgoAvt = JSON.parse(fs.readFileSync(path.join(CATASTRO, 'riesgo_avenidas_torrenciales.json'), 'utf8'));
const riesgoMm = JSON.parse(fs.readFileSync(path.join(CATASTRO, 'riesgo_movimientos_masa.json'), 'utf8'));

// ─── Indexado del grafo ────────────────────────────────────────────────────
const idToIndex = Object.create(null);
for (let i = 0; i < graph.nodes.length; i++) idToIndex[graph.nodes[i].id] = i;

// ─── Utilidades geométricas ────────────────────────────────────────────────
function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  if (geometry.type === 'Polygon') {
    if (!pointInRing(point, geometry.coordinates[0])) return false;
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (pointInRing(point, geometry.coordinates[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (pointInRing(point, poly[0])) {
        let inHole = false;
        for (let i = 1; i < poly.length; i++) {
          if (pointInRing(point, poly[i])) { inHole = true; break; }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

function approxCentroid(geometry) {
  let ring;
  if (geometry.type === 'Polygon') ring = geometry.coordinates[0];
  else if (geometry.type === 'MultiPolygon') ring = geometry.coordinates[0][0];
  else return null;
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return [sx / ring.length, sy / ring.length];
}

// Distancia Haversine (m)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const f1 = (lat1 * Math.PI) / 180, f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── 3A — Pendiente + Tobler ───────────────────────────────────────────────
// Mapeo rango → pendiente promedio en grados (midpoint del rango).
const RANGO_A_GRADOS = {
  '0º-8.5º': 4.25,
  '8.5º-16.5º': 12.5,
  '16.5º-26.6º': 21.55,
  '26.6º-45º': 35.8,
  '>45º': 50,
};

function gradosFromRango(raw) {
  if (RANGO_A_GRADOS[raw] != null) return RANGO_A_GRADOS[raw];
  // Fallback robusto si hay variación en escritura
  const norm = String(raw || '').replace(/[º°\s]/g, '');
  for (const [k, v] of Object.entries(RANGO_A_GRADOS)) {
    if (k.replace(/[º°\s]/g, '') === norm) return v;
  }
  return null;
}

function toblerKmh(gradosAscendente) {
  // Slope en fracción (tangente)
  const S = Math.tan((gradosAscendente * Math.PI) / 180);
  // Tobler: caminata hacia arriba → usar S positivo.
  return 6 * Math.exp(-3.5 * Math.abs(S + 0.05));
}

// ─── 4A — Vulnerabilidad de obras lineales ─────────────────────────────────
// Mapa: centroides de los tramos viales evaluados, con su Clas_vulne.
const obrasLineales = obras.features.map((f) => ({
  centro: approxCentroid(f.geometry),
  vuln: (f.properties.Clas_vulne || '').trim() || null,
  tipo: (f.properties.tipo_ol || '').trim(),
}));

// ─── 4B — Contar predios en riesgo cerca de cada arista ───────────────────
// Pre-procesar centroides de cada capa de riesgo.
function preparerRiesgoCentroides(coleccion) {
  return coleccion.features.map((f) => ({
    centro: approxCentroid(f.geometry),
    nivel: (f.properties.CATEGORIA || f.properties.C_riesgo || '').trim(),
  }));
}
const riesgoCentroides = {
  inundacion: preparerRiesgoCentroides(riesgoInun),
  avenida_torrencial: preparerRiesgoCentroides(riesgoAvt),
  movimiento_en_masa: preparerRiesgoCentroides(riesgoMm),
};

// ─── Procesamiento de cada arista ──────────────────────────────────────────
let estadisticas = {
  edges: graph.edges.length,
  conPendienteAsignada: 0,
  pendienteDistribucion: {},
  conObraLineal: 0,
  obraLinealPorVul: { Alta: 0, Media: 0, Baja: 0 },
  tiempoOriginalSuma: 0,
  tiempoToblerSuma: 0,
  aristasConRiesgo: { inundacion: 0, avenida_torrencial: 0, movimiento_en_masa: 0 },
};

const OBRA_LINEAL_RADIUS = 15;
const PREDIO_RISK_RADIUS = 25;

for (let i = 0; i < graph.edges.length; i++) {
  const edge = graph.edges[i];
  const a = graph.nodes[idToIndex[edge.from]];
  const b = graph.nodes[idToIndex[edge.to]];
  if (!a || !b) continue;

  const midLat = (a.lat + b.lat) / 2;
  const midLng = (a.lng + b.lng) / 2;
  const midPoint = [midLng, midLat]; // GeoJSON usa [lng, lat]

  // 3A: pendiente
  let gradosAsignados = null;
  for (const f of pendiente.features) {
    if (pointInGeometry(midPoint, f.geometry)) {
      const g = gradosFromRango(f.properties.INCLINA);
      if (g != null) {
        gradosAsignados = g;
        const key = f.properties.INCLINA;
        estadisticas.pendienteDistribucion[key] = (estadisticas.pendienteDistribucion[key] || 0) + 1;
      }
      break;
    }
  }
  // Si la arista cae fuera del área de estudio detallada, asumimos terreno
  // plano (conservador). El grafo OSM cubre más área que el ámbito del EDAVR.
  if (gradosAsignados == null) gradosAsignados = 4.25;
  else estadisticas.conPendienteAsignada++;

  edge.slopeDegrees = +gradosAsignados.toFixed(2);

  // Aplicar Tobler a foot-walking
  const velocidadKmh = toblerKmh(gradosAsignados);
  const velocidadMs = (velocidadKmh * 1000) / 3600;
  const tiempoOriginal = edge.costSeconds['foot-walking'];
  const tiempoTobler = edge.lengthMeters / velocidadMs;
  edge.costSecondsFlat = edge.costSecondsFlat || { 'foot-walking': +tiempoOriginal.toFixed(2) };
  edge.costSeconds['foot-walking'] = +tiempoTobler.toFixed(2);
  estadisticas.tiempoOriginalSuma += tiempoOriginal;
  estadisticas.tiempoToblerSuma += tiempoTobler;

  // 4A: vulnerabilidad de obra lineal más cercana (dentro del radio)
  let bestObra = null, bestObraD = Infinity;
  for (const o of obrasLineales) {
    if (!o.centro) continue;
    const d = haversine(midLat, midLng, o.centro[1], o.centro[0]);
    if (d < bestObraD) { bestObraD = d; bestObra = o; }
  }
  if (bestObra && bestObraD <= OBRA_LINEAL_RADIUS) {
    edge.obraLinealVul = bestObra.vuln;
    estadisticas.conObraLineal++;
    if (estadisticas.obraLinealPorVul[bestObra.vuln] != null) {
      estadisticas.obraLinealPorVul[bestObra.vuln]++;
    }
  } else {
    edge.obraLinealVul = null;
  }

  // 4B: contar predios en riesgo cercanos por emergencia × nivel
  const nearbyRisk = { inundacion: {}, avenida_torrencial: {}, movimiento_en_masa: {} };
  for (const [emerg, centroides] of Object.entries(riesgoCentroides)) {
    for (const c of centroides) {
      if (!c.centro || !c.nivel) continue;
      const d = haversine(midLat, midLng, c.centro[1], c.centro[0]);
      if (d <= PREDIO_RISK_RADIUS) {
        nearbyRisk[emerg][c.nivel] = (nearbyRisk[emerg][c.nivel] || 0) + 1;
      }
    }
    if (Object.keys(nearbyRisk[emerg]).length > 0) {
      estadisticas.aristasConRiesgo[emerg]++;
    }
  }
  // Guardar solo si hay al menos un hit para mantener el JSON pequeño
  if (
    Object.keys(nearbyRisk.inundacion).length > 0 ||
    Object.keys(nearbyRisk.avenida_torrencial).length > 0 ||
    Object.keys(nearbyRisk.movimiento_en_masa).length > 0
  ) {
    edge.nearbyRisk = nearbyRisk;
  }
}

// ─── Meta del grafo enriquecido ────────────────────────────────────────────
graph.meta.toblerApplied = true;
graph.meta.obraLinealApplied = true;
graph.meta.nearbyRiskApplied = true;
graph.meta.enrichedAt = new Date().toISOString();
graph.meta.crs = 'EPSG:4326';
graph.meta.originalDatum = 'MAGNA-SIRGAS Colombia CTM12';
graph.meta.toblerReference =
  'Tobler, W. (1993). Three presentations on geographical analysis and modeling. NCGIA Technical Report 93-1.';
graph.meta.catastroSource =
  'ALDESARROLLO (2025). Estudio Detallado de Amenaza, Vulnerabilidad y Riesgo — Río San Eugenio, Santa Rosa de Cabal. Escala 1:1000, Decreto 1807/2014.';

fs.writeFileSync(graphPath, JSON.stringify(graph), 'utf8');

// ─── Reporte ────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('  ENRIQUECIMIENTO CATASTRAL DEL GRAFO VIAL');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`Aristas totales:                ${estadisticas.edges}`);
console.log(`Con pendiente asignada (EDAVR): ${estadisticas.conPendienteAsignada} ` +
            `(${((estadisticas.conPendienteAsignada/estadisticas.edges)*100).toFixed(1)} %)`);
console.log('\nDistribución de rangos de pendiente aplicados:');
for (const [rango, n] of Object.entries(estadisticas.pendienteDistribucion)) {
  console.log(`  ${rango.padEnd(14)} → ${n} aristas`);
}
console.log('\nImpacto Tobler en tiempo de caminata (total agregado):');
console.log(`  Suma original:  ${(estadisticas.tiempoOriginalSuma/60).toFixed(1)} min`);
console.log(`  Suma Tobler:    ${(estadisticas.tiempoToblerSuma/60).toFixed(1)} min`);
const delta = estadisticas.tiempoToblerSuma - estadisticas.tiempoOriginalSuma;
const deltaRel = (delta / estadisticas.tiempoOriginalSuma) * 100;
console.log(`  Δ:              ${delta>0 ? '+' : ''}${(delta/60).toFixed(1)} min ` +
            `(${deltaRel>0 ? '+' : ''}${deltaRel.toFixed(1)} %)`);
console.log(`\nAristas asociadas a obra lineal evaluada: ${estadisticas.conObraLineal}`);
console.log(`  Vulnerabilidad Alta:  ${estadisticas.obraLinealPorVul.Alta}`);
console.log(`  Vulnerabilidad Media: ${estadisticas.obraLinealPorVul.Media}`);
console.log(`  Vulnerabilidad Baja:  ${estadisticas.obraLinealPorVul.Baja}`);
console.log('\nAristas con predios en riesgo cercanos por emergencia:');
console.log(`  Inundación:            ${estadisticas.aristasConRiesgo.inundacion}`);
console.log(`  Avenida torrencial:    ${estadisticas.aristasConRiesgo.avenida_torrencial}`);
console.log(`  Movimiento en masa:    ${estadisticas.aristasConRiesgo.movimiento_en_masa}`);
console.log('\n✔ graph.json enriquecido y guardado.');
console.log(`✔ Backup plano: ${path.relative(process.cwd(), backupPath)}`);
console.log('═══════════════════════════════════════════════════════════════════');
