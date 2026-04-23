/**
 * Servicio de reportes ciudadanos — versión con foto y severidad.
 *
 * Cambios respecto a la versión anterior:
 *   - SubmitReportInput ahora acepta `photoUri` y `severity`.
 *   - El cluster público agrega `aggregatedSeverity` (severidad predominante)
 *     y `samplePhotoUri` (la foto más reciente del cluster).
 *
 * IMPORTANTE: las fotos NO se guardan en AsyncStorage — solo sus URIs.
 * En iOS y Android el URI de expo-image-picker apunta a un archivo en
 * el directorio de documentos de la app, que es persistente entre
 * sesiones. Si quieres extra seguridad de persistencia, usa
 * expo-file-system para copiar a una ruta estable.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  CitizenReport,
  EmergencyType,
  Graph,
  PublicAlert,
  ReportSeverity,
  ReportType,
} from "../types/graph";
import { getActiveMunicipioId } from "../hooks/useMunicipio";
import { apiCreateReport } from "./apiReports";
import { serializeByKey } from "../utils/asyncQueue";
import { haversineMeters } from "../utils/haversine";
import { persistPhoto } from "../utils/photoStorage";
import { isValidCoord } from "../utils/validation";

const REPORTS_KEY = "citizen_reports_v2"; // v2 — cambió el schema
const ALERTS_KEY = "public_alerts_v2";
const DEVICE_ID_KEY = "device_id_v1";
// Cap: evita que el storage crezca sin límite. ~30 días de reportes con
// rate-limit de 1 cada 10 min = ~4320 reportes máximo. 2000 es holgado
// y acota el tamaño de serialización.
const MAX_STORED_REPORTS = 2000;

function isValidReport(x: unknown): x is CitizenReport {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.type === "string" &&
    typeof r.lat === "number" &&
    typeof r.lng === "number" &&
    typeof r.createdAt === "string" &&
    typeof r.deviceId === "string"
  );
}

export const CLUSTER_PARAMS = {
  radiusMeters: 30,
  windowMs: 3 * 60 * 60 * 1000,
  minUniqueDevices: 3,
  alertTtlMs: 12 * 60 * 60 * 1000,
  deviceCooldownMs: 10 * 60 * 1000,
  cooldownRadiusMeters: 20,
};

// ─── Device ID ──────────────────────────────────────────────────────────────

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  const id = generateUuid();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  cachedDeviceId = id;
  return id;
}

function generateUuid(): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const bytes = new Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return `${hex(bytes[0])}${hex(bytes[1])}${hex(bytes[2])}${hex(bytes[3])}-${hex(bytes[4])}${hex(bytes[5])}-${hex(bytes[6])}${hex(bytes[7])}-${hex(bytes[8])}${hex(bytes[9])}-${hex(bytes[10])}${hex(bytes[11])}${hex(bytes[12])}${hex(bytes[13])}${hex(bytes[14])}${hex(bytes[15])}`;
}

// ─── Carga/guarda ───────────────────────────────────────────────────────────

async function loadReports(): Promise<CitizenReport[]> {
  try {
    const raw = await AsyncStorage.getItem(REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filtra entradas malformadas (schema change, corrupción, edición manual).
    return parsed.filter(isValidReport);
  } catch (e) {
    console.warn("[reportsService] loadReports:", e);
    return [];
  }
}

async function saveReports(reports: CitizenReport[]): Promise<void> {
  // Si excedemos el cap, mantenemos los más recientes. Los viejos ya no
  // tienen impacto en la ventana de cluster (3 h) ni en el TTL (12 h).
  const capped = reports.length > MAX_STORED_REPORTS
    ? [...reports]
        .sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_STORED_REPORTS)
    : reports;
  await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(capped));
}

export async function getAllReports(): Promise<CitizenReport[]> {
  return loadReports();
}

export async function getAllPublicAlerts(): Promise<PublicAlert[]> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((a): a is PublicAlert => {
      if (!a || typeof a !== "object") return false;
      const alert = a as Record<string, unknown>;
      if (typeof alert.id !== "string") return false;
      if (typeof alert.lat !== "number" || typeof alert.lng !== "number") return false;
      if (typeof alert.lastReportAt !== "string") return false;
      return now - new Date(alert.lastReportAt).getTime() < CLUSTER_PARAMS.alertTtlMs;
    });
  } catch (e) {
    console.warn("[reportsService] getAllPublicAlerts:", e);
    return [];
  }
}

// ─── Submit ─────────────────────────────────────────────────────────────────

export interface SubmitReportInput {
  type: ReportType;
  lat: number;
  lng: number;
  note?: string;
  severity?: ReportSeverity;
  photoUri?: string;
}

export interface SubmitReportResult {
  ok: boolean;
  report?: CitizenReport;
  reason?: "rate_limited" | "invalid_coords" | "storage_error";
  newPublicAlert?: PublicAlert;
}

export async function submitReport(
  input: SubmitReportInput,
): Promise<SubmitReportResult> {
  if (!isValidCoord(input.lat, input.lng)) {
    return { ok: false, reason: "invalid_coords" };
  }

  const deviceId = await getDeviceId();
  // Copiamos la foto (si la hay) a almacenamiento persistente ANTES de
  // entrar a la sección crítica. El copy es idempotente y la sección
  // crítica solo debe contener operaciones de storage rápidas.
  const persistedPhoto = await persistPhoto(input.photoUri);
  // Serializa load-modify-save sobre REPORTS_KEY: si dos taps rápidos o
  // dos submits paralelos ocurren, el segundo espera al primero y ve la
  // versión fresca del storage antes de mutarla.
  const result = await serializeByKey(REPORTS_KEY, async () => {
    const now = Date.now();
    const reports = await loadReports();

    const recentSameDevice = reports.find(
      (r) =>
        r.deviceId === deviceId &&
        r.type === input.type &&
        now - new Date(r.createdAt).getTime() < CLUSTER_PARAMS.deviceCooldownMs &&
        haversineMeters(r.lat, r.lng, input.lat, input.lng) <
          CLUSTER_PARAMS.cooldownRadiusMeters,
    );
    if (recentSameDevice) {
      return { ok: false as const, reason: "rate_limited" as const };
    }

    const report: CitizenReport = {
      id: generateUuid(),
      type: input.type,
      lat: input.lat,
      lng: input.lng,
      createdAt: new Date(now).toISOString(),
      deviceId,
      note: input.note?.slice(0, 200),
      severity: input.severity,
      photoUri: persistedPhoto,
      status: "pendiente",
      confirmationCount: 1,
    };

    reports.push(report);
    await saveReports(reports);
    return { ok: true as const, report };
  });

  if (!result.ok) return result;

  // ─── Dual-write al backend (best-effort) ──────────────────────────────
  // Guardamos siempre local primero para resistir offline; después
  // empujamos al API si está disponible. Si el API falla, la app sigue
  // funcionando con los reports locales — el usuario no se entera.
  //
  // Foto: el `photoUri` es un archivo local; no lo subimos al backend
  // por ahora (requeriría Firebase Storage para alojar la imagen).
  // Cuando eso esté, mandamos el `photo_url` firmado.
  void pushReportToApi(result.report).catch((e) =>
    console.warn("[reportsService] push al API falló (retry pendiente):", e),
  );

  const newAlerts = await recomputePublicAlerts();
  const matching = newAlerts.find((a) => a.reportIds.includes(result.report.id));

  return {
    ok: true,
    report: result.report,
    newPublicAlert:
      matching && matching.supportCount >= CLUSTER_PARAMS.minUniqueDevices
        ? matching
        : undefined,
  };
}

async function pushReportToApi(report: CitizenReport): Promise<void> {
  const municipioId = getActiveMunicipioId();
  if (!municipioId) {
    // Sin municipio resuelto aún (primer launch sin red); omitimos el
    // push. El reporte queda local y se intentará re-empujar más adelante
    // cuando implementemos la cola de retry.
    return;
  }
  await apiCreateReport({
    municipio_id: municipioId,
    type: report.type,
    severity: report.severity,
    note: report.note,
    location: { lat: report.lat, lng: report.lng },
  });
}

// ─── Clustering ─────────────────────────────────────────────────────────────

export async function recomputePublicAlerts(): Promise<PublicAlert[]> {
  return serializeByKey(ALERTS_KEY, async () => {
  const reports = await loadReports();
  const now = Date.now();

  const active = reports.filter(
    (r) => now - new Date(r.createdAt).getTime() < CLUSTER_PARAMS.windowMs,
  );

  const byType = new Map<ReportType, CitizenReport[]>();
  for (const r of active) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }

  const alerts: PublicAlert[] = [];
  for (const [type, rs] of byType.entries()) {
    const clusters = clusterByRadius(rs, CLUSTER_PARAMS.radiusMeters);
    for (const cluster of clusters) {
      const uniqueDevices = new Set(cluster.map((r) => r.deviceId));
      if (uniqueDevices.size < CLUSTER_PARAMS.minUniqueDevices) continue;
      const centroid = centroidOf(cluster);
      const sorted = [...cluster].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const firstAt = sorted[0].createdAt;
      const lastAt = sorted[sorted.length - 1].createdAt;
      const ageMs = now - new Date(lastAt).getTime();
      const freshness = 1 - ageMs / CLUSTER_PARAMS.alertTtlMs;
      const supportBonus = Math.min(1, uniqueDevices.size / 10);
      const confidence = Math.max(
        0,
        Math.min(1, 0.5 * freshness + 0.5 * supportBonus),
      );

      // Severidad agregada — gana la más grave si al menos 1/3 del cluster la reporta
      const aggregatedSeverity = aggregateSeverity(cluster);
      // Foto muestra — la más reciente con photoUri
      const samplePhotoUri = [...sorted]
        .reverse()
        .find((r) => !!r.photoUri)?.photoUri;

      alerts.push({
        id: `alert-${type}-${Math.round(centroid.lat * 1e5)}-${Math.round(centroid.lng * 1e5)}`,
        type,
        lat: centroid.lat,
        lng: centroid.lng,
        supportCount: cluster.length,
        uniqueDeviceCount: uniqueDevices.size,
        firstReportAt: firstAt,
        lastReportAt: lastAt,
        reportIds: cluster.map((r) => r.id),
        confidence,
        aggregatedSeverity,
        samplePhotoUri,
      });
    }
  }

  await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  return alerts;
  });
}

function aggregateSeverity(
  cluster: CitizenReport[],
): ReportSeverity | undefined {
  const counts: Record<ReportSeverity, number> = {
    leve: 0,
    moderada: 0,
    grave: 0,
  };
  let total = 0;
  for (const r of cluster) {
    if (r.severity) {
      counts[r.severity]++;
      total++;
    }
  }
  if (total === 0) return undefined;
  // Si >= 1/3 reportó "grave", la alerta es grave. Si no, la moda.
  const third = total / 3;
  if (counts.grave >= third) return "grave";
  if (counts.moderada >= counts.leve) return "moderada";
  return "leve";
}

// Indexamos centroides de clusters por grid espacial (celda ≥ radio + margen)
// para que cada reporte consulte solo las 9 celdas vecinas. También mantenemos
// los centroides en una estructura incremental: al agregar un reporte, el
// centroide nuevo es `(old * n + r) / (n+1)`, sin re-sumar todo el cluster.
//
// Complejidad: O(N · k) donde k = clusters típicos en un vecindario (O(1)
// en la práctica). Para 500 reportes baja de ~250k operaciones a unos
// pocos miles, eliminando el bloqueo de UI post-submit.
function clusterByRadius(
  reports: CitizenReport[],
  radiusMeters: number,
): CitizenReport[][] {
  const clusters: CitizenReport[][] = [];
  const centroids: { lat: number; lng: number }[] = [];
  const cellOf: string[] = []; // celda actual de cada cluster
  const cellSizeDeg = (radiusMeters * 1.1) / 111_000;
  const grid = new Map<string, number[]>();

  const cellKey = (lat: number, lng: number) =>
    `${Math.floor(lat / cellSizeDeg)}:${Math.floor(lng / cellSizeDeg)}`;

  for (const r of reports) {
    const cx = Math.floor(r.lat / cellSizeDeg);
    const cy = Math.floor(r.lng / cellSizeDeg);
    let placedIdx = -1;

    outer: for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cx + dx}:${cy + dy}`);
        if (!bucket) continue;
        for (const idx of bucket) {
          const c = centroids[idx];
          if (haversineMeters(c.lat, c.lng, r.lat, r.lng) <= radiusMeters) {
            placedIdx = idx;
            break outer;
          }
        }
      }
    }

    if (placedIdx === -1) {
      const idx = clusters.length;
      clusters.push([r]);
      centroids.push({ lat: r.lat, lng: r.lng });
      const key = cellKey(r.lat, r.lng);
      cellOf.push(key);
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(idx);
    } else {
      const cluster = clusters[placedIdx];
      const n = cluster.length;
      cluster.push(r);
      // Centroide incremental — sin recorrer el cluster entero.
      const c = centroids[placedIdx];
      const newLat = (c.lat * n + r.lat) / (n + 1);
      const newLng = (c.lng * n + r.lng) / (n + 1);
      centroids[placedIdx] = { lat: newLat, lng: newLng };

      // Si el centroide migró a otra celda, re-indexar.
      const newKey = cellKey(newLat, newLng);
      const oldKey = cellOf[placedIdx];
      if (newKey !== oldKey) {
        const oldBucket = grid.get(oldKey);
        if (oldBucket) {
          const pos = oldBucket.indexOf(placedIdx);
          if (pos !== -1) oldBucket.splice(pos, 1);
        }
        let newBucket = grid.get(newKey);
        if (!newBucket) {
          newBucket = [];
          grid.set(newKey, newBucket);
        }
        newBucket.push(placedIdx);
        cellOf[placedIdx] = newKey;
      }
    }
  }

  return clusters;
}

function centroidOf(reports: CitizenReport[]): { lat: number; lng: number } {
  let lat = 0,
    lng = 0;
  for (const r of reports) {
    lat += r.lat;
    lng += r.lng;
  }
  return { lat: lat / reports.length, lng: lng / reports.length };
}

// ─── Bridge con el ruteo ────────────────────────────────────────────────────

const BLOCKING_TYPES = new Set<ReportType>([
  "bloqueo_vial",
  "sendero_obstruido",
  "inundacion_local",
  "deslizamiento_local",
  "riesgo_electrico",
]);

/**
 * Decide si una alerta ciudadana es relevante dado el tipo de emergencia
 * activa en la app. Sirve para filtrar en dos lugares:
 *   1) Render visual (MapViewContainer): solo dibujar alertas pertinentes.
 *   2) Motor de ruteo (localRouter → getAllBlockedEdgeIds): solo penalizar
 *      aristas cercanas a alertas pertinentes al fenómeno activo.
 *
 * Reglas:
 *   - Tipos infraestructurales (bloqueo_vial, sendero_obstruido, riesgo_electrico,
 *     refugio_saturado, refugio_cerrado, otro) son SIEMPRE relevantes — no importa
 *     si el ciudadano reportó por cuál emergencia, el obstáculo existe.
 *   - inundacion_local → relevante solo en `inundacion` y `avenida_torrencial`.
 *   - deslizamiento_local → relevante solo en `movimiento_en_masa` y
 *     `avenida_torrencial`.
 *   - Si `emergencyType === "ninguna"` (sin emergencia activa), TODAS se muestran
 *     porque el usuario puede querer ver el panorama general del municipio.
 */
export function isAlertRelevantFor(
  alertType: ReportType,
  emergencyType: EmergencyType,
): boolean {
  if (emergencyType === "ninguna") return true;
  switch (alertType) {
    case "bloqueo_vial":
    case "sendero_obstruido":
    case "riesgo_electrico":
    case "refugio_saturado":
    case "refugio_cerrado":
    case "otro":
      return true;
    case "inundacion_local":
      return emergencyType === "inundacion" || emergencyType === "avenida_torrencial";
    case "deslizamiento_local":
      return emergencyType === "movimiento_en_masa" || emergencyType === "avenida_torrencial";
    default:
      return true;
  }
}

// Grid espacial: indexa alertas por celdas cuadradas ≥ radio, para que
// cada arista consulte solo las 9 celdas vecinas (3×3) en vez de barrer
// toda la lista de alertas. Complejidad pasa de O(E·A) a O(E + A).
//
// cellSizeDeg se calcula como `radius / 111_000` más un margen del 10 %
// para absorber la variación cos(φ) en longitud a estas latitudes (~4-5°)
// sin tener que usar cos(φ) explícito. Si en el futuro se extiende a
// zonas de alta latitud hay que escalar lng por cos(φ).
function buildAlertGrid(
  alerts: PublicAlert[],
  cellSizeDeg: number,
): Map<string, PublicAlert[]> {
  const grid = new Map<string, PublicAlert[]>();
  for (const a of alerts) {
    const cx = Math.floor(a.lat / cellSizeDeg);
    const cy = Math.floor(a.lng / cellSizeDeg);
    const key = `${cx}:${cy}`;
    let cell = grid.get(key);
    if (!cell) {
      cell = [];
      grid.set(key, cell);
    }
    cell.push(a);
  }
  return grid;
}

export async function getAllBlockedEdgeIds(
  graph: Graph,
  emergencyType?: EmergencyType,
): Promise<Set<number>> {
  const alerts = await getAllPublicAlerts();
  let blocking = alerts.filter((a) => BLOCKING_TYPES.has(a.type));
  // Filtro por pertinencia al fenómeno activo (objetivo 4 del anteproyecto:
  // personalización por tipo de emergencia). Sin esto, una alerta de
  // "inundación local" penalizaría aristas también en emergencia de
  // movimiento en masa, lo cual no corresponde al escenario.
  if (emergencyType) {
    blocking = blocking.filter((a) => isAlertRelevantFor(a.type, emergencyType));
  }
  if (blocking.length === 0) return new Set();

  const radius = CLUSTER_PARAMS.radiusMeters;
  const cellSizeDeg = (radius * 1.1) / 111_000;
  const grid = buildAlertGrid(blocking, cellSizeDeg);

  const blocked = new Set<number>();

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const fromIdx = graph.idToIndex[edge.from];
    const toIdx = graph.idToIndex[edge.to];
    if (fromIdx === undefined || toIdx === undefined) continue;
    const a = graph.nodes[fromIdx];
    const b = graph.nodes[toIdx];
    const midLat = (a.lat + b.lat) / 2;
    const midLng = (a.lng + b.lng) / 2;
    const cx = Math.floor(midLat / cellSizeDeg);
    const cy = Math.floor(midLng / cellSizeDeg);

    let hit = false;
    for (let dx = -1; dx <= 1 && !hit; dx++) {
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        const cell = grid.get(`${cx + dx}:${cy + dy}`);
        if (!cell) continue;
        for (const alert of cell) {
          if (haversineMeters(alert.lat, alert.lng, midLat, midLng) <= radius) {
            blocked.add(i);
            hit = true;
            break;
          }
        }
      }
    }
  }
  return blocked;
}

export async function getActiveBlockingAlerts(): Promise<PublicAlert[]> {
  const alerts = await getAllPublicAlerts();
  return alerts.filter((a) => BLOCKING_TYPES.has(a.type));
}

export async function getRefugeAlerts(): Promise<PublicAlert[]> {
  const alerts = await getAllPublicAlerts();
  return alerts.filter(
    (a) => a.type === "refugio_saturado" || a.type === "refugio_cerrado",
  );
}

export async function clearAllReports(): Promise<void> {
  await AsyncStorage.removeItem(REPORTS_KEY);
  await AsyncStorage.removeItem(ALERTS_KEY);
}
