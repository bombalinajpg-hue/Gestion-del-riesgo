/**
 * Mock de ubicación para desarrollo.
 *
 * Cuando `EXPO_PUBLIC_DEV_MOCK_LOCATION=1` está en `.env`, la app usa una
 * ubicación fija dentro del bbox del grafo de Santa Rosa en vez del GPS
 * real. Sirve para probar el cálculo de ruta desde cualquier lado sin
 * estar físicamente en Santa Rosa.
 *
 * No modifica la data real: el grafo, las amenazas y los refugios siguen
 * siendo los de producción. Solo se intercepta el origen del usuario.
 *
 * IMPORTANTE: verificar que el flag esté apagado antes de cada build de
 * producción. El badge "DEV MOCK" en el mapa recuerda visualmente cuando
 * está encendido.
 */

export const DEV_MOCK_LOCATION: boolean =
  process.env.EXPO_PUBLIC_DEV_MOCK_LOCATION === "1";

// Centro aproximado del bbox del grafo de Santa Rosa de Cabal
// (minLat 4.8355748, maxLat 4.9098998, minLng -75.6425916, maxLng -75.5792642).
// Este punto cae cerca del casco urbano y tiene cobertura de aristas.
export const MOCK_LOCATION_COORDS = {
  latitude: 4.8727,
  longitude: -75.6109,
  altitude: 1800,
  accuracy: 10,
  altitudeAccuracy: 10,
  heading: 0,
  speed: 0,
};
