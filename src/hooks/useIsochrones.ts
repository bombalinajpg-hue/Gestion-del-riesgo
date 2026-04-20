/**
 * Hook que maneja la tabla de isócronas: cálculo, cache y auto-refresh.
 *
 * Expone:
 *  - `isoTable`: la tabla calculada o null
 *  - `isoError`: mensaje de error si el cómputo falló
 *  - `isoComputing`: flag mientras corre el cómputo
 *  - `computeIso()`: dispara un cómputo manualmente (devuelve la tabla)
 *
 * Auto-refresh: cuando cambia `emergencyType` o `routeProfile`, el hook
 * agenda un `computeIso()` con debounce de 200 ms. Si `emergencyType` es
 * "ninguna", limpia `isoTable` sin cómputo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { precomputeIsochrones } from "../services/isochroneService";
import type { EmergencyType, RouteProfile } from "../types/graph";
import type { IsochroneTable } from "../types/graph";
import type { LinkedDestino } from "./useGraphBootstrap";

export interface UseIsochronesParams {
  graphReady: boolean;
  linkedDestinos: LinkedDestino[];
  emergencyType: EmergencyType;
  routeProfile: RouteProfile | null;
}

export interface UseIsochronesResult {
  isoTable: IsochroneTable | null;
  isoError: string | null;
  isoComputing: boolean;
  computeIso: () => Promise<IsochroneTable | null>;
}

export function useIsochrones(params: UseIsochronesParams): UseIsochronesResult {
  const { graphReady, linkedDestinos, emergencyType, routeProfile } = params;
  const [isoTable, setIsoTable] = useState<IsochroneTable | null>(null);
  const [isoError, setIsoError] = useState<string | null>(null);
  const [isoComputing, setIsoComputing] = useState(false);

  // Guardamos las entradas en un ref para que `computeIso` siga siendo
  // estable entre renders (no cambia en cada cambio de prop) — los
  // callers pueden memoizarlo con confianza.
  const paramsRef = useRef({ graphReady, linkedDestinos, emergencyType, routeProfile });
  paramsRef.current = { graphReady, linkedDestinos, emergencyType, routeProfile };

  const computeIso = useCallback(async (): Promise<IsochroneTable | null> => {
    const p = paramsRef.current;
    if (!p.graphReady || p.linkedDestinos.length === 0) {
      setIsoError("No hay destinos válidos en el grafo");
      return null;
    }
    if (p.emergencyType === "ninguna") {
      setIsoError(null);
      setIsoTable(null);
      return null;
    }
    setIsoError(null);
    setIsoComputing(true);
    try {
      const table = await precomputeIsochrones({
        profile: p.routeProfile ?? "foot-walking",
        emergencyType: p.emergencyType,
        destinations: p.linkedDestinos,
      });
      setIsoTable(table);
      return table;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[useIsochrones] Isócronas fallaron:", e);
      setIsoError(msg);
      setIsoTable(null);
      return null;
    } finally {
      setIsoComputing(false);
    }
  }, []);

  // Auto-refresh con debounce cuando cambian los parámetros relevantes.
  useEffect(() => {
    if (!graphReady) return;
    if (emergencyType === "ninguna") {
      setIsoTable(null);
      setIsoError(null);
      return;
    }
    const t = setTimeout(() => {
      computeIso();
    }, 200);
    return () => clearTimeout(t);
  }, [graphReady, emergencyType, routeProfile, computeIso]);

  return { isoTable, isoError, isoComputing, computeIso };
}
