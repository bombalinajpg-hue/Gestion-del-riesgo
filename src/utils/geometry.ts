/**
 * Utilidades geométricas para validación de rutas y polígonos
 * Incluye detección de intersecciones y punto-en-polígono
 */

/** Punto geográfico con latitud y longitud */
export type Point = { latitude: number; longitude: number };

/**
 * Detecta si dos segmentos de línea se intersectan usando orientación CCW
 */
function linesIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  function ccw(a: Point, b: Point, c: Point): boolean {
    return (c.latitude - a.latitude) * (b.longitude - a.longitude) >
           (b.latitude - a.latitude) * (c.longitude - a.longitude);
  }
  return (
    ccw(p1, q1, q2) !== ccw(p2, q1, q2) &&
    ccw(p1, p2, q1) !== ccw(p1, p2, q2)
  );
}

/**
 * Verifica si una ruta intersecta con alguna zona bloqueada
 */
export function routeIntersectsBlocked(
  route: Point[],
  blocked: GeoJSON.FeatureCollection
): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    for (const feature of blocked.features) {
      if (feature.geometry.type !== 'Polygon') continue;
      const ring = feature.geometry.coordinates[0];
      for (let j = 0; j < ring.length - 1; j++) {
        const q1 = { latitude: ring[j][1], longitude: ring[j][0] };
        const q2 = { latitude: ring[j + 1][1], longitude: ring[j + 1][0] };
        if (linesIntersect(p1, p2, q1, q2)) return true;
      }
    }
  }
  return false;
}

/**
 * Determina si un punto está dentro de un polígono usando ray casting
 */
export function isPointInPolygon(
  point: Point,
  polygonCoords: number[][][]
): boolean {
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;
  const ring = polygonCoords[0];
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
 * Encuentra el punto más cercano en el borde exterior de la zona de amenaza.
 * Solo considera puntos de salida que, al cruzarlos, lleven a un punto
 * completamente fuera de TODOS los polígonos del GeoJSON.
 * Esto evita que el punto de salida sea un borde interno entre zonas Media y Alta.
 */
export function findNearestExitPoint(
  point: Point,
  geoJson: GeoJSON.FeatureCollection
): Point | null {
  let nearestPoint: Point | null = null;
  let minDistance = Infinity;

  // Pequeño offset para verificar si el candidato lleva afuera de todos los polígonos
  const OFFSET = 0.00002;

  const isOutsideAll = (candidate: Point, fromPoint: Point): boolean => {
    // Calcular dirección desde el punto original hacia el candidato
    const dx = candidate.longitude - fromPoint.longitude;
    const dy = candidate.latitude - fromPoint.latitude;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return false;

    // Punto ligeramente más allá del borde
    const outside: Point = {
      latitude: candidate.latitude + (dy / len) * OFFSET,
      longitude: candidate.longitude + (dx / len) * OFFSET,
    };

    // Verificar que ese punto esté fuera de todos los polígonos
    return !isPointInAnyPolygonOrMulti(outside, geoJson);
  };

  const checkRing = (ring: number[][], containingFeature: boolean) => {
    if (!containingFeature) return;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = { latitude: ring[i][1], longitude: ring[i][0] };
      const b = { latitude: ring[i + 1][1], longitude: ring[i + 1][0] };
      const candidate = nearestPointOnSegment(point, a, b);

      // Solo considerar si cruzar este borde lleva afuera de todos los polígonos
      if (!isOutsideAll(candidate, point)) continue;

      const dist = euclideanDistance(point, candidate);
      if (dist < minDistance) {
        minDistance = dist;
        nearestPoint = candidate;
      }
    }
  };

  for (const f of geoJson.features) {
    if (f.geometry.type === 'Polygon') {
      const isContaining = isPointInPolygon(point, f.geometry.coordinates);
      f.geometry.coordinates.forEach((ring) => checkRing(ring, isContaining));
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const polygonCoords of f.geometry.coordinates) {
        const isContaining = isPointInPolygon(point, polygonCoords);
        polygonCoords.forEach((ring) => checkRing(ring, isContaining));
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

/** Distancia euclidiana simple entre dos puntos */
function euclideanDistance(a: Point, b: Point): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  return Math.sqrt(dx * dx + dy * dy);
}