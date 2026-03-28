import polyline from '@mapbox/polyline';
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

const buildAvoidPolygons = (geoJson: GeoJSON.FeatureCollection): GeoJSON.Geometry | null => {
  try {
    const polygons: GeoJSON.Position[][][] = [];
    for (const feature of geoJson.features) {
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
  } catch {
    return null;
  }
};

export const getRoute = async (
  start: [number, number],
  end: [number, number],
  profile: 'driving-car' | 'foot-walking' | 'cycling-regular' = 'driving-car',
  hazardGeoJson?: GeoJSON.FeatureCollection
) => {
  try {
    const startPoint = { latitude: start[1], longitude: start[0] };

    const isInDangerZone =
      !!hazardGeoJson?.features?.length &&
      isPointInAnyPolygonOrMulti(startPoint, hazardGeoJson);

    console.log('Usuario en zona de peligro:', isInDangerZone);

    let exitPointCoords: { latitude: number; longitude: number } | null = null;
    let dangerRouteGeometry: string | null = null;

    // ── Tramo rojo: start → exitPoint sin avoid_polygons ──────────────────
    if (isInDangerZone && hazardGeoJson) {
      const exitPoint = findNearestExitPoint(startPoint, hazardGeoJson);
      if (exitPoint) {
        exitPointCoords = exitPoint;
        try {
          const dangerResponse = await openRouteService.post(`/${profile}`, {
            coordinates: [start, [exitPoint.longitude, exitPoint.latitude]],
            format: 'json',
          });
          dangerRouteGeometry = dangerResponse.data.routes[0]?.geometry ?? null;
        } catch {
          dangerRouteGeometry = null;
        }
      }
    }

    // ── Determinar inicio del tramo azul ───────────────────────────────────
    let safeStart: [number, number];
    if (dangerRouteGeometry) {
      const decoded = polyline.decode(dangerRouteGeometry);
      const last = decoded[decoded.length - 1];
      safeStart = [last[1], last[0]]; // [lng, lat] para ORS
    } else if (exitPointCoords) {
      safeStart = [exitPointCoords.longitude, exitPointCoords.latitude];
    } else {
      safeStart = start;
    }

    // ── Tramo azul: safeStart → end con avoid_polygons ────────────────────
    const avoidPolygons = hazardGeoJson ? buildAvoidPolygons(hazardGeoJson) : null;

    const buildBody = (withAvoid: boolean) => {
      const body: any = { coordinates: [safeStart, end], format: 'json' };
      if (withAvoid && avoidPolygons) {
        body.options = { avoid_polygons: avoidPolygons };
      }
      return body;
    };

    let response;
    let usedAvoidance = false;

    try {
      if (avoidPolygons) {
        response = await openRouteService.post(`/${profile}`, buildBody(true));
        usedAvoidance = true;
      } else {
        response = await openRouteService.post(`/${profile}`, buildBody(false));
      }
    } catch (firstError: any) {
      const status = firstError.response?.status;
      const msg = JSON.stringify(firstError.response?.data || '');
      console.warn('ORS rechazó, reintentando sin avoid_polygons:', msg);
      if (avoidPolygons && (status === 400 || status === 413 || msg.includes('polygon'))) {
        response = await openRouteService.post(`/${profile}`, buildBody(false));
        usedAvoidance = false;
      } else {
        throw firstError;
      }
    }

    return {
      data: response.data,
      isInDangerZone,
      usedAvoidance,
      exitPoint: exitPointCoords,
      dangerRouteGeometry,
    };

  } catch (error: any) {
    console.error('Error al obtener la ruta:', error.response?.data || error);
    throw error;
  }
};