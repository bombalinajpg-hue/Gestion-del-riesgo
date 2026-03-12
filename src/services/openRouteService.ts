import axios from 'axios';
import { findNearestExitPoint, isPointInAnyPolygonOrMulti } from '../utils/geometry';

const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjQwOTUyNDJiZjFhYzQzMzc5ZmE0MDMxMGU5NmRmNjY1IiwiaCI6Im11cm11cjY0In0=';

const openRouteService = axios.create({
  baseURL: 'https://api.openrouteservice.org/v2/directions',
  headers: {
    Authorization: ORS_API_KEY,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

/**
 * Calcula ruta entre dos puntos.
 * Si el usuario está dentro de una zona de amenaza Media o Alta,
 * calcula primero una salida al borde del polígono y luego al destino.
 */
export const getRoute = async (
  start: [number, number],
  end: [number, number],
  profile: 'driving-car' | 'foot-walking' | 'cycling-regular' = 'driving-car',
  hazardGeoJson?: GeoJSON.FeatureCollection
) => {
  try {
    const startPoint = {
      latitude: start[1],
      longitude: start[0],
    };

    // Detectar si el usuario está dentro de una zona de amenaza
    const isInDangerZone =
      !!hazardGeoJson?.features?.length &&
      isPointInAnyPolygonOrMulti(startPoint, hazardGeoJson);

    console.log('Usuario en zona de peligro:', isInDangerZone);

    let coordinates: [number, number][];

    if (isInDangerZone && hazardGeoJson) {
      // Encontrar el punto de salida más cercano al borde del polígono
      const exitPoint = findNearestExitPoint(startPoint, hazardGeoJson);

      if (exitPoint) {
        console.log('Punto de salida calculado:', exitPoint);
        // Ruta de tres puntos: inicio → salida del polígono → destino
        coordinates = [
          start,
          [exitPoint.longitude, exitPoint.latitude],
          end,
        ];
      } else {
        // No se encontró punto de salida, ir directo al destino
        coordinates = [start, end];
      }
    } else {
      coordinates = [start, end];
    }

    const body = {
      coordinates,
      format: 'json',
    };

    const response = await openRouteService.post(`/${profile}`, body);

    return {
      data: response.data,
      isInDangerZone,
    };

  } catch (error: any) {
    console.error('Error al obtener la ruta:', error.response?.data || error);
    throw error;
  }
};