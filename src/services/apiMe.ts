/**
 * Wrapper del endpoint /v1/me del backend.
 *
 * Devuelve el user actual (creado/upserted por auth.py al validar el
 * Firebase ID token). Cacheamos en memoria porque el UUID interno no
 * cambia mientras dure la sesión; si el usuario hace logout, limpiamos
 * con `clearMeCache()`.
 *
 * Lo usan consumidores que necesitan saber "¿cuál es mi UUID en la
 * DB?" — por ejemplo, `FamilyGroupModal` para identificar cuál de los
 * miembros listados soy yo.
 */

import { api } from "./api";

export type ApiUserRole = "citizen" | "staff" | "admin";

export interface ApiMeOut {
  id: string;          // UUID interno del user en la DB
  email: string | null;
  display_name: string | null;
  photo_url: string | null;
  role: ApiUserRole;
  municipio_id: string | null;
}

let cache: ApiMeOut | null = null;
let inflight: Promise<ApiMeOut> | null = null;

export async function apiMe(opts: { force?: boolean } = {}): Promise<ApiMeOut> {
  if (!opts.force && cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const me = await api.get<ApiMeOut>("/me");
      cache = me;
      return me;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Llamar al hacer logout para no dejar el UUID del user anterior
 *  visible al siguiente. */
export function clearMeCache(): void {
  cache = null;
  inflight = null;
}
