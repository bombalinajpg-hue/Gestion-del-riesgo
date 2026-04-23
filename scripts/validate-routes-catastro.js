/**
 * Validación experimental del impacto de los factores catastrales en el
 * ruteo. Corre rutas aleatorias con dos configuraciones:
 *
 *   A · BASE  : grafo plano (pre-Tobler) + sin penalización catastral
 *   B · CATAS : grafo Tobler + penalización catastral (4A + 4B) activa
 *
 * Para cada ruta generada en cada configuración, se mide:
 *   · Distancia en metros
 *   · Duración estimada en segundos
 *   · Nº de aristas que cruzan un polígono de `ElementosExpuestos`
 *     calificado como AMEN_TOTAL = Alta para la emergencia activa
 *   · Nº de aristas con `obraLinealVul = Alta`
 *
 * Esta es la evidencia cuantitativa del Objetivo 5 del anteproyecto:
 * "validar el funcionamiento mediante pruebas controladas, evaluando
 *  eficacia, precisión y facilidad de uso". La precisión (impacto de
 *  los factores) queda medida aquí; eficacia y facilidad de uso van por
 *  el cuestionario SUS (scripts/docs/sus_form_content.md).
 *
 * Uso:
 *   node scripts/validate-routes-catastro.js [N]     (default 50 rutas)
 *
 * Salidas:
 *   data/validacion_catastro.json — resumen estadístico
 *   data/validacion_catastro.csv  — detalle por ruta
 */

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const CATASTRO = path.join(DATA, 'catastro');

// Usamos SIEMPRE el grafo enriched (que tiene obraLinealVul, nearbyRisk
// y costSecondsFlat como respaldo). La diferencia entre BASE y CATAS es
// qué costo lee el algoritmo y si aplica penalty catastral:
//   · BASE  → costSecondsFlat (pre-Tobler) + penalty=false
//   · CATAS → costSeconds (Tobler) + penalty=true
// Las métricas de cruce (ElementosAlta, ObraVulAlta) se calculan con las
// anotaciones del grafo enriched en ambos casos, para que la comparación
// sea simétrica y justa.
const graphTobler = JSON.parse(fs.readFileSync(path.join(DATA, 'graph.json'), 'utf8'));
const graphFlatRaw = graphTobler; // misma estructura; cambiamos qué costo leemos
const destinos = JSON.parse(fs.readFileSync(path.join(DATA, 'destinos.json'), 'utf8'));
const elementos = JSON.parse(fs.readFileSync(path.join(CATASTRO, 'elementos_expuestos.json'), 'utf8'));

// ─── Indexación e índices derivados ────────────────────────────────────────
function indexGraph(g) {
  g.idToIndex = Object.create(null);
  for (let i = 0; i < g.nodes.length; i++) g.idToIndex[g.nodes[i].id] = i;
  g.edgesOut = Array.from({ length: g.nodes.length }, () => []);
  for (let i = 0; i < g.edges.length; i++) {
    const fromIdx = g.idToIndex[g.edges[i].from];
    if (fromIdx !== undefined) g.edgesOut[fromIdx].push(i);
  }
  return g;
}
indexGraph(graphTobler);
indexGraph(graphFlatRaw);

// ─── MinHeap + Dijkstra con penalty configurable ──────────────────────────
class MinHeap {
  constructor() { this.h = []; }
  push(item, priority) { this.h.push({ item, priority }); this._up(this.h.length - 1); }
  pop() {
    if (!this.h.length) return null;
    const top = this.h[0];
    const last = this.h.pop();
    if (this.h.length) { this.h[0] = last; this._down(0); }
    return top;
  }
  get size() { return this.h.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p].priority <= this.h[i].priority) break;
      [this.h[i], this.h[p]] = [this.h[p], this.h[i]]; i = p;
    }
  }
  _down(i) {
    const n = this.h.length;
    while (true) {
      const l = i*2+1, r = l+1; let s = i;
      if (l < n && this.h[l].priority < this.h[s].priority) s = l;
      if (r < n && this.h[r].priority < this.h[s].priority) s = r;
      if (s === i) break;
      [this.h[i], this.h[s]] = [this.h[s], this.h[i]]; i = s;
    }
  }
}

const DEFAULT_OBRA_FACTOR = { Alta: 2.0, Media: 0.6, Baja: 0.15 };
const DEFAULT_PRED_FACTOR = { Alta: 0.25, Media: 0.08, Baja: 0.02 };

function catastroMultiplier(edge, emergencyType) {
  if (emergencyType === 'ninguna') return 1;
  let mult = 1;
  if (edge.obraLinealVul && DEFAULT_OBRA_FACTOR[edge.obraLinealVul] != null) {
    mult += DEFAULT_OBRA_FACTOR[edge.obraLinealVul];
  }
  const risks = edge.nearbyRisk?.[emergencyType];
  if (risks) {
    if (risks.Alta) mult += risks.Alta * DEFAULT_PRED_FACTOR.Alta;
    if (risks.Media) mult += risks.Media * DEFAULT_PRED_FACTOR.Media;
    if (risks.Baja) mult += risks.Baja * DEFAULT_PRED_FACTOR.Baja;
  }
  return Math.min(mult, 4);
}

function dijkstra(graph, startIdx, endIdx, { emergencyType, useCatastro, useFlatCost }) {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  dist[startIdx] = 0;
  const heap = new MinHeap();
  heap.push(startIdx, 0);
  while (heap.size) {
    const { item: u } = heap.pop();
    if (visited[u]) continue;
    visited[u] = 1;
    if (u === endIdx) break;
    for (const edgeIdx of graph.edgesOut[u]) {
      const edge = graph.edges[edgeIdx];
      // BASE usa el tiempo plano pre-Tobler si está disponible;
      // CATAS usa el Tobler aplicado + penalty catastral.
      let weight = useFlatCost && edge.costSecondsFlat?.['foot-walking']
        ? edge.costSecondsFlat['foot-walking']
        : edge.costSeconds['foot-walking'];
      if (useCatastro) {
        weight *= catastroMultiplier(edge, emergencyType);
      }
      const v = graph.idToIndex[edge.to];
      if (v === undefined || visited[v]) continue;
      const alt = dist[u] + weight;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
        prevEdge[v] = edgeIdx;
        heap.push(v, alt);
      }
    }
  }
  if (!isFinite(dist[endIdx])) return null;
  const pathEdges = [];
  let cur = endIdx;
  while (cur !== -1 && prevEdge[cur] >= 0) {
    pathEdges.push(prevEdge[cur]);
    cur = prev[cur];
  }
  return { durationSeconds: dist[endIdx], edgeIndices: pathEdges };
}

// ─── Helpers para detectar cruces con ElementosExpuestos alto ─────────────
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

function pointInGeometry(pt, geom) {
  if (geom.type === 'Polygon') {
    if (!pointInRing(pt, geom.coordinates[0])) return false;
    for (let i = 1; i < geom.coordinates.length; i++) if (pointInRing(pt, geom.coordinates[i])) return false;
    return true;
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) if (pointInRing(pt, poly[0])) return true;
  }
  return false;
}

// Índices de elementos de amenaza Alta por emergencia (pre-cálculo).
function filterElementosAlta(emergencia) {
  const campo =
    emergencia === 'inundacion' ? 'INUND' :
    emergencia === 'movimiento_en_masa' ? 'MM' :
    emergencia === 'avenida_torrencial' ? 'AVT' : null;
  if (!campo) return [];
  return elementos.features.filter((f) => f.properties[campo] === 'Alta');
}

const elementosAltaPorEmergencia = {
  inundacion: filterElementosAlta('inundacion'),
  avenida_torrencial: filterElementosAlta('avenida_torrencial'),
  movimiento_en_masa: filterElementosAlta('movimiento_en_masa'),
};

// ─── Métricas por ruta ────────────────────────────────────────────────────
function measureRoute(graph, result, emergencia) {
  if (!result) return null;
  let crossesElementoAlta = 0;
  let crossesObraAlta = 0;
  let totalEdges = result.edgeIndices.length;
  let distanceMeters = 0;
  const elementosAlta = elementosAltaPorEmergencia[emergencia] || [];
  for (const edgeIdx of result.edgeIndices) {
    const edge = graph.edges[edgeIdx];
    distanceMeters += edge.lengthMeters || 0;
    if (edge.obraLinealVul === 'Alta') crossesObraAlta++;
    // Verificar si el midpoint cruza algún elemento alto
    const fromIdx = graph.idToIndex[edge.from];
    const toIdx = graph.idToIndex[edge.to];
    const a = graph.nodes[fromIdx];
    const b = graph.nodes[toIdx];
    const mid = [(a.lng + b.lng) / 2, (a.lat + b.lat) / 2];
    for (const el of elementosAlta) {
      if (pointInGeometry(mid, el.geometry)) { crossesElementoAlta++; break; }
    }
  }
  return {
    totalEdges,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round(result.durationSeconds),
    durationMinutes: +(result.durationSeconds / 60).toFixed(2),
    crossesElementoAlta,
    crossesObraAlta,
  };
}

// ─── Snap helpers ─────────────────────────────────────────────────────────
function snapToNode(graph, lat, lng) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const dLat = n.lat - lat, dLng = n.lng - lng;
    const d2 = dLat * dLat + dLng * dLng;
    if (d2 < bestD) { bestD = d2; best = i; }
  }
  return best;
}

const puntosEncuentro = destinos.filter((d) => d.tipo === 'punto_encuentro');
const destNodes = puntosEncuentro.map((d) => ({
  name: d.nombre,
  idx: snapToNode(graphTobler, d.lat, d.lng),
}));

// ─── RNG determinista para reproducibilidad ───────────────────────────────
let seed = 99;
const rnd = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;  seed >>>= 0;
  return seed / 0xFFFFFFFF;
};

// ─── Escenarios a comparar ────────────────────────────────────────────────
const emergencias = ['inundacion', 'avenida_torrencial', 'movimiento_en_masa'];

const N = parseInt(process.argv[2], 10) || 50;

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  VALIDACIÓN EXPERIMENTAL — IMPACTO CATASTRAL EN EL RUTEO');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`Grafo Tobler:  ${graphTobler.nodes.length} nodos, ${graphTobler.edges.length} aristas`);
console.log(`Iteraciones:   ${N} pares origen-destino por configuración × 3 emergencias`);
console.log('Escenarios: BASE (grafo plano, sin penalty) vs CATAS (Tobler + penalty 4A+4B)');
console.log('-------------------------------------------------------------------');

const csvRows = ['config,emergencia,iter,durationMin,distanceM,totalEdges,crossesElementoAlta,crossesObraAlta'];
const resumen = { base: {}, catas: {} };
for (const e of emergencias) {
  resumen.base[e] = { rutas: [], fails: 0 };
  resumen.catas[e] = { rutas: [], fails: 0 };
}

for (const emergencia of emergencias) {
  for (let i = 0; i < N; i++) {
    const startIdx = Math.floor(rnd() * graphTobler.nodes.length);
    const dest = destNodes[Math.floor(rnd() * destNodes.length)];

    // Config A: BASE (grafo plano, sin penalty)
    const rBase = dijkstra(graphFlatRaw, startIdx, dest.idx, {
      emergencyType: emergencia,
      useCatastro: false,
      useFlatCost: true,
    });
    const mBase = measureRoute(graphFlatRaw, rBase, emergencia);
    if (!mBase) resumen.base[emergencia].fails++;
    else {
      resumen.base[emergencia].rutas.push(mBase);
      csvRows.push(
        `BASE,${emergencia},${i + 1},${mBase.durationMinutes},${mBase.distanceMeters},${mBase.totalEdges},${mBase.crossesElementoAlta},${mBase.crossesObraAlta}`,
      );
    }

    // Config B: CATAS (Tobler + penalty catastral)
    const rCat = dijkstra(graphTobler, startIdx, dest.idx, {
      emergencyType: emergencia,
      useCatastro: true,
    });
    const mCat = measureRoute(graphTobler, rCat, emergencia);
    if (!mCat) resumen.catas[emergencia].fails++;
    else {
      resumen.catas[emergencia].rutas.push(mCat);
      csvRows.push(
        `CATAS,${emergencia},${i + 1},${mCat.durationMinutes},${mCat.distanceMeters},${mCat.totalEdges},${mCat.crossesElementoAlta},${mCat.crossesObraAlta}`,
      );
    }
  }
}

// ─── Agregados ────────────────────────────────────────────────────────────
function mean(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((s, r) => s + r[key], 0) / arr.length;
}
function pctRutasCruzando(arr, key) {
  if (!arr.length) return 0;
  return (arr.filter((r) => r[key] > 0).length / arr.length) * 100;
}

const out = {
  generadoEn: new Date().toISOString(),
  N,
  emergencias,
  comparacion: {},
};

for (const e of emergencias) {
  const b = resumen.base[e].rutas;
  const c = resumen.catas[e].rutas;
  out.comparacion[e] = {
    base: {
      rutas: b.length,
      fails: resumen.base[e].fails,
      duracionMediaMin: +mean(b, 'durationMinutes').toFixed(2),
      distanciaMediaM: Math.round(mean(b, 'distanceMeters')),
      pctRutasCruzandoElementosAlta: +pctRutasCruzando(b, 'crossesElementoAlta').toFixed(1),
      pctRutasCruzandoObraAlta: +pctRutasCruzando(b, 'crossesObraAlta').toFixed(1),
    },
    catas: {
      rutas: c.length,
      fails: resumen.catas[e].fails,
      duracionMediaMin: +mean(c, 'durationMinutes').toFixed(2),
      distanciaMediaM: Math.round(mean(c, 'distanceMeters')),
      pctRutasCruzandoElementosAlta: +pctRutasCruzando(c, 'crossesElementoAlta').toFixed(1),
      pctRutasCruzandoObraAlta: +pctRutasCruzando(c, 'crossesObraAlta').toFixed(1),
    },
  };
}

// ─── Salida consola ───────────────────────────────────────────────────────
for (const e of emergencias) {
  const r = out.comparacion[e];
  console.log(`\n▸ ${e.toUpperCase()}`);
  console.log(`  ${'Métrica'.padEnd(35)} ${'BASE'.padStart(10)} ${'CATAS'.padStart(10)} ${'Δ'.padStart(10)}`);
  const row = (label, a, b, suffix = '') => {
    const d = b - a;
    const sgn = d > 0 ? '+' : '';
    console.log(`  ${label.padEnd(35)} ${(a + suffix).padStart(10)} ${(b + suffix).padStart(10)} ${(sgn + d.toFixed(1) + suffix).padStart(10)}`);
  };
  row('Duración media (min)', r.base.duracionMediaMin, r.catas.duracionMediaMin);
  row('Distancia media (m)', r.base.distanciaMediaM, r.catas.distanciaMediaM);
  row('% rutas cruzan ElemAlta', r.base.pctRutasCruzandoElementosAlta, r.catas.pctRutasCruzandoElementosAlta, ' %');
  row('% rutas cruzan ObraVulAlta', r.base.pctRutasCruzandoObraAlta, r.catas.pctRutasCruzandoObraAlta, ' %');
  console.log(`  Rutas exitosas: BASE ${r.base.rutas}/${N} · CATAS ${r.catas.rutas}/${N}`);
}

// ─── Exportar ─────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(DATA, 'validacion_catastro.csv'), csvRows.join('\n'), 'utf8');
fs.writeFileSync(path.join(DATA, 'validacion_catastro.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('\n✔ CSV:   data/validacion_catastro.csv');
console.log('✔ JSON:  data/validacion_catastro.json');
console.log('═══════════════════════════════════════════════════════════════════');
