/**
 * Servicio de personas desaparecidas — persistencia local.
 *
 * Por ahora los reportes son LOCALES al dispositivo. Para una
 * implementación real con sincronización entre ciudadanos se
 * necesitaría un backend (Firebase, Supabase, etc.). La estructura
 * del servicio está diseñada para que migrarla a backend sea
 * reemplazar solo las funciones de load/save.
 *
 * Política de expiración: los reportes se marcan como `expirado`
 * automáticamente tras 7 días. Los reportes con estado
 * `encontrada` se mantienen 48h más para que familiares puedan ver
 * la resolución, y luego se purgan.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { serializeByKey } from '../utils/asyncQueue';
import { persistPhoto } from '../utils/photoStorage';
import { isValidCoord, isValidPhone } from '../utils/validation';
import { getDeviceId } from './reportsService';
import type { MissingPerson, MissingPersonStatus } from '../types/v4';

const STORAGE_KEY = 'missing_persons_v1';
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;          // 7 días
const POST_FOUND_RETENTION_MS = 48 * 60 * 60 * 1000; // 48 h
// Cap defensivo. En la práctica la purga por expiración mantiene la
// lista acotada; este cap evita que cualquier bug deje crecer el storage.
const MAX_STORED_MISSING = 500;

function isValidMissing(x: unknown): x is MissingPerson {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.description === 'string' &&
    typeof m.lastSeenLat === 'number' &&
    typeof m.lastSeenLng === 'number' &&
    typeof m.reportedAt === 'string' &&
    typeof m.reporterDeviceId === 'string' &&
    typeof m.status === 'string'
  );
}

function generateUuid(): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const b = new Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return `${hex(b[0])}${hex(b[1])}${hex(b[2])}${hex(b[3])}-${hex(b[4])}${hex(b[5])}-${hex(b[6])}${hex(b[7])}-${hex(b[8])}${hex(b[9])}-${hex(b[10])}${hex(b[11])}${hex(b[12])}${hex(b[13])}${hex(b[14])}${hex(b[15])}`;
}

async function loadRaw(): Promise<MissingPerson[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidMissing);
  } catch (e) {
    console.warn('[missingPersonsService] loadRaw:', e);
    return [];
  }
}

async function saveRaw(items: MissingPerson[]): Promise<void> {
  const capped = items.length > MAX_STORED_MISSING
    ? [...items]
        .sort((a, b) =>
          new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
        .slice(0, MAX_STORED_MISSING)
    : items;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
}

/** Purga expirados + los encontrados hace >48h */
function purgeExpired(items: MissingPerson[]): MissingPerson[] {
  const now = Date.now();
  return items
    .map((p) => {
      if (p.status === 'desaparecida') {
        const age = now - new Date(p.reportedAt).getTime();
        if (age > EXPIRY_MS) return { ...p, status: 'expirado' as MissingPersonStatus };
      }
      return p;
    })
    .filter((p) => {
      if (p.status === 'encontrada') {
        const age = now - new Date(p.reportedAt).getTime();
        return age < EXPIRY_MS + POST_FOUND_RETENTION_MS;
      }
      return p.status !== 'expirado';
    });
}

export async function getAllMissing(): Promise<MissingPerson[]> {
  const items = await loadRaw();
  const purged = purgeExpired(items);
  if (purged.length !== items.length) await saveRaw(purged);
  return purged.sort(
    (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(),
  );
}

export async function getActiveMissing(): Promise<MissingPerson[]> {
  const all = await getAllMissing();
  return all.filter((p) => p.status === 'desaparecida');
}

export interface ReportMissingInput {
  name: string;
  approximateAge?: number;
  description: string;
  photoUri?: string;
  lastSeenLat: number;
  lastSeenLng: number;
  lastSeenPlace?: string;
  lastSeenAt: string;
  contactPhone: string;
  contactName: string;
}

export async function reportMissing(
  input: ReportMissingInput,
): Promise<MissingPerson> {
  // Validación básica antes de tocar storage.
  if (!isValidCoord(input.lastSeenLat, input.lastSeenLng)) {
    throw new Error('Coordenadas inválidas para el reporte de desaparición.');
  }
  if (!isValidPhone(input.contactPhone)) {
    throw new Error('Teléfono de contacto inválido.');
  }
  const deviceId = await getDeviceId();
  // Persistimos la foto fuera del cache volátil del OS antes de guardar.
  const persistedPhoto = await persistPhoto(input.photoUri);
  return serializeByKey(STORAGE_KEY, async () => {
    const now = new Date().toISOString();
    const report: MissingPerson = {
      id: generateUuid(),
      name: input.name.trim(),
      approximateAge: input.approximateAge,
      description: input.description.trim(),
      photoUri: persistedPhoto,
      lastSeenLat: input.lastSeenLat,
      lastSeenLng: input.lastSeenLng,
      lastSeenPlace: input.lastSeenPlace?.trim(),
      lastSeenAt: input.lastSeenAt,
      reportedAt: now,
      contactPhone: input.contactPhone.trim(),
      contactName: input.contactName.trim(),
      status: 'desaparecida',
      reporterDeviceId: deviceId,
    };
    const items = await loadRaw();
    items.push(report);
    await saveRaw(items);
    return report;
  });
}

/**
 * Marca un reporte como "encontrada". Solo puede hacerlo el
 * dispositivo que lo creó (chequeo local). En una versión con backend
 * esto sería un endpoint auth-protected.
 */
export async function markAsFound(reportId: string): Promise<boolean> {
  const deviceId = await getDeviceId();
  return serializeByKey(STORAGE_KEY, async () => {
    const items = await loadRaw();
    const idx = items.findIndex((p) => p.id === reportId);
    if (idx === -1) return false;
    if (items[idx].reporterDeviceId !== deviceId) return false;
    items[idx] = { ...items[idx], status: 'encontrada' };
    await saveRaw(items);
    return true;
  });
}

export async function deleteReport(reportId: string): Promise<boolean> {
  const deviceId = await getDeviceId();
  return serializeByKey(STORAGE_KEY, async () => {
    const items = await loadRaw();
    const filtered = items.filter(
      (p) => !(p.id === reportId && p.reporterDeviceId === deviceId),
    );
    if (filtered.length === items.length) return false;
    await saveRaw(filtered);
    return true;
  });
}
