import axios from 'axios';
import type { Polygon } from 'geojson';
import { isPointInAnyPolygon } from '../utils/geometry';

const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjQwOTUyNDJiZjFhYzQzMzc5ZmE0MDMxMGU5NmRmNjY1IiwiaCI6Im11cm11cjY0In0=';

const openRouteService = axios.create({
  baseURL: 'https://api.openrouteservice.org/v2/directions',
  headers: {
    Authorization: ORS_API_KEY,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export const getRoute = async (
  start: [number, number],
  end: [number, number],
  profile: 'driving-car' | 'foot-walking' | 'cycling-regular' = 'driving-car',
  blockedRoutesGeoJson?: GeoJSON.FeatureCollection
) => {
  try {
    let options: any = {};

    console.log('EMERGENCIA ACTIVA:', !!blockedRoutesGeoJson?.features?.length);


    const startPoint = {
      latitude: start[1],
      longitude: start[0],
    };

    const isStartInDangerZone =
      blockedRoutesGeoJson &&
      isPointInAnyPolygon(startPoint, blockedRoutesGeoJson);

    // 👉 SOLO evitamos zonas si NO estamos dentro de una
    if (!isStartInDangerZone && blockedRoutesGeoJson) {
      const polygonCoords = blockedRoutesGeoJson.features
        .filter(
          (f): f is GeoJSON.Feature<Polygon> =>
            f.geometry.type === 'Polygon'
        )
        .map((f) => f.geometry.coordinates);

      if (polygonCoords.length > 0) {
        options.avoid_polygons = {
          type: 'MultiPolygon',
          coordinates: polygonCoords,
        };
      }
    }

    const body: any = {
      coordinates: [start, end],
      format: 'json',
      ...(Object.keys(options).length > 0 && { options }),
    };

    const response = await openRouteService.post(`/${profile}`, body);
    return response.data;
  } catch (error: any) {
    console.error(
      'Error al obtener la ruta:',
      error.response?.data || error
    );
    throw error;
  }
};
