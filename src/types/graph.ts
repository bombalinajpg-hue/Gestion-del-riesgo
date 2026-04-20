/**
 * Tipos del motor de ruteo local y del sistema de reportes ciudadanos.
 *
 * NOTA: este archivo reemplaza al anterior. Los cambios:
 *   - CitizenReport ahora incluye `photoUri` (ruta local del archivo)
 *     y `severity` ('leve' | 'moderada' | 'grave').
 */

export type LatLng = { lat: number; lng: number };

export type RouteProfile = 'foot-walking' | 'cycling-regular' | 'driving-car';

export type HazardCategory = 'Baja' | 'Media' | 'Alta';

export type EmergencyType =
  | 'ninguna'
  | 'inundacion'
  | 'movimiento_en_masa'
  | 'avenida_torrencial';

// ─── GRAFO ──────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: number;
  lat: number;
  lng: number;
  tag?: string;
}

export interface GraphEdge {
  from: number;
  to: number;
  lengthMeters: number;
  costSeconds: {
    'foot-walking': number;
    'cycling-regular': number;
    'driving-car': number;
  };
  hazardByType?: Partial<Record<Exclude<EmergencyType, 'ninguna'>, HazardCategory>>;
  highway?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  idToIndex: Record<number, number>;
  edgesOut: number[][];
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  meta: {
    source: string;
    builtAt: string;
    area: string;
    nodeCount: number;
    edgeCount: number;
  };
}

// ─── ISÓCRONAS ──────────────────────────────────────────────────────────────

export interface IsochroneTable {
  entries: {
    timeSeconds: number;
    destNodeId: number;
    destName: string;
  }[];
  profile: RouteProfile;
  emergencyType: EmergencyType;
  builtAt: string;
  sourceDestIds: number[];
  graphHash: string;
}

// ─── REPORTES CIUDADANOS ────────────────────────────────────────────────────

export type ReportType =
  | 'bloqueo_vial'
  | 'sendero_obstruido'
  | 'refugio_saturado'
  | 'refugio_cerrado'
  | 'inundacion_local'
  | 'deslizamiento_local'
  | 'riesgo_electrico'
  | 'otro';

/** Severidad reportada por el usuario — define cuánto urge atender */
export type ReportSeverity = 'leve' | 'moderada' | 'grave';

export interface CitizenReport {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  createdAt: string;
  deviceId: string;
  note?: string;
  /** Severidad declarada por el reportante (opcional) */
  severity?: ReportSeverity;
  /** URI local de la foto adjunta (expo-image-picker result.uri) */
  photoUri?: string;
  status: 'pendiente' | 'confirmado' | 'expirado';
  confirmationCount: number;
}

export interface PublicAlert {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  supportCount: number;
  uniqueDeviceCount: number;
  firstReportAt: string;
  lastReportAt: string;
  reportIds: string[];
  confidence: number;
  /** Severidad promedio del cluster — eleva prioridad si la mayoría reporta grave */
  aggregatedSeverity?: ReportSeverity;
  /** Alguna de las fotos del cluster (la más reciente) — para previsualizar */
  samplePhotoUri?: string;
}

// ─── RESULTADO DE RUTEO ─────────────────────────────────────────────────────

export interface LocalRouteResult {
  path: GraphNode[];
  polyline: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  algorithm: 'dijkstra' | 'a-star' | 'time-dependent-dijkstra';
  affectedByReports: boolean;
  destinationNodeId: number;
  destinationName?: string;
  /**
   * Verdadero cuando la ruta vino del fallback A*: TDD no encontró un
   * camino que llegue antes del frente, así que el motor devolvió "la
   * menos mala" con A*. La UI debe advertir al usuario que el camino
   * cruza zonas que podrían estar comprometidas.
   */
  isRiskyFallback: boolean;
}
