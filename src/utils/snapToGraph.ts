/**
 * Snap de un punto arbitrario (lat/lng) al nodo más cercano del grafo.
 *
 * VERSIÓN OPTIMIZADA: indexación espacial tipo bucket grid para
 * reducir la búsqueda de O(n) a O(1) amortizado.
 *
 * Cómo funciona:
 *   - Al cargar el grafo por primera vez, dividimos el bbox en celdas
 *     de ~100m × 100m. En cada celda guardamos los índices de nodos
 *     que caen en ella.
 *   - Al hacer snap de un punto, solo buscamos en la celda del punto
 *     + sus 8 vecinas. Típicamente son <30 nodos por celda vs miles
 *     en el grafo completo.
 *
 * Si el punto está fuera del bbox del grafo, caemos a la búsqueda
 * lineal para asegurar resultado.
 */

import type { Graph } from '../types/graph';

// ─── Cache del índice espacial ─────────────────────────────────────────────
// Se reconstruye si cambia la referencia del grafo (por ejemplo si se
// recarga desde otra fuente).

interface SpatialIndex {
  graphRef: Graph;
  cellSize: number; // en grados
  cells: Map<string, number[]>; // clave "row,col" → índices de nodo
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

// Haversine rápida — suficientemente precisa para snap a escala urbana
function fastDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * 111_000;
  const dLng = (bLng - aLng) * 111_000 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Devuelve el índice del nodo más cercano en el grafo. `null` si el
 * grafo está vacío (no debería ocurrir en uso normal).
 */
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

  // Buscamos en celda + vecinas, expandiendo radio si no hay candidatos.
  for (let ring = 0; ring <= 3; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        // Solo las celdas del ring actual (para no repetir las internas)
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
    // Si ya encontramos algo en este anillo, no hace falta expandir más
    if (bestNode !== null && ring >= 1) return bestNode;
  }

  // Fallback lineal — punto muy lejos del grafo
  if (bestNode === null) {
    for (let i = 0; i < graph.nodes.length; i++) {
      const n = graph.nodes[i];
      const d = fastDistance(lat, lng, n.lat, n.lng);
      if (d < bestDist) { bestDist = d; bestNode = i; }
    }
  }
  return bestNode;
}

/** Invalida el índice manualmente (ej. si se reemplaza el grafo en runtime) */
export function invalidateSnapIndex(): void {
  cached = null;
}
