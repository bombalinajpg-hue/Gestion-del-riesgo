/**
 * Wrapper del API para municipios.
 *
 * Endpoints públicos (sin auth) — la app los llama al arrancar para
 * poblar el selector de municipio antes incluso del login.
 */

import { api } from "./api";

export interface ApiBBox {
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
}

export interface ApiMunicipio {
  id: string;
  slug: string;
  name: string;
  bbox: ApiBBox | null;
  active: boolean;
}

export function apiListMunicipios(): Promise<ApiMunicipio[]> {
  return api.get<ApiMunicipio[]>("/municipios", { auth: false });
}

export function apiGetMunicipio(id: string): Promise<ApiMunicipio> {
  return api.get<ApiMunicipio>(`/municipios/${id}`, { auth: false });
}
