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
  Graph,
  PublicAlert,
  ReportSeverity,
  ReportType,
} from "../types/graph";
import { haversineMeters } from "../utils/haversine";

const REPORTS_KEY = "citizen_reports_v2"; // v2 — cambió el schema
const ALERTS_KEY = "public_alerts_v2";
const DEVICE_ID_KEY = "device_id_v1";

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
    return raw ? (JSON.parse(raw) as CitizenReport[]) : [];
  } catch {
    return [];
  }
}

async function saveReports(reports: CitizenReport[]): Promise<void> {
  await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

export async function getAllReports(): Promise<CitizenReport[]> {
  return loadReports();
}

export async function getAllPublicAlerts(): Promise<PublicAlert[]> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_KEY);
    const alerts = raw ? (JSON.parse(raw) as PublicAlert[]) : [];
    const now = Date.now();
    return alerts.filter(
      (a) =>
        now - new Date(a.lastReportAt).getTime() < CLUSTER_PARAMS.alertTtlMs,
    );
  } catch {
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
  if (
    !isFinite(input.lat) ||
    !isFinite(input.lng) ||
    Math.abs(input.lat) > 90 ||
    Math.abs(input.lng) > 180
  ) {
    return { ok: false, reason: "invalid_coords" };
  }

  const deviceId = await getDeviceId();
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
    return { ok: false, reason: "rate_limited" };
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
    photoUri: input.photoUri,
    status: "pendiente",
    confirmationCount: 1,
  };

  reports.push(report);
  await saveReports(reports);

  const newAlerts = await recomputePublicAlerts();
  const matching = newAlerts.find((a) => a.reportIds.includes(report.id));

  return {
    ok: true,
    report,
    newPublicAlert:
      matching && matching.supportCount >= CLUSTER_PARAMS.minUniqueDevices
        ? matching
        : undefined,
  };
}

// ─── Clustering ─────────────────────────────────────────────────────────────

export async function recomputePublicAlerts(): Promise<PublicAlert[]> {
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

function clusterByRadius(
  reports: CitizenReport[],
  radiusMeters: number,
): CitizenReport[][] {
  const clusters: CitizenReport[][] = [];
  for (const r of reports) {
    let placed = false;
    for (const cluster of clusters) {
      const c = centroidOf(cluster);
      if (haversineMeters(c.lat, c.lng, r.lat, r.lng) <= radiusMeters) {
        cluster.push(r);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([r]);
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

export async function getAllBlockedEdgeIds(graph: Graph): Promise<Set<number>> {
  const alerts = await getAllPublicAlerts();
  const blocking = alerts.filter((a) => BLOCKING_TYPES.has(a.type));
  if (blocking.length === 0) return new Set();

  const blocked = new Set<number>();
  const radius = CLUSTER_PARAMS.radiusMeters;

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const fromIdx = graph.idToIndex[edge.from];
    const toIdx = graph.idToIndex[edge.to];
    if (fromIdx === undefined || toIdx === undefined) continue;
    const a = graph.nodes[fromIdx];
    const b = graph.nodes[toIdx];
    const midLat = (a.lat + b.lat) / 2;
    const midLng = (a.lng + b.lng) / 2;

    for (const alert of blocking) {
      if (Math.abs(alert.lat - midLat) > 0.001) continue;
      if (Math.abs(alert.lng - midLng) > 0.001) continue;
      if (haversineMeters(alert.lat, alert.lng, midLat, midLng) <= radius) {
        blocked.add(i);
        break;
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
