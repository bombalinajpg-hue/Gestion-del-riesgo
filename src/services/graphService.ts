/**
 * Servicio del grafo vial — carga el JSON bundled, lo indexa y lo expone
 * como singleton. Cachea el índice en memoria porque reconstruirlo en cada
 * render de Dijkstra sería desperdicio.
 *
 * Convención de entrada:
 *   - El grafo se distribuye como `data/graph.json`, generado por
 *     `scripts/build-graph.js` desde OSM Overpass. Ver ese script para
 *     la forma exacta.
 *   - El JSON trae `nodes` y `edges`. Aquí construimos `idToIndex` y
 *     `edgesOut` para que el resto del código tenga acceso O(1).
 */

import type { Graph, GraphNode, GraphEdge } from '../types/graph';
import { invalidateSnapIndex } from '../utils/snapToGraph';

/**
 * Raw del JSON — no trae los índices. Los construimos al cargar.
 */
export interface RawGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bbox?: Graph['bbox'];
  meta?: Graph['meta'];
}

let cachedGraph: Graph | null = null;

/**
 * Carga el grafo desde el JSON bundled. Llamar SOLO UNA VEZ al arrancar
 * la app (por ejemplo en un useEffect de _layout.tsx).
 *
 * `rawGraph` es el resultado de `require('../../data/graph.json')` en
 * el caller, para que Metro bundler lo incluya en el APK.
 */
/**
 * Carga el grafo desde el bundle via dynamic import. Diferencia frente a
 * `loadGraph(require(...))`: el JSON de 2.2 MB no se parsea al arrancar
 * la app sino cuando el primer caller (normalmente `useGraphBootstrap`)
 * invoca esta función. Metro lo tratará como chunk diferido cuando sea
 * posible; incluso si lo inlinea, la creación del objeto JS a partir del
 * string JSON ocurre al await, no al import del módulo.
 *
 * Dedup: tras la primera llamada, `cachedGraph` está seteado y las
 * llamadas siguientes devuelven el mismo grafo sin volver a parsear.
 */
export async function loadGraphFromBundle(): Promise<Graph> {
  if (cachedGraph) return cachedGraph;
  const mod = await import("../../data/graph.json");
  return loadGraph(mod.default as unknown as RawGraph);
}

export function loadGraph(rawGraph: RawGraph): Graph {
  if (cachedGraph) return cachedGraph;

  // Validación mínima antes de asumir forma: si graph.json está corrupto
  // o proviene de una versión vieja del build script, preferimos un error
  // claro a un crash críptico dentro de .map/.forEach más abajo.
  if (!rawGraph || typeof rawGraph !== 'object') {
    throw new Error('graph.json inválido: root no es un objeto');
  }
  if (!Array.isArray(rawGraph.nodes) || rawGraph.nodes.length === 0) {
    throw new Error('graph.json inválido: falta `nodes` o está vacío');
  }
  if (!Array.isArray(rawGraph.edges)) {
    throw new Error('graph.json inválido: `edges` no es un array');
  }
  const firstNode = rawGraph.nodes[0];
  if (typeof firstNode.id !== 'number' ||
      typeof firstNode.lat !== 'number' ||
      typeof firstNode.lng !== 'number') {
    throw new Error('graph.json inválido: nodos sin {id,lat,lng} numéricos');
  }

  const nodes = rawGraph.nodes;
  // JSON no soporta Infinity. El script build-graph.js serializa los costos
  // inalcanzables como `null`. Aquí los restauramos a Infinity para que los
  // algoritmos los traten correctamente como intransitables.
  const edges: GraphEdge[] = rawGraph.edges.map((e) => {
    const cs = e.costSeconds as unknown as Record<string, number | null>;
    return {
      ...e,
      costSeconds: {
        'foot-walking': cs['foot-walking'] ?? Infinity,
        'cycling-regular': cs['cycling-regular'] ?? Infinity,
        'driving-car': cs['driving-car'] ?? Infinity,
      },
    };
  });

  const idToIndex: Record<number, number> = {};
  for (let i = 0; i < nodes.length; i++) {
    idToIndex[nodes[i].id] = i;
  }

  const edgesOut: number[][] = Array.from({ length: nodes.length }, () => []);
  for (let i = 0; i < edges.length; i++) {
    const fromIdx = idToIndex[edges[i].from];
    if (fromIdx !== undefined) {
      edgesOut[fromIdx].push(i);
    }
  }

  const bbox =
    rawGraph.bbox ?? computeBbox(nodes);

  const meta: Graph['meta'] = rawGraph.meta ?? {
    source: 'unknown',
    builtAt: new Date().toISOString(),
    area: 'Santa Rosa de Cabal',
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };

  cachedGraph = { nodes, edges, idToIndex, edgesOut, bbox, meta };
  return cachedGraph;
}

export function getGraph(): Graph {
  if (!cachedGraph) {
    throw new Error('Grafo no cargado. Llama loadGraph(rawGraph) primero.');
  }
  return cachedGraph;
}

/** Para tests — permite resetear el singleton. También invalida el índice
 * de snap porque su cache está keyed por identidad del grafo; sin esto
 * un snap posterior podría encontrar `graphRef !== newGraph` y rebuild
 * correcto, pero ser explícito evita sorpresas si la lógica cambia. */
export function __resetGraphCache(): void {
  cachedGraph = null;
  invalidateSnapIndex();
}

function computeBbox(nodes: GraphNode[]): Graph['bbox'] {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const n of nodes) {
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lng < minLng) minLng = n.lng;
    if (n.lng > maxLng) maxLng = n.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

// ─── INYECCIÓN DE NODOS ESPECIALES ──────────────────────────────────────────
//
// Los puntos de encuentro y las instituciones de tu destinos.json /
// instituciones.json NO coinciden necesariamente con intersecciones del
// grafo OSM. Para que sean ruteables, hay que conectarlos al grafo.
//
// El script build-graph.js ya hace esto en tiempo de build — asigna a cada
// destino un nodeId del grafo (el más cercano) y opcionalmente crea una
// "arista corta" conectándolo si la distancia es grande.
//
// Si prefieres hacerlo en runtime, usa `linkDestinations` después de cargar
// el grafo.

import { snapToNearestNode } from '../utils/snapToGraph';

export interface DestinationWithNodeId {
  id: number;
  nombre: string;
  tipo: string;
  lat: number;
  lng: number;
  /** Poblado por linkDestinations */
  graphNodeId?: number;
}

/**
 * Asigna a cada destino el nodo del grafo más cercano.
 * Se usa una vez al arrancar la app.
 */
export function linkDestinations(
  destinations: Omit<DestinationWithNodeId, 'graphNodeId'>[]
): DestinationWithNodeId[] {
  const graph = getGraph();
  return destinations.map((d) => {
    const nodeIndex = snapToNearestNode(d.lat, d.lng, graph);
    const graphNodeId = nodeIndex !== null ? graph.nodes[nodeIndex].id : undefined;
    return { ...d, graphNodeId };
  });
}
