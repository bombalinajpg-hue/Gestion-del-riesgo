/**
 * Wrappers del API para reportes ciudadanos y alertas públicas.
 *
 * La UI no toca `api.ts` directo; consume estas funciones que
 * tipan request/response y normalizan errores. Si el backend cambia
 * el shape, el impacto queda acá y no en las pantallas.
 *
 * Los tipos vienen del schema del backend (Pydantic) — manualmente
 * replicados. En el futuro podemos auto-generarlos con
 * `openapi-typescript` apuntando a /openapi.json.
 */

import { api } from "./api";

export type ReportType =
  | "bloqueo_vial"
  | "sendero_obstruido"
  | "inundacion_local"
  | "deslizamiento_local"
  | "riesgo_electrico"
  | "refugio_saturado"
  | "refugio_cerrado"
  | "otro";

export type Severity = "leve" | "moderada" | "grave";

export interface ApiLatLng {
  lat: number;
  lng: number;
}

export interface ApiReportIn {
  municipio_id: string;
  type: ReportType;
  severity?: Severity;
  note?: string;
  photo_url?: string;
  location: ApiLatLng;
}

export interface ApiReportOut {
  id: string;
  municipio_id: string;
  type: ReportType;
  severity: Severity | null;
  note: string | null;
  photo_url: string | null;
  location: ApiLatLng;
  created_at: string; // ISO
}

export interface ApiAlertOut {
  id: string;
  municipio_id: string;
  type: ReportType;
  centroid: ApiLatLng;
  radius_m: number;
  aggregated_severity: Severity | null;
  support_count: number;
  unique_device_count: number;
  sample_photo_url: string | null;
  first_at: string;
  last_at: string;
}

/** POST /v1/reports — crea un reporte ciudadano atado al user autenticado. */
export function apiCreateReport(payload: ApiReportIn): Promise<ApiReportOut> {
  return api.post<ApiReportOut>("/reports", payload);
}

/** GET /v1/alerts — todas las alertas activas de un municipio.
 * El Visor lo usa para pintar el heatmap completo. */
export function apiFetchAlertsByMunicipio(
  municipioId: string,
): Promise<ApiAlertOut[]> {
  const qs = new URLSearchParams({ municipio_id: municipioId });
  return api.get<ApiAlertOut[]>(`/alerts?${qs.toString()}`, { auth: false });
}

/** GET /v1/alerts/near — alertas dentro de un radio del punto. Útil
 * para queries "cerca de mí" en Home cuando hay fix de GPS. */
export function apiFetchAlertsNear(
  municipioId: string,
  lat: number,
  lng: number,
  radiusM = 2000,
): Promise<ApiAlertOut[]> {
  const qs = new URLSearchParams({
    municipio_id: municipioId,
    lat: String(lat),
    lng: String(lng),
    radius_m: String(radiusM),
  });
  return api.get<ApiAlertOut[]>(`/alerts/near?${qs.toString()}`, { auth: false });
}
