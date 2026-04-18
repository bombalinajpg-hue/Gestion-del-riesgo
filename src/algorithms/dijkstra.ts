/**
 * Dijkstra de camino mínimo — implementación local que reemplaza/complementa
 * la llamada a OpenRouteService.
 *
 * Diferencia clave vs. ORS: aquí el algoritmo corre DENTRO del dispositivo,
 * sobre el grafo que se bundlea con la app. Ventajas:
 *  1. Funciona offline (crítico en emergencia real, cuando las antenas caen).
 *  2. Es el mismo algoritmo que cita el documento de pasantía — ya no es
 *     una "caja negra" delegada a un tercero. Esto cierra la brecha entre
 *     lo que declara la tesis y lo que hace el código.
 *  3. Permite personalización fina: bloqueos ciudadanos, zonas de amenaza
 *     con penalización variable, etc. — cosas que ORS no acepta con
 *     esa granularidad.
 *
 * Complejidad: O((n + m) log n) con el MinHeap, donde n = nodos, m = aristas.
 * Para Santa Rosa (~3k nodos, ~7k aristas) el tiempo es de ~20–80 ms en
 * un teléfono gama media.
 */

import type { Graph, GraphNode, LatLng, LocalRouteResult, RouteProfile } from '../types/graph';
import { MinHeap } from './MinHeap';

export interface DijkstraOptions {
  profile: RouteProfile;
  /**
   * Conjunto de IDs de arista a tratar como intransitables.
   * Se usa para inyectar bloqueos reportados por ciudadanos.
   */
  blockedEdgeIds?: Set<number>;
  /**
   * Multiplicador de costo por amenaza. Por ejemplo, si una arista toca
   * zona de amenaza 'Alta' y el multiplicador es 8, cruzarla cuesta 8×
   * su tiempo nominal. Infinity = intransitable.
   *
   * Este es el mecanismo que reemplaza el hack "avoid_polygons" de ORS
   * con algo matemáticamente limpio y con granularidad por categoría.
   */
  hazardPenalty?: {
    Baja?: number;
    Media?: number;
    Alta?: number;
    /** Clave para saber qué capa de amenaza mirar en edge.hazardByType */
    emergencyType: Exclude<import('../types/graph').EmergencyType, 'ninguna'>;
  };
}

/**
 * Calcula la ruta más corta (en segundos) entre dos nodos del grafo.
 *
 * @returns null si el destino es inalcanzable desde el origen.
 */
export function dijkstra(
  graph: Graph,
  startNodeId: number,
  endNodeId: number,
  opts: DijkstraOptions
): LocalRouteResult | null {
  const startIdx = graph.idToIndex[startNodeId];
  const endIdx = graph.idToIndex[endNodeId];
  if (startIdx === undefined || endIdx === undefined) return null;

  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prevNode = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);

  dist[startIdx] = 0;

  const heap = new MinHeap<number>();
  heap.push(startIdx, 0);

  while (!heap.isEmpty()) {
    const u = heap.pop()!;
    if (visited[u]) continue;
    visited[u] = 1;

    // Early exit: llegamos al destino, el camino ya es óptimo.
    if (u === endIdx) break;

    for (const edgeIdx of graph.edgesOut[u]) {
      if (opts.blockedEdgeIds?.has(edgeIdx)) continue;

      const edge = graph.edges[edgeIdx];
      let weight = edge.costSeconds[opts.profile];

      // Penalización por amenaza — reemplazo elegante de avoid_polygons
      if (opts.hazardPenalty && edge.hazardByType) {
        const cat = edge.hazardByType[opts.hazardPenalty.emergencyType];
        if (cat) {
          const mult = opts.hazardPenalty[cat];
          if (mult === undefined) {
            // categoría no configurada → no penaliza
          } else if (!isFinite(mult)) {
            continue; // intransitable
          } else {
            weight *= mult;
          }
        }
      }

      const v = graph.idToIndex[edge.to];
      if (v === undefined) continue;
      const alt = dist[u] + weight;
      if (alt < dist[v]) {
        dist[v] = alt;
        prevNode[v] = u;
        prevEdge[v] = edgeIdx;
        heap.push(v, alt);
      }
    }
  }

  if (!isFinite(dist[endIdx])) return null;

  return buildRouteResult(graph, startIdx, endIdx, dist, prevNode, prevEdge, opts.profile, 'dijkstra');
}

/**
 * Reconstruye la ruta desde los arrays de trazabilidad que dejan
 * Dijkstra o A* al terminar. Se extrae en función aparte porque
 * es idéntica en ambos algoritmos.
 */
export function buildRouteResult(
  graph: Graph,
  startIdx: number,
  endIdx: number,
  dist: Float64Array,
  prevNode: Int32Array,
  prevEdge: Int32Array,
  profile: RouteProfile,
  algorithm: LocalRouteResult['algorithm']
): LocalRouteResult {
  // Reconstruir de atrás hacia adelante
  const pathIndices: number[] = [];
  let cur = endIdx;
  while (cur !== -1) {
    pathIndices.push(cur);
    if (cur === startIdx) break;
    cur = prevNode[cur];
  }
  pathIndices.reverse();

  const path: GraphNode[] = pathIndices.map((i) => graph.nodes[i]);
  const polyline: LatLng[] = path.map((node) => ({ lat: node.lat, lng: node.lng }));

  // Distancia en metros — sumar las aristas usadas (no la línea recta entre nodos,
  // que ignoraría curvas de la vía; en nuestro grafo simplificamos asumiendo
  // nodos solo en intersecciones — ver build-graph.js)
  let distanceMeters = 0;
  for (let i = 1; i < pathIndices.length; i++) {
    const edgeIdx = prevEdge[pathIndices[i]];
    if (edgeIdx >= 0) {
      distanceMeters += graph.edges[edgeIdx].lengthMeters;
    }
  }

  return {
    path,
    polyline,
    distanceMeters,
    durationSeconds: dist[endIdx],
    algorithm,
    affectedByReports: false, // lo setea el caller si corresponde
    destinationNodeId: graph.nodes[endIdx].id,
  };
}
