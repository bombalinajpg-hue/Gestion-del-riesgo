/**
 * Hook que resuelve el municipio activo para las queries del API.
 *
 * Por ahora la app opera con UN solo municipio (Santa Rosa de Cabal)
 * que trae la DB. En cuanto la DB tenga más municipios, este hook se
 * va a extender con selección de usuario (dropdown) + persistencia
 * del elegido en AsyncStorage. Mientras: toma el primero `active`.
 *
 * Cache: guarda el ID en memoria global y en AsyncStorage para que
 * las pantallas siguientes no esperen otro round-trip al API.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { apiListMunicipios, type ApiMunicipio } from "../services/apiMunicipios";

const STORAGE_KEY = "active_municipio_v1";

interface Cache {
  municipio: ApiMunicipio | null;
  /** Promise en curso (dedup de fetches concurrentes). */
  inflight: Promise<ApiMunicipio | null> | null;
  /** Subs. se disparan cuando el municipio cambia. */
  listeners: Set<(m: ApiMunicipio | null) => void>;
}

const cache: Cache = {
  municipio: null,
  inflight: null,
  listeners: new Set(),
};

async function resolveActive(): Promise<ApiMunicipio | null> {
  if (cache.municipio) return cache.municipio;
  if (cache.inflight) return cache.inflight;

  cache.inflight = (async () => {
    // 1) Leemos del AsyncStorage como warm cache (rápido, resiste offline).
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as ApiMunicipio;
        cache.municipio = cached;
        cache.listeners.forEach((l) => l(cached));
      }
    } catch {
      // AsyncStorage falló — seguimos con el API.
    }

    // 2) Fetch fresco del API (valida que el ID sigue activo y actualiza).
    try {
      const list = await apiListMunicipios();
      const active = list.find((m) => m.active) ?? null;
      if (active) {
        cache.municipio = active;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(active));
        cache.listeners.forEach((l) => l(active));
      }
      return active;
    } catch (e) {
      console.warn("[useMunicipio] API falló, usando cache:", e);
      return cache.municipio;
    } finally {
      cache.inflight = null;
    }
  })();

  return cache.inflight;
}

export interface UseMunicipioResult {
  municipio: ApiMunicipio | null;
  municipioId: string | null;
  loading: boolean;
}

export function useMunicipio(): UseMunicipioResult {
  const [municipio, setMunicipio] = useState<ApiMunicipio | null>(cache.municipio);
  const [loading, setLoading] = useState(!cache.municipio);

  useEffect(() => {
    const listener = (m: ApiMunicipio | null) => setMunicipio(m);
    cache.listeners.add(listener);
    if (!cache.municipio) {
      resolveActive().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => {
      cache.listeners.delete(listener);
    };
  }, []);

  return {
    municipio,
    municipioId: municipio?.id ?? null,
    loading,
  };
}

/** Acceso síncrono para lugares donde un hook no aplica (servicios). */
export function getActiveMunicipioId(): string | null {
  return cache.municipio?.id ?? null;
}
