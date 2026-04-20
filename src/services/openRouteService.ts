import polyline from '@mapbox/polyline';
import axios from 'axios';
import { findPolygonExitPoint, isPointInAnyPolygonOrMulti } from '../utils/geometry';

const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY ?? '';

const assertOrsApiKey = (): void => {
  if (!ORS_API_KEY) {
    const msg = 'OpenRouteService API key no configurada. Revisa el archivo .env con EXPO_PUBLIC_ORS_API_KEY.';
    console.error(msg);
    throw new Error(msg);
  }
};

const openRouteService = axios.create({
  baseURL: 'https://api.openrouteservice.org/v2/directions',
  timeout: 10000,
  headers: {
    Authorization: ORS_API_KEY,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export interface OrsRoute {
  geometry: string;
  summary?: { distance?: number; duration?: number };
  segments?: unknown[];
}

export interface OrsResponse {
  routes: OrsRoute[];
}

export interface RouteResult {
  data: OrsResponse;
  isInDangerZone: boolean;
  usedAvoidance: boolean;
  exitPoint: { latitude: number; longitude: number } | null;
  dangerCoords: { latitude: number; longitude: number }[];
  // Destino final real usado en la Llamada 2 — puede diferir del `end` original
  // cuando el modo es 'closest' y la Llamada 1 encontró un destino más óptimo
  destinoFinalCoord: { lat: number; lng: number; nombre: string } | null;
}

const assertValidRouteResponse = (data: unknown): OrsResponse => {
  const res = data as Partial<OrsResponse> | null;
  if (!res || !Array.isArray(res.routes) || res.routes.length === 0 || !res.routes[0]?.geometry) {
    throw new Error('Respuesta de ORS inválida: no se recibió una ruta válida.');
  }
  return res as OrsResponse;
};

const RETRYABLE_ORS_STATUSES = [400, 413];

type Destino = { id: number; lat: number; lng: number; nombre: string; tipo: string };
type Coord = { latitude: number; longitude: number };

interface OrsRequestBody {
  coordinates: [number, number][];
  format: string;
  options?: { avoid_polygons: GeoJSON.Geometry };
}

function haversineMeters(a: Coord, b: Coord): number {
  const R = 6371000;
  const φ1 = a.latitude * Math.PI / 180;
  const φ2 = b.latitude * Math.PI / 180;
  const Δφ = (b.latitude - a.latitude) * Math.PI / 180;
  const Δλ = (b.longitude - a.longitude) * Math.PI / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function distanceAlongRoute(coords: Coord[], toIndex: number): number {
  let dist = 0;
  for (let i = 1; i <= toIndex; i++) dist += haversineMeters(coords[i - 1], coords[i]);
  return dist;
}

const buildAvoidPolygons = (geoJson: GeoJSON.FeatureCollection): GeoJSON.Geometry | null => {
  try {
    const polygons: GeoJSON.Position[][][] = [];
    for (const feature of geoJson.features) {
      if (!feature.geometry) continue;
      if (feature.geometry.type === 'Polygon') {
        polygons.push(feature.geometry.coordinates);
      } else if (feature.geometry.type === 'MultiPolygon') {
        for (const poly of feature.geometry.coordinates) {
          polygons.push(poly);
        }
      }
    }
    if (polygons.length === 0) return null;
    return { type: 'MultiPolygon', coordinates: polygons };
  } catch (e) {
    console.error('GeoJSON inválido al construir polígonos de evitación:', e);
    return null;
  }
};

export const getRoute = async (
  start: [number, number],
  end: [number, number],
  profile: 'driving-car' | 'foot-walking' | 'cycling-regular' = 'driving-car',
  hazardGeoJson?: GeoJSON.FeatureCollection,
  allDestinos?: Destino[]
): Promise<RouteResult> => {
  assertOrsApiKey();
  try {
    const startPoint = { latitude: start[1], longitude: start[0] };

    const isInDangerZone =
      !!hazardGeoJson?.features?.length &&
      isPointInAnyPolygonOrMulti(startPoint, hazardGeoJson);

    const avoidPolygons = hazardGeoJson ? buildAvoidPolygons(hazardGeoJson) : null;

    // ── Caso normal: no está en zona de peligro ───────────────────────────
    if (!isInDangerZone || !hazardGeoJson) {
      const body: OrsRequestBody = { coordinates: [start, end], format: 'json' };
      if (avoidPolygons) body.options = { avoid_polygons: avoidPolygons };
      const response = await openRouteService.post(`/${profile}`, body);
      return {
        data: assertValidRouteResponse(response.data),
        isInDangerZone: false,
        usedAvoidance: !!avoidPolygons,
        exitPoint: null,
        dangerCoords: [],
        destinoFinalCoord: null,
      };
    }

    // ── Está en zona de peligro ───────────────────────────────────────────
    //
    // Llamada 1 en serie hacia cada destino, sin avoid_polygons.
    // Criterio principal: menor exitIndex (sale más rápido del polígono).
    // Criterio de desempate: menor duración total.
    //
    // El destino ganador se usa como end en la Llamada 2 — así ambas llamadas
    // van al mismo destino y el tramo azul llega a donde corresponde.
    //
    const destinos = allDestinos ?? [{ id: 0, lat: end[1], lng: end[0], nombre: 'Destino', tipo: 'punto_encuentro' }];

    let bestExitDist = Infinity;
    let bestDuration = Infinity;
    let bestExitPoint: [number, number] | null = null;
    let bestExactExit: Coord | null = null;
    let bestDangerCoords: Coord[] = [];
    let bestDestino: Destino | null = null;

    for (const destino of destinos) {
      try {
        const destinoCoord: [number, number] = [destino.lng, destino.lat];
        const res = await openRouteService.post(`/${profile}`, {
          coordinates: [start, destinoCoord],
          format: 'json',
        });

        const validated = assertValidRouteResponse(res.data);
        const enc = validated.routes[0].geometry;

        const coords = (polyline.decode(enc) as [number, number][])
          .map(([lat, lng]) => ({ latitude: lat, longitude: lng }));

        const exitIndex = coords.findIndex(
          (c) => !isPointInAnyPolygonOrMulti(c, hazardGeoJson)
        );

        if (exitIndex === -1) {
          continue;
        }

        const duration = validated.routes[0].summary?.duration ?? Infinity;

        const exitDistMeters = distanceAlongRoute(coords, exitIndex);

        const esMejorSalida = exitDistMeters < bestExitDist;
        const esEmpateSalida = exitDistMeters === bestExitDist && duration < bestDuration;

        if (esMejorSalida || esEmpateSalida) {
          // Punto exacto de cruce con el borde del polígono, sobre el mismo
          // tramo de vía [exitIndex-1, exitIndex]. Solo se usa para render visual
          // — NO se envía a ORS (si se enviara, ORS lo snapearía a otro nodo).
          const exactExit = exitIndex > 0
            ? findPolygonExitPoint(coords[exitIndex - 1], coords[exitIndex], hazardGeoJson)
            : coords[exitIndex];

          bestExitDist = exitDistMeters;
          bestDuration = duration;
          bestDangerCoords = [...coords.slice(0, exitIndex), exactExit];
          // Para la Llamada 2 seguimos usando el punto de ORS (garantizado en grafo de vías).
          bestExitPoint = [coords[exitIndex].longitude, coords[exitIndex].latitude];
          bestExactExit = exactExit;
          bestDestino = destino;
        }
      } catch {
        // Un destino con error no debe abortar la búsqueda; se intentan los demás.
      }
    }

    // Si ningún destino tiene salida viable → ruta directa sin tramo rojo
    if (bestExitDist === Infinity || !bestExitPoint || !bestDestino) {
      const body: OrsRequestBody = { coordinates: [start, end], format: 'json' };
      const response = await openRouteService.post(`/${profile}`, body);
      return {
        data: assertValidRouteResponse(response.data),
        isInDangerZone: true,
        usedAvoidance: false,
        exitPoint: null,
        dangerCoords: [],
        destinoFinalCoord: null,
      };
    }

    // Llamada 2: desde exitPoint → destino GANADOR de la Llamada 1
    // Así ambas llamadas usan el mismo destino — sin inconsistencia
    const finalEnd: [number, number] = [bestDestino.lng, bestDestino.lat];

    const body2: OrsRequestBody = { coordinates: [bestExitPoint, finalEnd], format: 'json' };
    if (avoidPolygons) body2.options = { avoid_polygons: avoidPolygons };

    let safeResponse;
    let usedAvoidance = !!avoidPolygons;
    try {
      safeResponse = await openRouteService.post(`/${profile}`, body2);
    } catch (firstError: unknown) {
      // ORS lanza AxiosError casi siempre, pero un fallo de red local
      // (offline, timeout, TLS) puede dar objetos sin `.response`. No
      // asumimos forma: `err as { response?: { status?: number } }`.
      const status =
        (firstError as { response?: { status?: number } } | null | undefined)
          ?.response?.status;
      if (avoidPolygons && typeof status === 'number' && RETRYABLE_ORS_STATUSES.includes(status)) {
        safeResponse = await openRouteService.post(`/${profile}`, {
          coordinates: [bestExitPoint, finalEnd],
          format: 'json',
        });
        usedAvoidance = false;
      } else if (status === 429) {
        throw new Error('Límite de peticiones alcanzado. Intenta en unos segundos.');
      } else {
        throw firstError;
      }
    }

    return {
      data: assertValidRouteResponse(safeResponse.data),
      isInDangerZone: true,
      usedAvoidance,
      // exitPoint expone el cruce exacto con el borde del polígono (punto de
      // display, sobre la vía) para que el render del azul empalme sin hueco.
      exitPoint: bestExactExit,
      dangerCoords: bestDangerCoords,
      destinoFinalCoord: { lat: bestDestino.lat, lng: bestDestino.lng, nombre: bestDestino.nombre },
    };

  } catch (error) {
    throw error;
  }
};
 