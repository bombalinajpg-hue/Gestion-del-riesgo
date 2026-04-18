/**
 * Servicio de grupos familiares (encuentro familiar).
 *
 * Modelo: grupos identificados por un código corto (6 caracteres).
 * Los miembros se identifican por deviceId y un nombre elegido por
 * cada uno. El estado se almacena localmente — la sincronización
 * de ubicaciones entre miembros requeriría backend.
 *
 * Por ahora, el flujo soportado es:
 *   - Usuario crea grupo → recibe código único, lo comparte por WhatsApp
 *   - Otros miembros ingresan el código → se registra el grupo localmente
 *   - Cada miembro actualiza su ubicación manualmente ("compartir mi
 *     ubicación con el grupo") → se guarda localmente
 *
 * Para una versión funcional de ubicación en tiempo real se necesita
 * un backend realtime (Firestore, Supabase realtime, etc.). Este
 * servicio está diseñado como la capa de persistencia local de ese
 * sistema.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceId } from './reportsService';
import type { FamilyGroup, FamilyMember } from '../types/v4';

const STORAGE_KEY = 'family_groups_v1';

/** Genera código corto de 6 chars sin caracteres confundibles (O/0, I/1, etc.) */
function generateGroupCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

async function loadRaw(): Promise<FamilyGroup[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FamilyGroup[]) : [];
  } catch {
    return [];
  }
}

async function saveRaw(groups: FamilyGroup[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export async function getAllGroups(): Promise<FamilyGroup[]> {
  return loadRaw();
}

export async function getGroup(code: string): Promise<FamilyGroup | null> {
  const groups = await loadRaw();
  return groups.find((g) => g.code === code.toUpperCase()) ?? null;
}

export interface CreateGroupInput {
  name: string;
  myName: string;
}

export async function createGroup(input: CreateGroupInput): Promise<FamilyGroup> {
  const deviceId = await getDeviceId();
  const code = generateGroupCode();
  const group: FamilyGroup = {
    code,
    name: input.name.trim(),
    createdAt: new Date().toISOString(),
    isOwner: true,
    myName: input.myName.trim(),
    members: [
      {
        deviceId,
        name: input.myName.trim(),
        status: 'unknown',
      },
    ],
  };
  const groups = await loadRaw();
  groups.push(group);
  await saveRaw(groups);
  return group;
}

export interface JoinGroupInput {
  code: string;
  /** Nombre que este usuario quiere mostrar en el grupo */
  myName: string;
}

export async function joinGroup(input: JoinGroupInput): Promise<FamilyGroup> {
  const deviceId = await getDeviceId();
  const code = input.code.toUpperCase().trim();
  const groups = await loadRaw();

  const existing = groups.find((g) => g.code === code);
  if (existing) {
    // Ya estábamos en este grupo; actualizar nombre
    const idx = existing.members.findIndex((m) => m.deviceId === deviceId);
    if (idx !== -1) existing.members[idx].name = input.myName.trim();
    else
      existing.members.push({
        deviceId,
        name: input.myName.trim(),
        status: 'unknown',
      });
    existing.myName = input.myName.trim();
    await saveRaw(groups);
    return existing;
  }

  // Crear entrada local del grupo con nosotros como primer miembro
  // visible. Cuando haya backend, aquí se haría el fetch de los demás
  // miembros usando el código.
  const group: FamilyGroup = {
    code,
    name: `Grupo ${code}`,
    createdAt: new Date().toISOString(),
    isOwner: false,
    myName: input.myName.trim(),
    members: [
      {
        deviceId,
        name: input.myName.trim(),
        status: 'unknown',
      },
    ],
  };
  groups.push(group);
  await saveRaw(groups);
  return group;
}

export async function leaveGroup(code: string): Promise<void> {
  const groups = await loadRaw();
  const filtered = groups.filter((g) => g.code !== code.toUpperCase());
  await saveRaw(filtered);
}

/**
 * Actualiza MI ubicación y estado en un grupo específico.
 * En una versión con backend, esto haría push al realtime channel.
 */
export async function updateMyLocation(
  groupCode: string,
  update: { lat?: number; lng?: number; status?: FamilyMember['status'] },
): Promise<FamilyGroup | null> {
  const deviceId = await getDeviceId();
  const groups = await loadRaw();
  const group = groups.find((g) => g.code === groupCode.toUpperCase());
  if (!group) return null;
  const member = group.members.find((m) => m.deviceId === deviceId);
  if (!member) return null;
  if (update.lat !== undefined) member.lat = update.lat;
  if (update.lng !== undefined) member.lng = update.lng;
  if (update.status !== undefined) member.status = update.status;
  member.lastUpdatedAt = new Date().toISOString();
  await saveRaw(groups);
  return group;
}

/**
 * Texto para compartir por WhatsApp — incluye el código e
 * instrucciones para unirse.
 */
export function buildShareMessage(group: FamilyGroup): string {
  return (
    `🚨 Únete a mi grupo familiar "${group.name}" en la app Rutas de Evacuación.\n\n` +
    `Código del grupo: *${group.code}*\n\n` +
    `Así podremos ver nuestras ubicaciones y coordinarnos si hay una emergencia.`
  );
}
