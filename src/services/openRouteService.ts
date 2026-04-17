import polyline from '@mapbox/polyline';
import axios from 'axios';
import { isPointInAnyPolygonOrMulti } from '../utils/geometry';

const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY ?? '';

const openRouteService = axios.create({
  baseURL: 'https://api.openrouteservice.org/v2/directions',
  timeout: 10000,
  headers: {
    Authorization: ORS_API_KEY,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export interface RouteResult {
  data: any;
  isInDangerZone: boolean;
  usedAvoidance: boolean;
  exitPoint: { latitude: number; longitude: number } | null;
  dangerCoords: { latitude: number; longitude: number }[];
  // Destino final real usado en la Llamada 2 — puede diferir del `end` original
  // cuando el modo es 'closest' y la Llamada 1 encontró un destino más óptimo
  destinoFinalCoord: { lat: number; lng: number; nombre: string } | null;
}

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
  try {
    const startPoint = { latitude: start[1], longitude: start[0] };

    const isInDangerZone =
      !!hazardGeoJson?.features?.length &&
      isPointInAnyPolygonOrMulti(startPoint, hazardGeoJson);

    console.log('Usuario en zona de peligro:', isInDangerZone);

    const avoidPolygons = hazardGeoJson ? buildAvoidPolygons(hazardGeoJson) : null;

    // ── Caso normal: no está en zona de peligro ───────────────────────────
    if (!isInDangerZone || !hazardGeoJson) {
      const body: OrsRequestBody = { coordinates: [start, end], format: 'json' };
      if (avoidPolygons) body.options = { avoid_polygons: avoidPolygons };
      const response = await openRouteService.post(`/${profile}`, body);
      return {
        data: response.data,
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
    let bestDangerCoords: Coord[] = [];
    let bestDestino: Destino | null = null;

    for (const destino of destinos) {
      try {
        const destinoCoord: [number, number] = [destino.lng, destino.lat];
        const res = await openRouteService.post(`/${profile}`, {
          coordinates: [start, destinoCoord],
          format: 'json',
        });

        const enc = res.data.routes[0]?.geometry;
        if (!enc) continue;

        const coords = (polyline.decode(enc) as [number, number][])
          .map(([lat, lng]) => ({ latitude: lat, longitude: lng }));

        const exitIndex = coords.findIndex(
          (c) => !isPointInAnyPolygonOrMulti(c, hazardGeoJson)
        );

        if (exitIndex === -1) {
          console.log(`${destino.nombre}: toda la ruta dentro del peligro, descartado`);
          continue;
        }

        const duration = res.data.routes[0]?.summary?.duration ?? Infinity;
        const mins = Math.round(duration / 60);

        const exitDistMeters = distanceAlongRoute(coords, exitIndex);
        console.log(`${destino.nombre}: ${Math.round(exitDistMeters)}m hasta salida, duración=${mins} min`);

        const esMejorSalida = exitDistMeters < bestExitDist;
        const esEmpateSalida = exitDistMeters === bestExitDist && duration < bestDuration;

        if (esMejorSalida || esEmpateSalida) {
          bestExitDist = exitDistMeters;
          bestDuration = duration;
          bestDangerCoords = coords.slice(0, exitIndex + 1);
          bestExitPoint = [coords[exitIndex].longitude, coords[exitIndex].latitude];
          bestDestino = destino;
          console.log(`Nuevo mejor destino: ${destino.nombre} (${Math.round(exitDistMeters)}m hasta salida, ${mins} min)`);
        }
      } catch (e) {
        console.warn(`Error al calcular ruta a ${destino.nombre}:`, e);
      }
    }

    // Si ningún destino tiene salida viable → ruta directa sin tramo rojo
    if (bestExitDist === Infinity || !bestExitPoint || !bestDestino) {
      console.warn('Ningún destino tiene salida viable, calculando ruta directa');
      const body: OrsRequestBody = { coordinates: [start, end], format: 'json' };
      const response = await openRouteService.post(`/${profile}`, body);
      return {
        data: response.data,
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
    console.log(`Destino elegido: ${bestDestino.nombre} (${Math.round(bestExitDist)}m hasta salida, ${Math.round(bestDuration / 60)} min)`);

    const body2: OrsRequestBody = { coordinates: [bestExitPoint, finalEnd], format: 'json' };
    if (avoidPolygons) body2.options = { avoid_polygons: avoidPolygons };

    let safeResponse;
    let usedAvoidance = !!avoidPolygons;
    try {
      safeResponse = await openRouteService.post(`/${profile}`, body2);
    } catch (firstError: any) {
      const status = firstError.response?.status;
      if (avoidPolygons && RETRYABLE_ORS_STATUSES.includes(status)) {
        console.warn('ORS rechazó avoid_polygons en tramo azul, reintentando sin ellos');
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

    const exitCoord = {
      latitude: (bestExitPoint as [number, number])[1],
      longitude: (bestExitPoint as [number, number])[0],
    };

    return {
      data: safeResponse.data,
      isInDangerZone: true,
      usedAvoidance,
      exitPoint: exitCoord,
      dangerCoords: bestDangerCoords,
      destinoFinalCoord: { lat: bestDestino.lat, lng: bestDestino.lng, nombre: bestDestino.nombre },
    };

  } catch (error: any) {
    console.error('Error al obtener la ruta:', error.response?.data || error);
    throw error;
  }
};
 