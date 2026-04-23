/**
 * Benchmark del algoritmo de ruteo sobre el grafo vial de Santa Rosa.
 *
 * Uso:
 *   node scripts/benchmark-routing.js [N]
 *
 * Corre N rutas aleatorias (default 100) desde puntos aleatorios del grafo
 * hacia puntos de encuentro aleatorios. Mide:
 *   - tiempo de cálculo por ruta (ms)
 *   - tasa de éxito
 *   - duración de ruta (segundos caminando)
 *   - longitud de path (nodos)
 *
 * Exporta:
 *   - data/benchmark_routing.csv  — fila por iteración
 *   - data/benchmark_routing.json — resumen estadístico
 *
 * Cumple parcialmente el objetivo 5 del anteproyecto:
 * "validar funcionamiento mediante pruebas controladas evaluando eficacia,
 *  precisión y facilidad de uso".
 *
 * Al no poder cronometrar rutas en campo (equipo en Bogotá, área de estudio
 * en Santa Rosa de Cabal), esta prueba se ejecuta en laboratorio sobre el
 * grafo vial oficial OSM de la cabecera municipal. La validación empírica
 * con usuarios queda cubierta por el cuestionario SUS (ver docs/sus_form_content.md).
 */

const fs = require('fs');
const path = require('path');

// ─── Cargar datos ──────────────────────────────────────────────────────────
const graph = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/graph.json'), 'utf8'),
);
const destinos = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/destinos.json'), 'utf8'),
);

// ─── Indexado del grafo (mismo formato que graphService.ts) ────────────────
graph.idToIndex = Object.create(null);
for (let i = 0; i < graph.nodes.length; i++) {
  graph.idToIndex[graph.nodes[i].id] = i;
}
graph.edgesOut = Array.from({ length: graph.nodes.length }, () => []);
for (let i = 0; i < graph.edges.length; i++) {
  const fromIdx = graph.idToIndex[graph.edges[i].from];
  if (fromIdx !== undefined) graph.edgesOut[fromIdx].push(i);
}

// ─── MinHeap para Dijkstra ─────────────────────────────────────────────────
class MinHeap {
  constructor() { this.h = []; }
  push(item, priority) {
    this.h.push({ item, priority });
    this._up(this.h.length - 1);
  }
  pop() {
    if (this.h.length === 0) return null;
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
      [this.h[i], this.h[p]] = [this.h[p], this.h[i]];
      i = p;
    }
  }
  _down(i) {
    const n = this.h.length;
    while (true) {
      const l = i * 2 + 1;
      const r = l + 1;
      let s = i;
      if (l < n && this.h[l].priority < this.h[s].priority) s = l;
      if (r < n && this.h[r].priority < this.h[s].priority) s = r;
      if (s === i) break;
      [this.h[i], this.h[s]] = [this.h[s], this.h[i]];
      i = s;
    }
  }
}

// ─── Dijkstra ──────────────────────────────────────────────────────────────
function dijkstra(graph, startIdx, endIdx, profile = 'foot-walking') {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  dist[startIdx] = 0;
  const heap = new MinHeap();
  heap.push(startIdx, 0);
  while (heap.size > 0) {
    const { item: u, priority } = heap.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    if (u === endIdx) break;
    for (const edgeIdx of graph.edgesOut[u]) {
      const edge = graph.edges[edgeIdx];
      const v = graph.idToIndex[edge.to];
      if (v === undefined || closed[v]) continue;
      const alt = dist[u] + edge.costSeconds[profile];
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
        heap.push(v, alt);
      }
    }
  }
  if (dist[endIdx] === Infinity) return null;
  // reconstruir path
  let len = 0;
  let cur = endIdx;
  while (cur !== -1) { len++; cur = prev[cur]; }
  return { durationSeconds: dist[endIdx], pathLen: len };
}

// ─── Snap puntos de encuentro a nodos del grafo ────────────────────────────
const puntosEncuentro = destinos.filter((d) => d.tipo === 'punto_encuentro');
function snapToNearestNode(lat, lng) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const dLat = n.lat - lat;
    const dLng = n.lng - lng;
    const d2 = dLat * dLat + dLng * dLng;
    if (d2 < bestD) { bestD = d2; best = i; }
  }
  return best;
}
const destNodes = puntosEncuentro.map((d) => ({
  name: d.nombre,
  idx: snapToNearestNode(d.lat, d.lng),
}));

// ─── Benchmark ─────────────────────────────────────────────────────────────
const N = parseInt(process.argv[2], 10) || 100;
const SEED_START = 42;  // seed-ish para reproducibilidad vía índice

// Semilla simple (determinística) para reproducibilidad
let seedState = SEED_START;
function pseudoRandom() {
  // xorshift32
  seedState ^= seedState << 13; seedState >>>= 0;
  seedState ^= seedState >>> 17;
  seedState ^= seedState << 5;  seedState >>>= 0;
  return seedState / 0xFFFFFFFF;
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  BENCHMARK DE RUTEO — Dijkstra sobre grafo OSM');
console.log('  Área: Santa Rosa de Cabal (Risaralda)');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Grafo:         ${graph.nodes.length} nodos, ${graph.edges.length} aristas`);
console.log(`Destinos:      ${destNodes.length} puntos de encuentro`);
console.log(`Iteraciones:   ${N}`);
console.log(`Perfil:        foot-walking`);
console.log('-----------------------------------------------------------');

const results = [];
const t0Global = process.hrtime.bigint();

for (let i = 0; i < N; i++) {
  const startIdx = Math.floor(pseudoRandom() * graph.nodes.length);
  const dest = destNodes[Math.floor(pseudoRandom() * destNodes.length)];
  const t0 = process.hrtime.bigint();
  const r = dijkstra(graph, startIdx, dest.idx, 'foot-walking');
  const t1 = process.hrtime.bigint();
  const timeMs = Number(t1 - t0) / 1_000_000;
  results.push({
    iter: i + 1,
    startIdx,
    destName: dest.name,
    destIdx: dest.idx,
    success: r !== null,
    timeMs,
    durationSeconds: r?.durationSeconds ?? null,
    pathLen: r?.pathLen ?? null,
  });
}

const t1Global = process.hrtime.bigint();
const totalSec = Number(t1Global - t0Global) / 1e9;

// ─── Estadísticas ──────────────────────────────────────────────────────────
const times = results.map((r) => r.timeMs).sort((a, b) => a - b);
const succ = results.filter((r) => r.success);
const succRate = succ.length / results.length;
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const p = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
const durSec = succ.map((r) => r.durationSeconds).sort((a, b) => a - b);

const summary = {
  graph: {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    area: graph.meta.area,
    source: graph.meta.source,
  },
  benchmark: {
    iterations: N,
    profile: 'foot-walking',
    algorithm: 'dijkstra',
    totalElapsedSec: +totalSec.toFixed(3),
  },
  success: {
    rate: +succRate.toFixed(4),
    total: results.length,
    successful: succ.length,
    failed: results.length - succ.length,
  },
  latencyMs: {
    mean: +mean(times).toFixed(3),
    p50: +p(times, 0.5).toFixed(3),
    p90: +p(times, 0.9).toFixed(3),
    p95: +p(times, 0.95).toFixed(3),
    p99: +p(times, 0.99).toFixed(3),
    min: +times[0].toFixed(3),
    max: +times[times.length - 1].toFixed(3),
  },
  routeDurationSec: succ.length > 0 ? {
    meanMinutes: +(mean(durSec) / 60).toFixed(2),
    p50Minutes: +(p(durSec, 0.5) / 60).toFixed(2),
    p95Minutes: +(p(durSec, 0.95) / 60).toFixed(2),
  } : null,
};

// ─── Output ────────────────────────────────────────────────────────────────
console.log(`Éxito:              ${succ.length}/${N} (${(succRate * 100).toFixed(1)} %)`);
console.log('');
console.log('Latencia del algoritmo (tiempo de cálculo en ms):');
console.log(`  Media:            ${summary.latencyMs.mean} ms`);
console.log(`  Mediana (p50):    ${summary.latencyMs.p50} ms`);
console.log(`  Percentil 90:     ${summary.latencyMs.p90} ms`);
console.log(`  Percentil 95:     ${summary.latencyMs.p95} ms`);
console.log(`  Percentil 99:     ${summary.latencyMs.p99} ms`);
console.log(`  Máximo:           ${summary.latencyMs.max} ms`);
console.log(`  Mínimo:           ${summary.latencyMs.min} ms`);
if (summary.routeDurationSec) {
  console.log('');
  console.log('Duración de rutas generadas (minutos caminando):');
  console.log(`  Media:            ${summary.routeDurationSec.meanMinutes} min`);
  console.log(`  Mediana:          ${summary.routeDurationSec.p50Minutes} min`);
  console.log(`  Percentil 95:     ${summary.routeDurationSec.p95Minutes} min`);
}
console.log('-----------------------------------------------------------');
console.log(`Tiempo total del benchmark: ${totalSec.toFixed(2)} s`);

// ─── Exportar CSV + JSON ───────────────────────────────────────────────────
const csvPath = path.join(__dirname, '../data/benchmark_routing.csv');
const jsonPath = path.join(__dirname, '../data/benchmark_routing.json');

const csvLines = [
  'iter,startIdx,destName,destIdx,success,timeMs,durationSeconds,pathLen',
  ...results.map((r) =>
    [
      r.iter,
      r.startIdx,
      `"${r.destName.replace(/"/g, '""')}"`,
      r.destIdx,
      r.success,
      r.timeMs.toFixed(4),
      r.durationSeconds != null ? r.durationSeconds.toFixed(2) : '',
      r.pathLen ?? '',
    ].join(','),
  ),
];
fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');

console.log('');
console.log(`CSV detallado  → ${path.relative(process.cwd(), csvPath)}`);
console.log(`Resumen JSON   → ${path.relative(process.cwd(), jsonPath)}`);
console.log('═══════════════════════════════════════════════════════════');
