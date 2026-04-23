/**
 * A* — búsqueda informada para ruteo punto-a-punto.
 *
 * Diferencia con Dijkstra: A* usa una heurística h(n) que estima el costo
 * restante desde n hasta el destino. Si h es admisible (nunca sobreestima)
 * y consistente, A* encuentra el óptimo igual que Dijkstra pero visita
 * muchos menos nodos.
 *
 * Heurística: distancia Haversine al destino, dividida por la velocidad
 * máxima del perfil. Es admisible porque la distancia en línea recta
 * es una cota inferior del tiempo de viaje real por vía.
 *
 * Cuándo usar A* vs Dijkstra:
 *  - A* es mejor para ruteo 1-a-1 punto-a-punto (la app en modo normal).
 *  - Dijkstra es mejor cuando necesitas distancias a MUCHOS destinos
 *    (p.ej. para el modo "destino más cercano" o para isócronas).
 *
 * En este proyecto A* se usa cuando el usuario ya eligió destino;
 * Dijkstra multi-fuente se usa para precomputar las isócronas.
 */

import type { Graph, LocalRouteResult, RouteProfile } from '../types/graph';
import { fastHaversineMeters } from '../utils/haversine';
import { buildRouteResult, type DijkstraOptions } from './dijkstra';
import { MinHeap } from './MinHeap';
import { catastroEdgeMultiplier } from './catastroCostFactors';

/**
 * Velocidad MÁXIMA posible por perfil, en m/s. Usada SOLO para la
 * heurística (nunca para el costo real, que viene del grafo).
 *
 * Para que A* sea admisible, max_speed debe ser ≥ velocidad real máxima
 * que el usuario pueda alcanzar. Si se subestima, la heurística
 * sobrestima el tiempo y A* puede perder el óptimo.
 *
 * En evacuación real los peatones corren — hasta ~4 m/s (14 km/h) en
 * pánico. Por eso el valor aquí cubre "correr", no solo caminar. Antes
 * estaba en 1.8 m/s, lo que violaba admisibilidad cuando el usuario
 * corría.
 */
const MAX_SPEED_MPS: Record<RouteProfile, number> = {
  'foot-walking': 4.0,    // ~14 km/h cubre correr en pánico
  'cycling-regular': 8.0, // ~29 km/h cubre pedaleo enérgico
  'driving-car': 22.0,    // ~79 km/h cubre urbano rápido
};

export function aStar(
  graph: Graph,
  startNodeId: number,
  endNodeId: number,
  opts: DijkstraOptions
): LocalRouteResult | null {
  const startIdx = graph.idToIndex[startNodeId];
  const endIdx = graph.idToIndex[endNodeId];
  if (startIdx === undefined || endIdx === undefined) return null;

  const n = graph.nodes.length;
  const gScore = new Float64Array(n).fill(Infinity);
  const prevNode = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  gScore[startIdx] = 0;

  const endNode = graph.nodes[endIdx];
  const maxSpeed = MAX_SPEED_MPS[opts.profile];
  const heuristic = (idx: number): number => {
    const node = graph.nodes[idx];
    const dMeters = fastHaversineMeters(node.lat, node.lng, endNode.lat, endNode.lng);
    return dMeters / maxSpeed;
  };

  const heap = new MinHeap<number>();
  heap.push(startIdx, heuristic(startIdx));

  while (!heap.isEmpty()) {
    const u = heap.pop()!;
    if (closed[u]) continue;
    closed[u] = 1;

    if (u === endIdx) break;

    for (const edgeIdx of graph.edgesOut[u]) {
      if (opts.blockedEdgeIds?.has(edgeIdx)) continue;

      const edge = graph.edges[edgeIdx];
      let weight = edge.costSeconds[opts.profile];

      if (opts.hazardPenalty && edge.hazardByType) {
        const cat = edge.hazardByType[opts.hazardPenalty.emergencyType];
        if (cat) {
          const mult = opts.hazardPenalty[cat];
          if (mult === undefined) {
            // no penaliza
          } else if (!isFinite(mult)) {
            continue;
          } else {
            weight *= mult;
          }
        }
      }

      // Factores catastrales — vulnerabilidad vial + riesgo predial cercano.
      if (opts.catastroPenalty) {
        weight *= catastroEdgeMultiplier(edge, opts.profile, opts.catastroPenalty);
      }

      const v = graph.idToIndex[edge.to];
      if (v === undefined) continue;
      const tentative = gScore[u] + weight;
      if (tentative < gScore[v]) {
        gScore[v] = tentative;
        prevNode[v] = u;
        prevEdge[v] = edgeIdx;
        heap.push(v, tentative + heuristic(v));
      }
    }
  }

  if (!isFinite(gScore[endIdx])) return null;

  return buildRouteResult(graph, startIdx, endIdx, gScore, prevNode, prevEdge, opts.profile, 'a-star');
}
