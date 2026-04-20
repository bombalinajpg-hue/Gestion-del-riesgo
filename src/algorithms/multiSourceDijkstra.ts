/**
 * Dijkstra MULTI-FUENTE para isócronas de evacuación.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  ¿Por qué multi-fuente y no una ejecución por cada punto de encuentro?
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Truco estándar en ciencias de grafos: en lugar de correr Dijkstra N veces
 * (una por cada punto de encuentro) y tomar el mínimo, se inicializa la
 * cola con TODAS las fuentes simultáneamente con distancia 0. El algoritmo
 * entonces calcula, en UNA sola pasada, para cada nodo del grafo:
 *
 *   "¿cuál es el punto de encuentro más cercano y cuánto tardo en llegar?"
 *
 * Complejidad: O((n + m) log n) — la misma que un Dijkstra simple, no N×.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  ¿Por qué se llama "isócronas"?
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Porque si agrupas los nodos por tiempo de llegada (ej.: 0–2 min, 2–5 min,
 * 5–10 min...) y pintas cada grupo de un color, obtienes un MAPA DE CALOR
 * que muestra contornos isócronos (de igual tiempo) de evacuación.
 *
 * Entregable adicional: este mismo resultado se puede exportar como GeoJSON
 * y abrir en QGIS para generar la salida cartográfica que fortalece el perfil
 * de Ingeniería Catastral.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  Consulta en O(1)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Después de la precomputación, la tabla `entries[nodeIdx]` da la respuesta
 * completa en tiempo constante. Perfecto para el escenario offline: el
 * ciudadano abre la app en medio de un apagón de celular, y la app
 * responde instantáneamente sin ninguna llamada a internet.
 */

import type {
  Graph,
  IsochroneTable,
  RouteProfile,
  EmergencyType,
  HazardCategory,
} from '../types/graph';
import { MinHeap } from './MinHeap';

export interface MultiSourceOptions {
  profile: RouteProfile;
  emergencyType: EmergencyType;
  /** IDs de nodos "fuente" — los puntos de encuentro */
  sourceNodeIds: number[];
  /** Nombres de cada fuente, en el mismo orden que sourceNodeIds */
  sourceNames: string[];
  /** Penalización por amenaza — misma semántica que en Dijkstra */
  hazardPenalty?: Partial<Record<HazardCategory, number>>;
  /** Aristas bloqueadas dinámicamente */
  blockedEdgeIds?: Set<number>;
}

/**
 * Ejecuta Dijkstra multi-fuente y retorna la tabla de isócronas.
 *
 * NOTA IMPORTANTE: el grafo se recorre en REVERSA — es decir, el algoritmo
 * inicia desde los puntos de encuentro y explora hacia afuera, preguntando
 * "¿quién puede llegar aquí?" en vez de "¿adónde puedo ir?". Para que esto
 * funcione correctamente, tu grafo debe ser recíproco (edges u→v y v→u
 * coexisten). El script build-graph.js ya lo genera así por defecto.
 */
export function multiSourceDijkstra(
  graph: Graph,
  opts: MultiSourceOptions
): IsochroneTable {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const nearestSource = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);

  const heap = new MinHeap<number>();

  // Inicialización con TODAS las fuentes a distancia 0
  // Registramos para cada nodo fuente cuál es su sourceIndex (0..k-1)
  for (let s = 0; s < opts.sourceNodeIds.length; s++) {
    const idx = graph.idToIndex[opts.sourceNodeIds[s]];
    if (idx === undefined) continue;
    dist[idx] = 0;
    nearestSource[idx] = s;
    heap.push(idx, 0);
  }

  const emergencyKey = opts.emergencyType !== 'ninguna' ? opts.emergencyType : null;

  while (!heap.isEmpty()) {
    const u = heap.pop()!;
    if (visited[u]) continue;
    visited[u] = 1;

    for (const edgeIdx of graph.edgesOut[u]) {
      if (opts.blockedEdgeIds?.has(edgeIdx)) continue;

      const edge = graph.edges[edgeIdx];
      let weight = edge.costSeconds[opts.profile];

      if (emergencyKey && edge.hazardByType?.[emergencyKey] && opts.hazardPenalty) {
        const cat = edge.hazardByType[emergencyKey];
        const mult = cat ? opts.hazardPenalty[cat] : undefined;
        if (mult === undefined) {
          // sin penalización
        } else if (!isFinite(mult)) {
          continue;
        } else {
          weight *= mult;
        }
      }

      const v = graph.idToIndex[edge.to];
      if (v === undefined) continue;
      const alt = dist[u] + weight;
      if (alt < dist[v]) {
        dist[v] = alt;
        nearestSource[v] = nearestSource[u]; // propaga la fuente asignada
        heap.push(v, alt);
      }
    }
  }

  // Empaquetar entries
  const entries: IsochroneTable['entries'] = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = nearestSource[i];
    entries[i] = {
      timeSeconds: dist[i],
      destNodeId: s >= 0 ? opts.sourceNodeIds[s] : -1,
      destName: s >= 0 ? opts.sourceNames[s] : '',
    };
  }

  return {
    entries,
    profile: opts.profile,
    emergencyType: opts.emergencyType,
    builtAt: new Date().toISOString(),
    sourceDestIds: [...opts.sourceNodeIds],
    graphHash: shortHash(graph),
  };
}

/**
 * Hash corto del grafo para invalidar cache de isócronas cuando cambia.
 * No es criptográfico — basta para detectar "el grafo que generó esta
 * tabla ya no es el mismo que el actual".
 */
export function shortHash(graph: Graph): string {
  return `${graph.meta.nodeCount}-${graph.meta.edgeCount}-${graph.meta.builtAt.slice(0, 10)}`;
}

/**
 * Agrupa los nodos de la tabla en bandas isócronas (0-2min, 2-5min, 5-10min...).
 * Útil para renderizar el mapa de calor en el frontend.
 *
 * Retorna un array con, para cada banda: los nodos que caen dentro,
 * el rango de tiempos y un color sugerido.
 */
export interface IsochroneBand {
  minSeconds: number;
  maxSeconds: number;
  label: string;
  color: string;
  nodeIndices: number[];
}

export function bandIsochrones(
  table: IsochroneTable,
  breakpointsMinutes: number[] = [2, 5, 10, 20, 40]
): IsochroneBand[] {
  const breakpoints = [0, ...breakpointsMinutes.map((m) => m * 60), Infinity];
  // Paleta verde→amarillo→rojo (más tiempo = peor situación)
  const palette = ['#10b981', '#84cc16', '#eab308', '#f97316', '#dc2626', '#7f1d1d'];

  const bands: IsochroneBand[] = [];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const lo = breakpoints[i];
    const hi = breakpoints[i + 1];
    const label =
      hi === Infinity
        ? `> ${Math.round(lo / 60)} min`
        : `${Math.round(lo / 60)}–${Math.round(hi / 60)} min`;
    bands.push({
      minSeconds: lo,
      maxSeconds: hi,
      label,
      color: palette[Math.min(i, palette.length - 1)],
      nodeIndices: [],
    });
  }

  for (let i = 0; i < table.entries.length; i++) {
    const t = table.entries[i].timeSeconds;
    if (!isFinite(t)) continue; // nodos inalcanzables
    for (const band of bands) {
      if (t >= band.minSeconds && t < band.maxSeconds) {
        band.nodeIndices.push(i);
        break;
      }
    }
  }

  return bands;
}
