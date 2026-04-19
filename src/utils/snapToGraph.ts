/**
 * Snap de un punto arbitrario (lat/lng) al nodo más cercano del grafo.
 *
 * Indexación espacial tipo bucket grid: búsqueda O(1) amortizada.
 * Al cargar el grafo por primera vez, dividimos el bbox en celdas
 * de ~100m × 100m. En cada celda guardamos los índices de nodos
 * que caen en ella. Al hacer snap solo buscamos en la celda del
 * punto + vecinas.
 */

import type { Graph } from '../types/graph';

interface SpatialIndex {
  graphRef: Graph;
  cellSize: number;
  cells: Map<string, number[]>;
  minLat: number;
  minLng: number;
  rows: number;
  cols: number;
}

let cached: SpatialIndex | null = null;

/** ~100 metros en grados. Aproximación válida a 5°N. */
const CELL_SIZE_DEG = 100 / 111_000;

function buildIndex(graph: Graph): SpatialIndex {
  const { minLat, maxLat, minLng, maxLng } = graph.bbox;
  const cellSize = CELL_SIZE_DEG;
  const rows = Math.ceil((maxLat - minLat) / cellSize) + 1;
  const cols = Math.ceil((maxLng - minLng) / cellSize) + 1;
  const cells = new Map<string, number[]>();

  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const r = Math.floor((n.lat - minLat) / cellSize);
    const c = Math.floor((n.lng - minLng) / cellSize);
    const key = `${r},${c}`;
    let arr = cells.get(key);
    if (!arr) { arr = []; cells.set(key, arr); }
    arr.push(i);
  }

  return { graphRef: graph, cellSize, cells, minLat, minLng, rows, cols };
}

function getOrBuildIndex(graph: Graph): SpatialIndex {
  if (cached && cached.graphRef === graph) return cached;
  cached = buildIndex(graph);
  return cached;
}

function fastDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * 111_000;
  const dLng = (bLng - aLng) * 111_000 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function snapToNearestNode(
  lat: number,
  lng: number,
  graph: Graph,
): number | null {
  if (graph.nodes.length === 0) return null;

  const idx = getOrBuildIndex(graph);
  const { cellSize, cells, minLat, minLng } = idx;

  const r = Math.floor((lat - minLat) / cellSize);
  const c = Math.floor((lng - minLng) / cellSize);

  let bestNode: number | null = null;
  let bestDist = Infinity;

  for (let ring = 0; ring <= 3; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (ring > 0 && Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
        const key = `${r + dr},${c + dc}`;
        const bucket = cells.get(key);
        if (!bucket) continue;
        for (const nodeIdx of bucket) {
          const n = graph.nodes[nodeIdx];
          const d = fastDistance(lat, lng, n.lat, n.lng);
          if (d < bestDist) { bestDist = d; bestNode = nodeIdx; }
        }
      }
    }
    if (bestNode !== null && ring >= 1) return bestNode;
  }

  if (bestNode === null) {
    for (let i = 0; i < graph.nodes.length; i++) {
      const n = graph.nodes[i];
      const d = fastDistance(lat, lng, n.lat, n.lng);
      if (d < bestDist) { bestDist = d; bestNode = i; }
    }
  }
  return bestNode;
}

export function invalidateSnapIndex(): void {
  cached = null;
}

/**
 * Pre-construye el índice espacial. Llamar una vez tras `loadGraph`
 * para que el primer `snapToNearestNode` no pague el costo de construcción.
 */
export function prewarmSnapIndex(graph: Graph): void {
  getOrBuildIndex(graph);
}