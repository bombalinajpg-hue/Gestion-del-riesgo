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
import { apiFetchAlertsByMunicipio, type ApiAlertOut } from "../services/apiReports";
import { getActiveMunicipio } from "./useMunicipio";
import type { PublicAlert, ReportType, ReportSeverity } from "../types/graph";
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

/** Convierte un `ApiAlertOut` (shape del backend) a `PublicAlert`
 * (shape que espera el resto del frontend). El mapeo es directo salvo
 * por `reportIds` y `updatedAt` que el backend no expone — los
 * dejamos vacío/derivado porque los consumidores del mapa no los usan. */
function apiAlertToLocal(a: ApiAlertOut): PublicAlert {
  return {
    id: a.id,
    type: a.type as ReportType,
    lat: a.centroid.lat,
    lng: a.centroid.lng,
    supportCount: a.support_count,
    uniqueDeviceCount: a.unique_device_count,
    firstReportAt: a.first_at,
    lastReportAt: a.last_at,
    aggregatedSeverity: (a.aggregated_severity ?? undefined) as ReportSeverity | undefined,
    samplePhotoUri: a.sample_photo_url ?? undefined,
    // `reportIds` no lo expone el backend (los raw reports son internos
    // al cluster); el frontend no lo usa para renderizar, solo para
    // traza offline. Dejamos [] para alerts del backend.
    reportIds: [],
    // `confidence` = proxy del ratio unique_devices/support. El frontend
    // lo usaba para ordenar; acá lo derivamos del conteo.
    confidence: Math.min(
      1,
      a.unique_device_count / Math.max(3, a.unique_device_count),
    ),
  };
}

async function fetchAlertsFromApi(): Promise<ApiAlertOut[] | null> {
  const muni = getActiveMunicipio();
  if (!muni) return null;
  // Antes usábamos `/alerts/near` con centro del bbox + radio 50 km.
  // Esto fallaba cuando los reportes caían lejos del bbox (p. ej.
  // testeando desde Bogotá con el municipio de Santa Rosa). Ahora
  // pedimos TODAS las alertas del municipio — sin filtro espacial,
  // el bbox del mapa ya se encarga del encuadre visual.
  return apiFetchAlertsByMunicipio(muni.id);
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
      // El recompute local ya no es necesario si el backend hace el
      // clustering. Solo lo corremos si el flag está explícito (para
      // escenarios offline donde el backend no está alcanzable y el
      // usuario depende del cluster local).
      if (opts.recompute) {
        try {
          await recomputePublicAlerts();
        } catch (e) {
          console.warn("[useCommunityStatus] recompute local:", e);
        }
      }

      // Alertas: priorizamos API; si falla caemos al cluster local.
      let alerts: PublicAlert[];
      try {
        const apiAlerts = await fetchAlertsFromApi();
        if (apiAlerts !== null) {
          alerts = apiAlerts.map(apiAlertToLocal);
        } else {
          // No hay municipio cacheado aún — usa local.
          alerts = await getActiveBlockingAlerts();
        }
      } catch (e) {
        console.warn("[useCommunityStatus] API falló, fallback local:", e);
        alerts = await getActiveBlockingAlerts();
      }

      const [missing, groups] = await Promise.all([
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
