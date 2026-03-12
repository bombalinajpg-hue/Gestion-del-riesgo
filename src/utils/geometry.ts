/**
 * Utilidades geométricas para validación de rutas y polígonos
 * Incluye detección de intersecciones y punto-en-polígono
 */

/** Punto geográfico con latitud y longitud */
export type Point = { latitude: number; longitude: number };

/**
 * Detecta si dos segmentos de línea se intersectan usando orientación CCW
 * @param p1 - Primer punto del primer segmento
 * @param p2 - Segundo punto del primer segmento
 * @param q1 - Primer punto del segundo segmento
 * @param q2 - Segundo punto del segundo segmento
 * @returns true si los segmentos se intersectan
 */
function linesIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  /**
   * Función auxiliar CCW (counter-clockwise)
   * Determina la orientación de tres puntos
   */
  function ccw(a: Point, b: Point, c: Point): boolean {
    return (c.latitude - a.latitude) * (b.longitude - a.longitude) >
           (b.latitude - a.latitude) * (c.longitude - a.longitude);
  }

  // Dos segmentos se intersectan si tienen orientaciones opuestas
  return (
    ccw(p1, q1, q2) !== ccw(p2, q1, q2) &&
    ccw(p1, p2, q1) !== ccw(p1, p2, q2)
  );
}

/**
 * Verifica si una ruta intersecta con alguna zona bloqueada
 * @param route - Array de puntos que conforman la ruta
 * @param blocked - FeatureCollection de polígonos bloqueados
 * @returns true si la ruta cruza alguna zona bloqueada
 */
export function routeIntersectsBlocked(
  route: Point[],
  blocked: GeoJSON.FeatureCollection
): boolean {
  // Itera sobre cada segmento de la ruta
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];

    // Verifica intersección con cada polígono bloqueado
    for (const feature of blocked.features) {
      if (feature.geometry.type !== 'Polygon') continue;

      const ring = feature.geometry.coordinates[0];

      // Verifica intersección con cada lado del polígono
      for (let j = 0; j < ring.length - 1; j++) {
        const q1 = { latitude: ring[j][1], longitude: ring[j][0] };
        const q2 = { latitude: ring[j + 1][1], longitude: ring[j + 1][0] };

        if (linesIntersect(p1, p2, q1, q2)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Determina si un punto está dentro de un polígono usando ray casting
 * @param point - Punto a verificar
 * @param polygonCoords - Coordenadas del polígono [[[lng, lat]]]
 * @returns true si el punto está dentro del polígono
 */
export function isPointInPolygon(
  point: Point,
  polygonCoords: number[][][]
): boolean {
  const x = point.longitude;
  const y = point.latitude;

  let inside = false;
  const ring = polygonCoords[0];

  // Algoritmo de ray casting
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Verifica si un punto está dentro de algún polígono de una colección
 * @param point - Punto a verificar
 * @param geoJson - FeatureCollection con polígonos
 * @returns true si el punto está dentro de algún polígono
 */
export function isPointInAnyPolygon(
  point: Point,
  geoJson: GeoJSON.FeatureCollection
): boolean {
  return geoJson.features.some(
    (f) =>
      f.geometry.type === 'Polygon' &&
      isPointInPolygon(point, f.geometry.coordinates)
  );
}
/**
 * Verifica si un punto está dentro de algún polígono de una colección
 * Soporta tanto Polygon como MultiPolygon
 */
export function isPointInAnyPolygonOrMulti(
  point: Point,
  geoJson: GeoJSON.FeatureCollection
): boolean {
  return geoJson.features.some((f) => {
    if (f.geometry.type === 'Polygon') {
      return isPointInPolygon(point, f.geometry.coordinates);
    }
    if (f.geometry.type === 'MultiPolygon') {
      return f.geometry.coordinates.some((polygonCoords) =>
        isPointInPolygon(point, polygonCoords)
      );
    }
    return false;
  });
}

/**
 * Encuentra el punto más cercano en el borde de cualquier polígono
 * que contenga al punto dado. Soporta Polygon y MultiPolygon.
 * @returns El punto de salida más cercano al borde, o null si no está en ningún polígono
 */
export function findNearestExitPoint(
  point: Point,
  geoJson: GeoJSON.FeatureCollection
): Point | null {
  let nearestPoint: Point | null = null;
  let minDistance = Infinity;

  const checkRing = (ring: number[][]) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = { latitude: ring[i][1], longitude: ring[i][0] };
      const b = { latitude: ring[i + 1][1], longitude: ring[i + 1][0] };
      const candidate = nearestPointOnSegment(point, a, b);
      const dist = euclideanDistance(point, candidate);
      if (dist < minDistance) {
        minDistance = dist;
        nearestPoint = candidate;
      }
    }
  };

  for (const f of geoJson.features) {
    if (f.geometry.type === 'Polygon') {
      if (isPointInPolygon(point, f.geometry.coordinates)) {
        f.geometry.coordinates.forEach(checkRing);
      }
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const polygonCoords of f.geometry.coordinates) {
        if (isPointInPolygon(point, polygonCoords)) {
          polygonCoords.forEach(checkRing);
        }
      }
    }
  }

  return nearestPoint;
}

/** Proyecta un punto sobre un segmento AB y retorna el punto más cercano */
function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  let t = ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return {
    latitude: a.latitude + t * dy,
    longitude: a.longitude + t * dx,
  };
}

/** Distancia euclidiana simple entre dos puntos (suficiente para comparar distancias cortas) */
function euclideanDistance(a: Point, b: Point): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  return Math.sqrt(dx * dx + dy * dy);
}