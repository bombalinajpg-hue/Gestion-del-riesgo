/**
 * Fachada del motor de ruteo local — reemplazo drop-in de `getRoute`
 * de openRouteService.ts.
 *
 * El objetivo es que `MapViewContainer.tsx` pueda cambiar una sola línea:
 *
 *   - import { getRoute } from '@/src/services/openRouteService';
 *   + import { computeRoute } from '@/src/services/localRouter';
 *
 * ...y obtener la misma funcionalidad PERO con el algoritmo corriendo
 * localmente, con los bloqueos ciudadanos aplicados, y sin depender de
 * una API key ni de conexión a internet.
 *
 * Como transición suave, también se exporta `computeRouteWithFallback`
 * que intenta local primero y, si falla por cualquier razón (grafo no
 * cargado, destino fuera de bbox, etc.), cae a ORS como respaldo.
 */

import type {
  EmergencyType,
  LocalRouteResult,
  RouteProfile,
} from '../types/graph';
import { dijkstra } from '../algorithms/dijkstra';
import { aStar } from '../algorithms/aStar';
import { timeDependentDijkstra } from '../algorithms/timeDependentDijkstra';
import { getGraph } from './graphService';
import { snapToNearestNode } from '../utils/snapToGraph';
import { DEFAULT_HAZARD_PENALTIES } from './isochroneService';
import {
  makeCategoryBasedEdgeCost,
  makeRasterBasedEdgeCost,
  type RasterArrivalMap,
} from './hazardTimingService';
import { getAllBlockedEdgeIds } from './reportsService';

export type RouteAlgorithm = 'dijkstra' | 'a-star' | 'time-dependent';

export interface ComputeRouteParams {
  /** Inicio y fin como coordenadas arbitrarias — snap al grafo es automático */
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  profile: RouteProfile;
  emergencyType: EmergencyType;
  algorithm?: RouteAlgorithm; // default: 'a-star'
  /**
   * Solo para 'time-dependent': mapa de tiempos de llegada del frente.
   * Si no se pasa, cae al modo categoría usando edge.hazardByType.
   */
  arrivalMap?: RasterArrivalMap;
  /** Para 'time-dependent': instante de partida desde el inicio del evento */
  departureTimeSeconds?: number;
  /** Destinos múltiples, para modo "closest" */
  alternativeEnds?: { lat: number; lng: number; name: string }[];
}

/**
 * Ejecuta el algoritmo elegido y devuelve una ruta — o null si no hay
 * camino (origen/destino fuera del grafo o completamente aislados).
 */
export async function computeRoute(
  params: ComputeRouteParams
): Promise<LocalRouteResult | null> {
  const graph = getGraph();

  const startIdx = snapToNearestNode(params.start.lat, params.start.lng, graph);
  if (startIdx === null) return null;
  const startNodeId = graph.nodes[startIdx].id;

  // Cargar bloqueos ciudadanos desde el servicio de reportes.
  // Esto es lo que materializa el objetivo 4 del anteproyecto:
  // personalización por tipo de emergencia → solo las alertas
  // pertinentes al fenómeno activo penalizan aristas.
  const blockedEdgeIds = await getAllBlockedEdgeIds(graph, params.emergencyType);

  // Si hay destinos alternativos, elige el óptimo (modo "closest").
  // Por simplicidad elegimos el más cercano por Haversine y lo ruteamos.
  // Si quieres "verdadero óptimo" corre Dijkstra multi-fuente desde start.
  const endCandidates = params.alternativeEnds?.length
    ? params.alternativeEnds
    : [{ lat: params.end.lat, lng: params.end.lng, name: 'Destino' }];

  const algorithm = params.algorithm ?? 'a-star';
  const hazardPenaltyOpts =
    params.emergencyType !== 'ninguna'
      ? { ...DEFAULT_HAZARD_PENALTIES[params.emergencyType], emergencyType: params.emergencyType }
      : undefined;
  // Factores catastrales (4A + 4B): solo se activan cuando hay emergencia.
  // Los multiplicadores específicos los define catastroCostFactors con
  // defaults conservadores (tope 4×). Solo afectan al perfil peatonal.
  const catastroPenaltyOpts =
    params.emergencyType !== 'ninguna'
      ? { emergencyType: params.emergencyType }
      : undefined;

  // Corre el algoritmo elegido contra todos los candidatos y devuelve el
  // mejor (menor duración). Se usa dos veces si hay fallback TDD → A*.
  const runOverCandidates = (algo: RouteAlgorithm): LocalRouteResult | null => {
    let best: LocalRouteResult | null = null;
    for (const ec of endCandidates) {
      const endIdx = snapToNearestNode(ec.lat, ec.lng, graph);
      if (endIdx === null) continue;
      const endNodeId = graph.nodes[endIdx].id;
      let result: LocalRouteResult | null = null;

      if (algo === 'dijkstra') {
        result = dijkstra(graph, startNodeId, endNodeId, {
          profile: params.profile,
          blockedEdgeIds,
          hazardPenalty: hazardPenaltyOpts,
          catastroPenalty: catastroPenaltyOpts,
        });
      } else if (algo === 'a-star') {
        result = aStar(graph, startNodeId, endNodeId, {
          profile: params.profile,
          blockedEdgeIds,
          hazardPenalty: hazardPenaltyOpts,
          catastroPenalty: catastroPenaltyOpts,
        });
      } else if (algo === 'time-dependent') {
        if (params.emergencyType === 'ninguna') {
          // TDD sin amenaza ≡ Dijkstra — caemos a A* por eficiencia
          result = aStar(graph, startNodeId, endNodeId, {
            profile: params.profile,
            blockedEdgeIds,
          });
        } else {
          const edgeCostAt = params.arrivalMap
            ? makeRasterBasedEdgeCost(graph, {
                profile: params.profile,
                arrivalMap: params.arrivalMap,
              })
            : makeCategoryBasedEdgeCost(graph, {
                profile: params.profile,
                emergencyType: params.emergencyType,
              });
          result = timeDependentDijkstra(graph, startNodeId, endNodeId, {
            profile: params.profile,
            departureTimeSeconds: params.departureTimeSeconds ?? 0,
            edgeCostAt,
            blockedEdgeIds,
            catastroPenalty: catastroPenaltyOpts,
          });
        }
      }

      if (result) {
        result.affectedByReports = blockedEdgeIds.size > 0;
        result.destinationName = ec.name;
        if (!best || result.durationSeconds < best.durationSeconds) {
          best = result;
        }
      }
    }
    return best;
  };

  let bestResult = runOverCandidates(algorithm);

  // Fallback "la menos mala": TDD puede devolver null si el frente alcanza
  // todas las rutas antes que el evacuado. En ese caso relanzamos con A*
  // + penalización de amenaza y marcamos el resultado como riesgoso. La
  // UI debe advertir al usuario que no hay camino seguro garantizado.
  if (
    bestResult === null &&
    algorithm === 'time-dependent' &&
    params.emergencyType !== 'ninguna'
  ) {
    bestResult = runOverCandidates('a-star');
    if (bestResult) {
      bestResult.isRiskyFallback = true;
    }
  }

  return bestResult;
}

/**
 * Wrapper que intenta local primero y, si falla o devuelve null, cae al
 * servicio ORS existente. Útil durante la transición — no hace falta
 * borrar ni modificar `openRouteService.ts`.
 *
 * Uso sugerido: activa este wrapper desde un flag en el Settings de la
 * app para que los usuarios puedan alternar entre motor local y ORS.
 */
export async function computeRouteWithFallback(
  params: ComputeRouteParams,
  orsFallback: () => Promise<LocalRouteResult | null>
): Promise<LocalRouteResult | null> {
  try {
    const local = await computeRoute(params);
    if (local) return local;
  } catch (err) {
    console.warn('[localRouter] Fallo motor local, fallback a ORS:', err);
  }
  return orsFallback();
}
