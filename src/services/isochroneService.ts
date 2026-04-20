/**
 * Servicio de isócronas de evacuación — la joya del proyecto desde el
 * punto de vista de Ingeniería Catastral.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  Flujo de uso
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   1. Al arrancar la app (o al cambiar de tipo de emergencia),
 *      `precomputeIsochrones()` corre Dijkstra multi-fuente desde todos los
 *      puntos de encuentro y guarda la tabla en AsyncStorage.
 *
 *   2. En cualquier momento, `queryFromLocation(lat, lng)` responde en O(1):
 *          • ¿Cuál es mi punto de encuentro óptimo?
 *          • ¿Cuánto tardo en llegar?
 *
 *   3. `exportToGeoJSON()` genera el archivo cartográfico que se abre
 *      en QGIS para producir el mapa de isócronas — un entregable
 *      tangible para el informe final de pasantía.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  Cache
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * La tabla se indexa por (profile, emergencyType). Hay 3 perfiles × 4 tipos
 * de emergencia (incluida "ninguna") = 12 tablas posibles. En la práctica
 * se usan ~4: peatón × (inundación, movimiento_en_masa, avenida_torrencial,
 * ninguna). Cada tabla pesa ~50 KB. Total ~200 KB en AsyncStorage — trivial.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  EmergencyType,
  Graph,
  IsochroneTable,
  RouteProfile,
} from '../types/graph';
import {
  bandIsochrones,
  multiSourceDijkstra,
  shortHash,
  type IsochroneBand,
} from '../algorithms/multiSourceDijkstra';
import { getGraph } from './graphService';
import { snapToNearestNode } from '../utils/snapToGraph';
import { serializeByKey } from '../utils/asyncQueue';

const CACHE_PREFIX = 'isochrone:';

function cacheKey(profile: RouteProfile, emergencyType: EmergencyType): string {
  return `${CACHE_PREFIX}${profile}:${emergencyType}`;
}

// ─── Penalizaciones de amenaza por tipo de emergencia ──────────────────────
// Estos valores son la "receta" del proyecto. Son documentables:
//   Alta  → intransitable (Infinity)
//   Media → 4× penalización (se puede pasar pero es arriesgado)
//   Baja  → 1.5× (ligera aversión)
//
// Puedes ajustarlos desde la UI si luego quieres dar control al usuario.

export const DEFAULT_HAZARD_PENALTIES: Record<
  Exclude<EmergencyType, 'ninguna'>,
  Partial<Record<'Baja' | 'Media' | 'Alta', number>>
> = {
  inundacion: { Baja: 1.5, Media: 4, Alta: Infinity },
  movimiento_en_masa: { Baja: 2, Media: 5, Alta: Infinity },
  avenida_torrencial: { Baja: 3, Media: 8, Alta: Infinity },
};

// ─── Precomputación ─────────────────────────────────────────────────────────

export interface PrecomputeParams {
  profile: RouteProfile;
  emergencyType: EmergencyType;
  /** Puntos de encuentro — deben tener graphNodeId asignado por linkDestinations */
  destinations: {
    id: number;
    nombre: string;
    graphNodeId?: number;
  }[];
  /** Aristas bloqueadas (reportes ciudadanos, cierres manuales) */
  blockedEdgeIds?: Set<number>;
  /** Si true, ignora cache y recalcula. Útil cuando cambian reportes. */
  force?: boolean;
}

/**
 * Precomputa la tabla de isócronas y la guarda en AsyncStorage.
 * Si ya hay una cache válida para esta combinación, la devuelve sin
 * recalcular (salvo `force: true`).
 *
 * La escritura al storage se serializa por clave (profile:emergencyType)
 * y se envuelve en try/catch: si el storage falla (disco lleno, permisos,
 * JSON demasiado grande), log + devolvemos la tabla igual — mejor iso
 * calculada sin cachear que no iso del todo.
 */
export async function precomputeIsochrones(
  params: PrecomputeParams
): Promise<IsochroneTable> {
  const key = cacheKey(params.profile, params.emergencyType);
  return serializeByKey(key, async () => {
    if (!params.force) {
      const cached = await loadCached(params.profile, params.emergencyType);
      if (cached) return cached;
    }

    const graph = getGraph();
    const sourceNodeIds: number[] = [];
    const sourceNames: string[] = [];
    for (const d of params.destinations) {
      if (d.graphNodeId !== undefined) {
        sourceNodeIds.push(d.graphNodeId);
        sourceNames.push(d.nombre);
      }
    }
    if (sourceNodeIds.length === 0) {
      throw new Error('Ninguno de los destinos tiene graphNodeId asignado. Llama linkDestinations primero.');
    }

    const hazardPenalty =
      params.emergencyType !== 'ninguna'
        ? DEFAULT_HAZARD_PENALTIES[params.emergencyType]
        : undefined;

    const table = multiSourceDijkstra(graph, {
      profile: params.profile,
      emergencyType: params.emergencyType,
      sourceNodeIds,
      sourceNames,
      hazardPenalty,
      blockedEdgeIds: params.blockedEdgeIds,
    });

    try {
      await AsyncStorage.setItem(key, JSON.stringify(table));
    } catch (e) {
      console.warn('[isochroneService] No se pudo cachear la tabla:', e);
    }

    return table;
  });
}

async function loadCached(
  profile: RouteProfile,
  emergencyType: EmergencyType
): Promise<IsochroneTable | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(profile, emergencyType));
    if (!raw) return null;
    const table = JSON.parse(raw) as IsochroneTable;
    if (!isCacheValid(table, profile, emergencyType)) return null;
    return table;
  } catch {
    return null;
  }
}

/**
 * Rechaza tablas corruptas o stale. Casos que bloqueamos:
 *   - Forma mínima mala (entries, profile, emergencyType, graphHash faltan).
 *   - `graphHash` no coincide con el grafo actual: el build script se
 *     re-corrió y `destNodeId`/índices por nodo ya no corresponden a los
 *     mismos lugares — devolver esta tabla llevaría al usuario al refugio
 *     equivocado.
 *   - `entries.length !== graph.nodes.length`: el número de nodos cambió,
 *     así que los índices están desfasados.
 *   - `profile` o `emergencyType` no coinciden con lo pedido: por si el
 *     key del storage quedó colisionado entre versiones.
 *
 * Cuando devolvemos `false`, el caller recomputa y sobreescribe la cache.
 */
function isCacheValid(
  table: IsochroneTable,
  profile: RouteProfile,
  emergencyType: EmergencyType,
): boolean {
  if (!table || typeof table !== 'object') return false;
  if (!Array.isArray(table.entries) || !table.profile || !table.graphHash) return false;
  if (table.profile !== profile) return false;
  if (table.emergencyType !== emergencyType) return false;
  try {
    const graph = getGraph();
    if (table.graphHash !== shortHash(graph)) return false;
    if (table.entries.length !== graph.nodes.length) return false;
  } catch {
    // Si el grafo aún no se cargó no podemos validar — mejor rechazar
    // que devolver una tabla que podría ser de otra build.
    return false;
  }
  return true;
}

// ─── Consulta O(1) ──────────────────────────────────────────────────────────

export interface IsochroneQuery {
  timeSeconds: number;
  destNodeId: number;
  destName: string;
}

/**
 * Dada una ubicación arbitraria (GPS del usuario), responde en O(1):
 * cuál es su punto de encuentro óptimo y cuánto tarda en llegar.
 *
 * Este es el método que se llama desde la UI en MODO CONSULTA INSTANTÁNEA
 * — el usuario ni siquiera ha pedido "iniciar evacuación", solo está
 * viendo el mapa. La respuesta aparece como overlay persistente.
 */
export function queryFromLocation(
  lat: number,
  lng: number,
  table: IsochroneTable,
  graph: Graph
): IsochroneQuery | null {
  const nodeIndex = snapToNearestNode(lat, lng, graph);
  if (nodeIndex === null) return null;
  const entry = table.entries[nodeIndex];
  if (!entry || !isFinite(entry.timeSeconds)) return null;

  return {
    timeSeconds: entry.timeSeconds,
    destNodeId: entry.destNodeId,
    destName: entry.destName,
  };
}

// ─── Exportación cartográfica ───────────────────────────────────────────────

/**
 * Exporta la tabla como GeoJSON FeatureCollection de puntos, uno por nodo,
 * con la propiedad `timeMin`. Se abre directo en QGIS / ArcGIS / kepler.gl
 * y se puede interpolar a un ráster para generar contornos isócronos.
 *
 * Entregable: el mapa de isócronas de evacuación que fortalece tu perfil
 * de Ingeniería Catastral y Geodesia.
 */
export function exportToGeoJSON(
  table: IsochroneTable,
  graph: Graph
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (let i = 0; i < table.entries.length; i++) {
    const e = table.entries[i];
    if (!isFinite(e.timeSeconds)) continue;
    const n = graph.nodes[i];
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      properties: {
        nodeId: n.id,
        timeSec: Math.round(e.timeSeconds),
        timeMin: +(e.timeSeconds / 60).toFixed(2),
        destino: e.destName,
        destinoNodeId: e.destNodeId,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Genera las bandas isócronas listas para renderizar como capas coloreadas
 * en react-native-maps. Cada banda trae la lista de índices de nodos que
 * caen en ella; el componente de overlay los usa para construir polígonos
 * o heatmaps.
 */
export function getIsochroneBands(
  table: IsochroneTable,
  breakpointsMinutes?: number[]
): IsochroneBand[] {
  return bandIsochrones(table, breakpointsMinutes);
}

// ─── Utilidades para el usuario ─────────────────────────────────────────────

export async function clearIsochroneCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter((k) => k.startsWith(CACHE_PREFIX));
  // Loop de removeItem en lugar de multiRemove para compatibilidad con
  // todas las versiones de @react-native-async-storage (el nombre del API
  // cambia entre 2.x y 3.x).
  for (const k of toRemove) {
    await AsyncStorage.removeItem(k);
  }
}
