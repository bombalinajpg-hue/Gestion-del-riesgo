export type RouteProfile = "driving-car" | "foot-walking" | "cycling-regular";
export type EmergencyType = 'ninguna' | 'inundacion' | 'movimiento_en_masa' | 'avenida_torrencial';
type BlockedRoute = {
  type: 'LineString';
  profile: RouteProfile;
  reason: EmergencyType;
  coordinates: number[][];
};
type BlockedRouteData = {
  blockedRoutes: BlockedRoute[];
};
export type StartMode = 'gps' | 'manual' | 'address';
export interface StartPoint {
    lat: number;
    lng: number;
}