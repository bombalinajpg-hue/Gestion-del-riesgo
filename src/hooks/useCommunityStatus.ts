/**
 * Hook compartido que agrega los datos "sociales" que varias pantallas
 * necesitan (alertas ciudadanas, personas desaparecidas activas, grupos
 * familiares). Antes cada pantalla hacía sus propios `getActive*()` en
 * paralelo; al navegar entre pantallas los mismos queries a AsyncStorage
 * se duplicaban.
 *
 * Ahora:
 *  - Un único `cache` en memoria compartido entre todos los consumidores.
 *  - Los reads a storage se deduplican vía un promise `inflight`: si ya
 *    hay un refresh en curso, los demás esperan.
 *  - La cache se considera fresca durante `CACHE_MS`; pasado ese tiempo,
 *    un nuevo consumidor que se monte dispara refresh automático.
 *  - Los consumidores pueden forzar refresh con `refresh({ recompute })`
 *    — por ejemplo después de enviar un reporte, o al entrar a una
 *    pantalla que quiera dato fresco (Visor, Community).
 *
 * `recompute: true` reejecuta `recomputePublicAlerts()` (operación
 * costosa que cluster-iza los reports). Por defecto solo se leen las
 * alertas ya calculadas. MapViewContainer lo llama cada 60 s para
 * mantener las alertas actualizadas en segundo plano.
 */

import { useEffect, useState } from "react";
import { getActiveMissing } from "../services/missingPersonsService";
import {
  getActiveBlockingAlerts,
  recomputePublicAlerts,
} from "../services/reportsService";
import { getAllGroups } from "../services/familyGroupsService";
import type { PublicAlert } from "../types/graph";
import type { FamilyGroup, MissingPerson } from "../types/v4";

export interface CommunitySnapshot {
  alerts: PublicAlert[];
  missing: MissingPerson[];
  groups: FamilyGroup[];
  at: number;
}

const CACHE_MS = 30_000;

let cache: CommunitySnapshot | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: CommunitySnapshot) => void>();

export interface RefreshOptions {
  /** Vuelve a ejecutar `recomputePublicAlerts()` (clustering). Caro. */
  recompute?: boolean;
  /** Si la cache es más nueva que esto (en ms), no hace nada. */
  maxAgeMs?: number;
}

export async function refreshCommunityStatus(
  opts: RefreshOptions = {},
): Promise<void> {
  const maxAge = opts.maxAgeMs ?? 0;
  if (cache && maxAge > 0 && Date.now() - cache.at < maxAge) {
    return;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (opts.recompute) {
        try {
          await recomputePublicAlerts();
        } catch (e) {
          console.warn("[useCommunityStatus] recompute:", e);
        }
      }
      const [alerts, missing, groups] = await Promise.all([
        getActiveBlockingAlerts(),
        getActiveMissing(),
        getAllGroups(),
      ]);
      const snap: CommunitySnapshot = {
        alerts,
        missing,
        groups,
        at: Date.now(),
      };
      cache = snap;
      listeners.forEach((l) => l(snap));
    } catch (e) {
      console.warn("[useCommunityStatus] refresh:", e);
    }
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

export function useCommunityStatus() {
  const [snap, setSnap] = useState<CommunitySnapshot | null>(cache);

  useEffect(() => {
    listeners.add(setSnap);
    // Sincronizamos con la cache al montar: si ya hay algo más reciente
    // que lo que tenemos, lo adoptamos; si no hay nada o está rancio,
    // disparamos un refresh ligero (sin recompute).
    if (cache && cache !== snap) setSnap(cache);
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      refreshCommunityStatus();
    }
    return () => {
      listeners.delete(setSnap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    alerts: snap?.alerts ?? [],
    missing: snap?.missing ?? [],
    groups: snap?.groups ?? [],
    alertCount: snap?.alerts.length ?? 0,
    missingCount: snap?.missing.length ?? 0,
    groupCount: snap?.groups.length ?? 0,
    lastUpdatedAt: snap?.at ?? null,
    refresh: refreshCommunityStatus,
  };
}
