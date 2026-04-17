export type RouteProfile = "driving-car" | "foot-walking" | "cycling-regular";
export type EmergencyType = 'ninguna' | 'inundacion' | 'movimiento_en_masa' | 'avenida_torrencial';
export type StartMode = 'gps' | 'manual' | 'address';

export interface StartPoint {
    lat: number;
    lng: number;
}

export interface Destino {
  id: number;
  nombre: string;
  tipo: string;
  lat: number;
  lng: number;
}

export interface Institucion {
  id: number;
  nombre: string;
  tipo: string;
  lat: number;
  lng: number;
}

export interface DestinoFinal {
  nombre: string;
  lat: number;
  lng: number;
}

export interface HazardFeatureProperties {
  Categoria?: 'Baja' | 'Media' | 'Alta';
  [key: string]: unknown;
}