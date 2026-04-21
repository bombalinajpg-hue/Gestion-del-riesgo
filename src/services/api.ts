/**
 * Cliente HTTP del backend FastAPI.
 *
 * Responsabilidades:
 *   · Inyectar `Authorization: Bearer <ID_TOKEN>` automáticamente en
 *     cada request autenticado (el token lo provee `firebaseAuth.ts`).
 *   · Serializar JSON de ida y de vuelta.
 *   · Traducir respuestas no-2xx a excepciones con el `detail` del
 *     backend (FastAPI devuelve `{detail: string | object}` en errores).
 *   · Abortar requests largos con AbortController + timeout.
 *
 * Los servicios de dominio (reportsService, missingPersonsService, etc.)
 * consumen esta capa en lugar de `fetch` crudo. La UI consume los
 * servicios — nunca `api` directo, así si cambia la forma del backend
 * el impacto queda localizado.
 */

import { getCurrentIdToken } from "./firebaseAuth";

const BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

const API_PREFIX = "/v1";
const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiOptions {
  /** Si false, no inyectamos Bearer token (endpoints públicos). Default: true. */
  auth?: boolean;
  /** Timeout en ms. Default 15 s — suficiente para queries espaciales. */
  timeoutMs?: number;
  /** Signal externo para cancelar (p. ej. cuando se desmonta una pantalla). */
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: ApiOptions = {},
): Promise<T> {
  const { auth = true, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = opts;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = await getCurrentIdToken();
    if (!token) {
      throw new ApiError("No hay sesión activa", 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  // Merge del signal externo con un timeout interno usando una bandera
  // local en vez de `AbortSignal.reason` (API ES2022 que en algunos
  // entornos RN/Node no existe, o los @types/react-native lo tipan
  // como DOM Event). Quien dispare primero aborta el fetch; el catch
  // chequea la bandera para distinguir timeout de cancel externo.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new ApiError(
        timedOut ? "La solicitud tardó demasiado" : "Solicitud cancelada",
        0,
      );
    }
    throw new ApiError(
      e instanceof Error ? `Error de red: ${e.message}` : "Error de red",
      0,
    );
  }
  clearTimeout(timer);

  // 204 No Content — válido para DELETE / acciones sin response.
  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? (data as { detail: unknown }).detail
        : data;
    const message =
      typeof detail === "string" ? detail : `HTTP ${res.status}`;
    throw new ApiError(message, res.status, detail);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>("POST", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>("PATCH", path, body, opts),
  delete: <T>(path: string, opts?: ApiOptions) =>
    request<T>("DELETE", path, undefined, opts),
};
