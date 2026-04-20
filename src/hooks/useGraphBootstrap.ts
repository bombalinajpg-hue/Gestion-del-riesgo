/**
 * Hook que inicializa el grafo vial y snapea los puntos de encuentro a
 * nodos del grafo. Centraliza la lógica que antes vivía duplicada en
 * MapViewContainer y Visor (StatisticsScreen).
 *
 * Concretamente:
 *  - Llama `loadGraphFromBundle()` — dynamic import del graph.json que
 *    difiere el parseo hasta este momento.
 *  - `prewarmSnapIndex` para que el primer `snapToNearestNode` no pague
 *    el costo de construir el índice espacial.
 *  - Intenta `linkDestinations()` del servicio (puede crear aristas);
 *    no confía que asigne `graphNodeId` correctamente, hace el snap
 *    manualmente.
 *  - `snapToNearestNode` devuelve índice; traducimos a `graph.nodes[i].id`
 *    porque los algoritmos lo consumen así.
 *
 * Si ningún destino puede asociarse al grafo (bbox desalineado), muestra
 * un Alert y deja `graphReady=false` para que la UI no ofrezca flujos
 * que van a fallar.
 */

import { useEffect, useState } from "react";
import { Alert } from "react-native";
import {
  getGraph,
  linkDestinations,
  loadGraphFromBundle,
} from "../services/graphService";
import type { Destino } from "../types/types";
import { prewarmSnapIndex, snapToNearestNode } from "../utils/snapToGraph";

export type LinkedDestino = Destino & { graphNodeId: number };

export interface UseGraphBootstrapResult {
  graphReady: boolean;
  linkedDestinos: LinkedDestino[];
}

export function useGraphBootstrap(
  destinos: Destino[],
): UseGraphBootstrapResult {
  const [graphReady, setGraphReady] = useState(false);
  const [linkedDestinos, setLinkedDestinos] = useState<LinkedDestino[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await loadGraphFromBundle();
        if (cancelled) return;
        prewarmSnapIndex(g);
        try {
          linkDestinations(destinos);
        } catch (e) {
          console.warn("[useGraphBootstrap] linkDestinations:", e);
        }
        const linked: LinkedDestino[] = destinos.flatMap((d) => {
          const idx = snapToNearestNode(d.lat, d.lng, g);
          if (idx === null) return [];
          const nodeId = g.nodes[idx].id;
          return [{ ...d, graphNodeId: nodeId }];
        });
        if (cancelled) return;
        if (linked.length === 0) {
          console.error("[useGraphBootstrap] Ningún destino snapeable al grafo");
          Alert.alert(
            "Grafo incompatible",
            "Ningún punto de encuentro pudo asociarse al grafo vial. " +
              "Esto suele pasar cuando el bbox del grafo no cubre los refugios. " +
              "Re-ejecuta `node scripts/build-graph.js` con un bbox que incluya los destinos.",
          );
          return;
        }
        console.log(
          `[useGraphBootstrap] ${linked.length}/${destinos.length} destinos snapeados al grafo`,
        );
        setLinkedDestinos(linked);
        setGraphReady(true);
      } catch (e) {
        if (cancelled) return;
        console.error("[useGraphBootstrap] fallo:", e);
        Alert.alert(
          "Grafo no disponible",
          "Ejecuta `node scripts/build-graph.js`.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // Se corre una sola vez al montar. La lista `destinos` viene de un
    // import estático, así que no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper para consumidores que necesitan el grafo (p. ej. precomputar
  // isócronas o hacer snap de coords arbitrarias). Solo válido cuando
  // `graphReady === true`.
  return { graphReady, linkedDestinos };
}

/** Atajo para acceder al grafo ya cargado. Lanza si aún no se llamó al hook. */
export function getLoadedGraph() {
  return getGraph();
}
