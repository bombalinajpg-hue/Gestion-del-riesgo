/**
 * Mock de ubicación para desarrollo.
 *
 * Cuando `EXPO_PUBLIC_DEV_MOCK_LOCATION=1` está en `.env` Y la app corre
 * en modo dev (`__DEV__ === true`), la app usa una ubicación fija dentro
 * del bbox del grafo de Santa Rosa en vez del GPS real. Sirve para
 * probar el cálculo de ruta desde cualquier lado sin estar físicamente
 * en Santa Rosa.
 *
 * No modifica la data real: el grafo, las amenazas y los puntos de
 * encuentro siguen siendo los de producción. Solo se intercepta el
 * origen del usuario.
 *
 * Guard `__DEV__`: en un APK de producción (compilado con EAS Build),
 * `__DEV__` es `false` — el mock queda forzadamente desactivado aunque
 * la variable quedara en "1" por error humano. Así una entrega a la
 * empresa nunca termina con ubicación falsa en Santa Rosa.
 */

export const DEV_MOCK_LOCATION: boolean =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_MOCK_LOCATION === "1";

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
