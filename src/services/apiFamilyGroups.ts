/**
 * Wrappers del API para grupos familiares.
 *
 * Mapea 1-a-1 con los endpoints `/v1/family-groups` del backend FastAPI.
 * El servicio de dominio `familyGroupsService` consume estas funciones
 * (no usa `fetch` crudo) y añade el fallback a AsyncStorage si el API
 * no está alcanzable — útil cuando no hay internet o el backend está
 * caído durante una emergencia.
 */

import { api } from "./api";

export type ApiMemberStatus = "safe" | "evacuating" | "help" | "unknown";

export interface ApiLatLng {
  lat: number;
  lng: number;
}

export interface ApiMemberOut {
  id: string;
  user_id: string;
  display_name: string | null;
  last_location: ApiLatLng | null;
  last_status: ApiMemberStatus;
  last_seen_at: string | null;
}

export interface ApiGroupOut {
  id: string;
  code: string;
  name: string;
  municipio_id: string | null;
  created_at: string;
  is_owner: boolean;
  my_name: string | null;
}

export interface ApiGroupDetail extends ApiGroupOut {
  members: ApiMemberOut[];
}

export interface ApiCreateGroupIn {
  name: string;
  my_name: string;
  municipio_id?: string | null;
}

export interface ApiJoinGroupIn {
  code: string;
  my_name: string;
}

export interface ApiMemberUpdateIn {
  location?: ApiLatLng | null;
  status?: ApiMemberStatus;
}

/** POST /v1/family-groups — crea grupo, devuelve detalle con yo como miembro. */
export function apiCreateGroup(payload: ApiCreateGroupIn): Promise<ApiGroupDetail> {
  return api.post<ApiGroupDetail>("/family-groups", payload);
}

/** POST /v1/family-groups/join — unirme a un grupo existente. */
export function apiJoinGroup(payload: ApiJoinGroupIn): Promise<ApiGroupDetail> {
  return api.post<ApiGroupDetail>("/family-groups/join", payload);
}

/** GET /v1/family-groups/me — lista mis grupos (sin miembros). */
export function apiMyGroups(): Promise<ApiGroupOut[]> {
  return api.get<ApiGroupOut[]>("/family-groups/me");
}

/** GET /v1/family-groups/{code} — detalle con miembros. */
export function apiGroupDetail(code: string): Promise<ApiGroupDetail> {
  return api.get<ApiGroupDetail>(`/family-groups/${encodeURIComponent(code)}`);
}

/** PATCH /v1/family-groups/{code}/members/me — actualizar mi estado y ubicación. */
export function apiUpdateMyMembership(
  code: string,
  payload: ApiMemberUpdateIn,
): Promise<ApiMemberOut> {
  return api.patch<ApiMemberOut>(
    `/family-groups/${encodeURIComponent(code)}/members/me`,
    payload,
  );
}

/** DELETE /v1/family-groups/{code}/members/me — salir del grupo. */
export function apiLeaveGroup(code: string): Promise<void> {
  return api.delete<void>(
    `/family-groups/${encodeURIComponent(code)}/members/me`,
  );
}
