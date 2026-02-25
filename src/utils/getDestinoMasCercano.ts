/**
 * Utilidad para encontrar el destino más cercano a una ubicación dada
 * Usa distancia euclidiana para calcular proximidad
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
 * Encuentra el destino más cercano a una ubicación usando distancia euclidiana
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

  // Itera sobre todos los destinos para encontrar el más cercano
  for (const destino of destinos) {
    const dx = destino.lat - location.latitude;
    const dy = destino.lng - location.longitude;
    // Calcula distancia euclidiana (sin raíz para optimización)
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      closest = destino;
    }
  }

  return closest;
}