/**
 * Servicio de timing de amenaza — construye la función `edgeCostAt(edge, t)`
 * que el Time-Dependent Dijkstra consume.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  Dos modos de operación
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * MODO A — BASADO EN CATEGORÍA (lo que tienes hoy)
 *   Usa las categorías 'Baja'|'Media'|'Alta' ya presentes en las aristas
 *   (inyectadas por build-graph.js al intersectar con tus GeoJSON). Asigna
 *   un "tiempo de llegada del frente" por categoría — más conservador que
 *   la realidad pero suficiente para validar el algoritmo.
 *
 * MODO B — BASADO EN RÁSTER iRIC-Nays2DH (cuando tengas los datos)
 *   Acepta un mapa `nodeId → tiempoLlegadaFrente` que puedes exportar
 *   desde iRIC (cada celda del modelo hidráulico tiene un "wet time" —
 *   el instante en que el agua llega). El raster se reproyecta a los
 *   nodos del grafo y se inyecta aquí.
 *
 * Ambos modos producen la MISMA interfaz: una función `edgeCostAt` que
 * TDD puede consumir. Así el algoritmo no cambia cuando evolucionas
 * el modelo de datos — solo el provider.
 */

import type {
  EmergencyType,
  Graph,
  GraphEdge,
  HazardCategory,
  RouteProfile,
} from '../types/graph';
import type { EdgeCostAtTime } from '../algorithms/timeDependentDijkstra';

// ─── MODO A — POR CATEGORÍA ─────────────────────────────────────────────────

/**
 * Tabla de tiempos de llegada del frente por categoría, en segundos
 * desde el inicio del evento. Documentable y ajustable:
 *
 *   Alta  → 300 s (5 min)   — la vía se corta rápido
 *   Media → 900 s (15 min)  — hay ventana operativa
 *   Baja  → 1800 s (30 min) — holgura considerable
 *
 * Estos valores deben venir, idealmente, de los estudios de ALDESARROLLO.
 * Aquí damos unos por defecto razonables para avenida torrencial.
 */
export const DEFAULT_FRONT_ARRIVAL_SECONDS: Record<
  Exclude<EmergencyType, 'ninguna'>,
  Record<HazardCategory, number>
> = {
  avenida_torrencial: { Alta: 300, Media: 900, Baja: 1800 },
  inundacion: { Alta: 600, Media: 1800, Baja: 3600 }, // más lento que AT
  movimiento_en_masa: { Alta: 180, Media: 900, Baja: 2400 }, // deslizamiento muy rápido
};

export interface CategoryBasedProviderParams {
  emergencyType: Exclude<EmergencyType, 'ninguna'>;
  profile: RouteProfile;
  /** Sobrescribe los tiempos por defecto si lo deseas */
  frontArrivalOverride?: Partial<Record<HazardCategory, number>>;
  /**
   * Margen de seguridad en segundos. Si el evacuado entra a la arista
   * y calcula que sale faltando menos de este margen para el frente,
   * la arista se considera cerrada. Por defecto 30 s.
   */
  safetyMarginSeconds?: number;
}

/**
 * Provider del MODO A. Produce `edgeCostAt` a partir de las categorías
 * que build-graph.js ya dejó en las aristas.
 */
export function makeCategoryBasedEdgeCost(
  graph: Graph,
  params: CategoryBasedProviderParams
): EdgeCostAtTime {
  const base = DEFAULT_FRONT_ARRIVAL_SECONDS[params.emergencyType];
  const arrivalByCat: Record<HazardCategory, number> = {
    Alta: params.frontArrivalOverride?.Alta ?? base.Alta,
    Media: params.frontArrivalOverride?.Media ?? base.Media,
    Baja: params.frontArrivalOverride?.Baja ?? base.Baja,
  };
  const margin = params.safetyMarginSeconds ?? 30;
  const emergencyKey = params.emergencyType;
  const profileKey = params.profile;

  return (edgeIndex: number, entryTimeSeconds: number): number => {
    const edge: GraphEdge = graph.edges[edgeIndex];
    const nominalCost = edge.costSeconds[profileKey];
    const cat = edge.hazardByType?.[emergencyKey];
    if (!cat) return nominalCost; // arista fuera de zona de amenaza — sin cambios

    const frontArrival = arrivalByCat[cat];
    const exitTime = entryTimeSeconds + nominalCost;

    // Si el evacuado sale ANTES de que llegue el frente (con margen), pasa.
    if (exitTime + margin <= frontArrival) {
      return nominalCost;
    }
    // Si todavía hay una ventana muy estrecha, penalizamos pero no cortamos.
    // Esto modela que la vía empieza a ser peligrosa: barro, debris, agua baja.
    if (entryTimeSeconds < frontArrival) {
      // Cuanto más cerca del frente, más caro (factor 2× a 10×)
      const remaining = frontArrival - entryTimeSeconds;
      const tightness = Math.max(0.1, remaining / (frontArrival || 1));
      const penalty = Math.min(10, 2 / tightness);
      return nominalCost * penalty;
    }
    // Frente ya pasó — intransitable
    return Infinity;
  };
}

// ─── MODO B — POR RÁSTER iRIC-Nays2DH ───────────────────────────────────────

/**
 * Mapa nodo → tiempo de llegada del frente (segundos desde inicio del evento).
 * Se construye offline por el equipo, reproyectando el raster `wet_time`
 * de iRIC sobre los nodos del grafo. Nodos fuera del alcance del modelo
 * tienen `undefined` o `Infinity`.
 */
export type RasterArrivalMap = Map<number, number>; // nodeId → segundos

export interface RasterBasedProviderParams {
  profile: RouteProfile;
  arrivalMap: RasterArrivalMap;
  safetyMarginSeconds?: number;
}

/**
 * Provider del MODO B. En cada arista toma el tiempo de llegada MÍNIMO
 * entre sus dos extremos — modela que basta con que un extremo esté
 * inundado para que la arista sea insegura.
 */
export function makeRasterBasedEdgeCost(
  graph: Graph,
  params: RasterBasedProviderParams
): EdgeCostAtTime {
  const margin = params.safetyMarginSeconds ?? 30;
  const profileKey = params.profile;

  return (edgeIndex: number, entryTimeSeconds: number): number => {
    const edge = graph.edges[edgeIndex];
    const nominalCost = edge.costSeconds[profileKey];

    const aFront = params.arrivalMap.get(edge.from);
    const bFront = params.arrivalMap.get(edge.to);
    const minFront =
      aFront !== undefined && bFront !== undefined
        ? Math.min(aFront, bFront)
        : (aFront ?? bFront);

    if (minFront === undefined) return nominalCost;

    const exitTime = entryTimeSeconds + nominalCost;
    if (exitTime + margin <= minFront) return nominalCost;
    if (entryTimeSeconds < minFront) {
      const remaining = minFront - entryTimeSeconds;
      const tightness = Math.max(0.1, remaining / minFront);
      const penalty = Math.min(10, 2 / tightness);
      return nominalCost * penalty;
    }
    return Infinity;
  };
}

// ─── Helper para parsear CSV/JSON exportado de iRIC ─────────────────────────

/**
 * Parsea un JSON simple `{ "nodeId": wetTimeSeconds, ... }` a RasterArrivalMap.
 * Formato esperado del pipeline offline iRIC → reproyección → JSON.
 */
export function parseArrivalJson(
  json: Record<string, number>
): RasterArrivalMap {
  const map: RasterArrivalMap = new Map();
  for (const [k, v] of Object.entries(json)) {
    const id = Number(k);
    if (!Number.isNaN(id) && typeof v === 'number' && isFinite(v)) {
      map.set(id, v);
    }
  }
  return map;
}
