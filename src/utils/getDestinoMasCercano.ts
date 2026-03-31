/**
 * Utilidad para encontrar el destino más cercano a una ubicación dada
 * Usa distancia Haversine para calcular proximidad real sobre la superficie terrestre
 */

/** Estructura de un destino */
type Destino = {
  id: number;
  nombre: string;
  tipo: string;
  lat: number;
  lng: number;
};

/**
 * Calcula la distancia real en metros entre dos coordenadas geográficas
 * usando la fórmula Haversine — tiene en cuenta la curvatura de la Tierra
 */
function getDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLambda = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Encuentra el destino más cercano a una ubicación usando distancia Haversine
 * @param location - Ubicación actual del usuario
 * @param destinos - Array de destinos disponibles
 * @returns El destino más cercano o null si no hay destinos
 */
export function getDestinoMasCercano(
  location: { latitude: number; longitude: number },
  destinos: Destino[]
): Destino | null {
  let closest: Destino | null = null;
  let minDistance = Infinity;

  for (const destino of destinos) {
    // ✅ Haversine — distancia real en metros, no euclidiana
    const distance = getDistance(
      location.latitude, location.longitude,
      destino.lat, destino.lng
    );

    if (distance < minDistance) {
      minDistance = distance;
      closest = destino;
    }
  }

  return closest;
}