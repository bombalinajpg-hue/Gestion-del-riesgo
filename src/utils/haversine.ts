/**
 * Distancia Haversine entre dos coordenadas geográficas, en metros.
 *
 * Es la misma fórmula que ya usas en `getDestinoMasCercano.ts` y en el
 * `haversineMeters` interno de `openRouteService.ts`. Se centraliza aquí
 * para que todos los módulos la compartan y no haya 3 implementaciones.
 */

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δφ = ((bLat - aLat) * Math.PI) / 180;
  const Δλ = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Aproximación rápida (no-trigonométrica) para distancias MUY cortas,
 * usada SOLO como heurística en A*. No válida para cálculos precisos:
 * siempre que necesites el dato real, usa `haversineMeters`.
 *
 * La heurística de A* necesita ser admisible (no sobreestimar) — esta
 * aproximación al ser ligeramente menor que la Haversine real en distancias
 * cortas (<5 km) cumple la propiedad. Para distancias mayores volvemos
 * a Haversine.
 */
export function fastHaversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(midLat);
  const y = dLat;
  return EARTH_RADIUS_METERS * Math.sqrt(x * x + y * y);
}
