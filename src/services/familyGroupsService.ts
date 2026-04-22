/**
 * Servicio de grupos familiares.
 *
 * Desde v4.5 el backend sincroniza los grupos entre dispositivos:
 * varios miembros en distintos celulares ven el mismo grupo y la misma
 * lista actualizada. La capa local (AsyncStorage) queda como **cache
 * de respaldo** — si el API no responde (sin internet, backend caído
 * en emergencia), el servicio devuelve lo último que tenía cacheado
 * en lugar de crashear.
 *
 * Flujo:
 *   · `createGroup` → POST al backend. Si éxito, cacheamos + retornamos.
 *   · `joinGroup`   → POST al backend. Mismo patrón.
 *   · `getAllGroups` → GET /me + detalle de c/u. Si falla, lee cache.
 *   · `updateMyLocation` → PATCH. Si falla, guarda solo local (pendiente
 *      de sincronizar cuando vuelva la conexión; en v1.1 añadimos
 *      una cola offline).
 *   · `leaveGroup` → DELETE.
 *
 * Mapeo de tipos: el backend usa `help` mientras el frontend históricamente
 * usó `need_help`. Mapeamos en ambos sentidos para no romper el UI.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError } from "./api";
import {
  apiCreateGroup,
  apiGroupDetail,
  apiJoinGroup,
  apiLeaveGroup,
  apiMyGroups,
  apiUpdateMyMembership,
  type ApiGroupDetail,
  type ApiGroupOut,
  type ApiMemberOut,
  type ApiMemberStatus,
} from "./apiFamilyGroups";
import { serializeByKey } from "../utils/asyncQueue";
import { getDeviceId } from "./reportsService";
import type { FamilyGroup, FamilyMember } from "../types/v4";

const STORAGE_KEY = "family_groups_v1";
const MAX_STORED_GROUPS = 50;

type LocalStatus = NonNullable<FamilyMember["status"]>;

// Set de valores locales válidos. Lo usamos como tipo runtime para
// defensive parsing cuando el backend manda algo inesperado (por
// ejemplo, un status nuevo agregado server-side que la app aún no
// conoce). Antes un valor desconocido se colaba hasta el UI y rompía
// el emoji/label silenciosamente.
const LOCAL_STATUSES: readonly LocalStatus[] = [
  "safe",
  "evacuating",
  "need_help",
  "unknown",
] as const;

function statusFromApi(s: ApiMemberStatus | string): LocalStatus {
  // El backend usa `help`; el frontend siempre tuvo `need_help`.
  if (s === "help") return "need_help";
  if ((LOCAL_STATUSES as readonly string[]).includes(s)) return s as LocalStatus;
  // Valor desconocido: degradamos a "unknown" y logueamos para poder
  // diagnosticar desfases de esquema entre backend y app.
  console.warn(`[familyGroupsService] status desconocido del backend: ${s}`);
  return "unknown";
}

function statusToApi(s: LocalStatus | undefined): ApiMemberStatus {
  if (s === "need_help") return "help";
  if (s === undefined) return "unknown";
  return s;
}

function memberFromApi(m: ApiMemberOut): FamilyMember {
  return {
    // Usamos `user_id` del backend como identificador estable del miembro.
    // Antes localmente usábamos `deviceId`; conservamos el nombre del
    // campo para no romper consumidores, pero lo alimentamos con user_id.
    deviceId: m.user_id,
    name: m.display_name ?? "Sin nombre",
    lat: m.last_location?.lat,
    lng: m.last_location?.lng,
    status: statusFromApi(m.last_status),
    lastUpdatedAt: m.last_seen_at ?? undefined,
  };
}

function groupFromApi(g: ApiGroupDetail, myUserId: string): FamilyGroup {
  return {
    code: g.code,
    name: g.name,
    createdAt: g.created_at,
    isOwner: g.is_owner,
    myName: g.my_name ?? "",
    members: g.members.map(memberFromApi),
  };
}

function isValidGroup(x: unknown): x is FamilyGroup {
  if (!x || typeof x !== "object") return false;
  const g = x as Record<string, unknown>;
  return (
    typeof g.code === "string" &&
    typeof g.name === "string" &&
    typeof g.createdAt === "string" &&
    typeof g.isOwner === "boolean" &&
    typeof g.myName === "string" &&
    Array.isArray(g.members)
  );
}

// ─── Cache local (AsyncStorage) ─────────────────────────────────────

async function loadRaw(): Promise<FamilyGroup[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidGroup);
  } catch (e) {
    console.warn("[familyGroupsService] loadRaw:", e);
    return [];
  }
}

async function saveRaw(groups: FamilyGroup[]): Promise<void> {
  const capped = groups.length > MAX_STORED_GROUPS
    ? [...groups]
        .sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_STORED_GROUPS)
    : groups;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
}

async function upsertLocal(group: FamilyGroup): Promise<void> {
  await serializeByKey(STORAGE_KEY, async () => {
    const groups = await loadRaw();
    const idx = groups.findIndex((g) => g.code === group.code);
    if (idx === -1) groups.push(group);
    else groups[idx] = group;
    await saveRaw(groups);
  });
}

async function removeLocal(code: string): Promise<void> {
  await serializeByKey(STORAGE_KEY, async () => {
    const groups = await loadRaw();
    await saveRaw(groups.filter((g) => g.code !== code.toUpperCase()));
  });
}

// ─── API pública ────────────────────────────────────────────────────

export async function getAllGroups(): Promise<FamilyGroup[]> {
  // Primero intentamos refrescar desde el backend. Si falla, devolvemos
  // la cache. Importante: no awaiteamos cada detail en paralelo sin
  // protección — si el usuario tiene 10 grupos y la red está lenta,
  // se cae todo. Limitamos con Promise.allSettled.
  try {
    const list = await apiMyGroups();
    const details = await Promise.allSettled(
      list.map((g) => apiGroupDetail(g.code)),
    );
    const myId = await getDeviceId();
    const hydrated: FamilyGroup[] = [];
    for (const r of details) {
      if (r.status === "fulfilled") {
        hydrated.push(groupFromApi(r.value, myId));
      }
    }
    // Sobreescribimos la cache con la data fresca del backend.
    await saveRaw(hydrated);
    return hydrated;
  } catch (e) {
    console.warn(
      "[familyGroupsService] backend no disponible, usando cache local:",
      e instanceof ApiError ? e.message : e,
    );
    return loadRaw();
  }
}

export async function getGroup(code: string): Promise<FamilyGroup | null> {
  try {
    const detail = await apiGroupDetail(code.toUpperCase());
    const myId = await getDeviceId();
    const group = groupFromApi(detail, myId);
    await upsertLocal(group);
    return group;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    console.warn("[familyGroupsService] getGroup fallback local:", e);
    const groups = await loadRaw();
    return groups.find((g) => g.code === code.toUpperCase()) ?? null;
  }
}

export interface CreateGroupInput {
  name: string;
  myName: string;
}

export async function createGroup(input: CreateGroupInput): Promise<FamilyGroup> {
  // Siempre intentamos el backend primero: crear offline no tiene
  // sentido porque el código lo genera el servidor (garantía de
  // unicidad global). Si el backend falla, propagamos el error para
  // que el caller muestre un mensaje claro al usuario.
  const detail = await apiCreateGroup({
    name: input.name.trim(),
    my_name: input.myName.trim(),
  });
  const myId = await getDeviceId();
  const group = groupFromApi(detail, myId);
  await upsertLocal(group);
  return group;
}

export interface JoinGroupInput {
  code: string;
  myName: string;
}

export async function joinGroup(input: JoinGroupInput): Promise<FamilyGroup> {
  const detail = await apiJoinGroup({
    code: input.code.toUpperCase().trim(),
    my_name: input.myName.trim(),
  });
  const myId = await getDeviceId();
  const group = groupFromApi(detail, myId);
  await upsertLocal(group);
  return group;
}

export async function leaveGroup(code: string): Promise<void> {
  // Aunque el backend falle, limpiamos el cache local para que el
  // usuario no quede "atorado" en un grupo que no puede eliminar.
  try {
    await apiLeaveGroup(code.toUpperCase());
  } catch (e) {
    console.warn("[familyGroupsService] leaveGroup backend falló:", e);
  }
  await removeLocal(code);
}

/**
 * Actualiza MI ubicación y estado en un grupo. Si el backend no
 * responde, guardamos el cambio en la cache local — no perdemos la
 * intención del usuario, pero los otros miembros no verán el cambio
 * hasta que se reconecte (v1.1: cola offline para sincronizar).
 */
export async function updateMyLocation(
  groupCode: string,
  update: { lat?: number; lng?: number; status?: FamilyMember["status"] },
): Promise<FamilyGroup | null> {
  const code = groupCode.toUpperCase();
  const location =
    update.lat !== undefined && update.lng !== undefined
      ? { lat: update.lat, lng: update.lng }
      : undefined;
  try {
    await apiUpdateMyMembership(code, {
      location,
      status: statusToApi(update.status),
    });
    // Después del PATCH, traemos el detalle fresco para ver los cambios
    // de otros miembros también (ganancia barata: una request de más).
    const detail = await apiGroupDetail(code);
    const myId = await getDeviceId();
    const group = groupFromApi(detail, myId);
    await upsertLocal(group);
    return group;
  } catch (e) {
    console.warn(
      "[familyGroupsService] updateMyLocation backend falló, solo local:",
      e,
    );
    // Fallback: actualizar mi miembro en la cache.
    const myId = await getDeviceId();
    return serializeByKey(STORAGE_KEY, async () => {
      const groups = await loadRaw();
      const group = groups.find((g) => g.code === code);
      if (!group) return null;
      const member = group.members.find((m) => m.deviceId === myId);
      if (!member) return null;
      if (update.lat !== undefined) member.lat = update.lat;
      if (update.lng !== undefined) member.lng = update.lng;
      if (update.status !== undefined) member.status = update.status;
      member.lastUpdatedAt = new Date().toISOString();
      await saveRaw(groups);
      return group;
    });
  }
}

/** Texto para compartir el código del grupo por WhatsApp. */
export function buildShareMessage(group: FamilyGroup): string {
  return (
    `🚨 Únete a mi grupo familiar "${group.name}" en la app EvacuApp.\n\n` +
    `Código del grupo: *${group.code}*\n\n` +
    `Así podremos ver nuestras ubicaciones y coordinarnos si hay una emergencia.`
  );
}
