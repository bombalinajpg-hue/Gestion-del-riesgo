/**
 * Time-Dependent Dijkstra (TDD) — ruteo sensible al tiempo.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  ¿Qué problema resuelve?
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Dijkstra clásico asume que el costo de una arista es constante. Eso no
 * sirve para evacuación por avenida torrencial: un tramo cerca del cauce
 * puede ser transitable en t=0 min, peligroso en t=10 min y literalmente
 * bajo agua en t=20 min.
 *
 * TDD resuelve esto haciendo que el peso de cada arista sea una FUNCIÓN
 * del instante en que el evacuado la cruzaría:
 *
 *     costo(arista, t_entrada) → segundos  |  Infinity si intransitable
 *
 * El algoritmo explora el grafo llevando, para cada nodo, el tiempo
 * ACUMULADO desde el inicio del evento. Cuando decide si cruzar una arista,
 * pregunta: "si llego al inicio de esta arista en t=T_u, ¿el fenómeno ya
 * la cortó?". Si sí → Infinity, no la toma. Si no → la cruza y suma
 * el tiempo de tránsito al acumulado.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  FIFO property — por qué funciona esto
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * TDD conserva la optimalidad de Dijkstra si la función de costo cumple
 * la propiedad FIFO: salir después nunca te hace llegar antes. En nuestro
 * modelo la cumplimos porque la única "variación" del costo es pasar a
 * Infinity (vía cortada) — nunca un atajo que se abra con el tiempo.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  Alimentación con iRIC-Nays2DH
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * El documento de pasantía menciona que hay simulaciones de avenida
 * torrencial con iRIC-Nays2DH. Su salida es típicamente un raster con
 * "tiempo de llegada del frente de agua" para cada celda del terreno.
 *
 * El puente es `hazardTimingService.ts`: esa capa toma la arista, mira
 * qué celdas del raster toca, y devuelve el menor tiempo de llegada
 * del frente. Esa función es inyectable — si más adelante se tiene un
 * raster real, solo se reemplaza el provider.
 */

import type {
  Graph,
  GraphNode,
  LatLng,
  LocalRouteResult,
  RouteProfile,
} from '../types/graph';
import { MinHeap } from './MinHeap';

/**
 * Función que dado una arista del grafo y un instante de entrada (en segundos
 * desde el inicio del evento) devuelve el costo de cruzarla en segundos.
 *
 * Debe devolver Infinity si la arista es intransitable en ese instante.
 */
export type EdgeCostAtTime = (
  edgeIndex: number,
  entryTimeSeconds: number
) => number;

export interface TimeDependentOptions {
  profile: RouteProfile;
  /**
   * Instante (en segundos desde el inicio del evento) en que el evacuado
   * comienza su desplazamiento. Por defecto 0 = ahora.
   */
  departureTimeSeconds?: number;
  /**
   * Función inyectada que evalúa el costo de cada arista en función del
   * tiempo. La construye `hazardTimingService.ts`.
   */
  edgeCostAt: EdgeCostAtTime;
  /** Bloqueos permanentes (por reportes ciudadanos, zonas cerradas, etc.) */
  blockedEdgeIds?: Set<number>;
}

export function timeDependentDijkstra(
  graph: Graph,
  startNodeId: number,
  endNodeId: number,
  opts: TimeDependentOptions
): LocalRouteResult | null {
  const startIdx = graph.idToIndex[startNodeId];
  const endIdx = graph.idToIndex[endNodeId];
  if (startIdx === undefined || endIdx === undefined) return null;

  const n = graph.nodes.length;
  // "time" = tiempo TOTAL desde inicio del evento hasta llegar al nodo
  const time = new Float64Array(n).fill(Infinity);
  const prevNode = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);

  const t0 = opts.departureTimeSeconds ?? 0;
  time[startIdx] = t0;

  const heap = new MinHeap<number>();
  heap.push(startIdx, t0);

  while (!heap.isEmpty()) {
    const u = heap.pop()!;
    if (visited[u]) continue;
    visited[u] = 1;

    if (u === endIdx) break;

    for (const edgeIdx of graph.edgesOut[u]) {
      if (opts.blockedEdgeIds?.has(edgeIdx)) continue;

      const entryTime = time[u];
      const traversalCost = opts.edgeCostAt(edgeIdx, entryTime);
      if (!isFinite(traversalCost)) continue;

      const v = graph.idToIndex[graph.edges[edgeIdx].to];
      if (v === undefined) continue;
      const arrivalTime = entryTime + traversalCost;
      if (arrivalTime < time[v]) {
        time[v] = arrivalTime;
        prevNode[v] = u;
        prevEdge[v] = edgeIdx;
        heap.push(v, arrivalTime);
      }
    }
  }

  if (!isFinite(time[endIdx])) return null;

  // Reconstrucción
  const pathIdx: number[] = [];
  let cur = endIdx;
  while (cur !== -1) {
    pathIdx.push(cur);
    if (cur === startIdx) break;
    cur = prevNode[cur];
  }
  pathIdx.reverse();

  const path: GraphNode[] = pathIdx.map((i) => graph.nodes[i]);
  const polyline: LatLng[] = path.map((node) => ({ lat: node.lat, lng: node.lng }));

  let distanceMeters = 0;
  for (let i = 1; i < pathIdx.length; i++) {
    const edgeIdx = prevEdge[pathIdx[i]];
    if (edgeIdx >= 0) distanceMeters += graph.edges[edgeIdx].lengthMeters;
  }

  return {
    path,
    polyline,
    distanceMeters,
    durationSeconds: time[endIdx] - t0, // solo el tiempo de viaje real
    algorithm: 'time-dependent-dijkstra',
    affectedByReports: false,
    destinationNodeId: graph.nodes[endIdx].id,
  };
}
