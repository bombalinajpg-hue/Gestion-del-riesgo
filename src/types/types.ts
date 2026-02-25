export type RouteProfile = "driving-car" | "foot-walking" | "cycling-regular";
export type EmergencyType = 'ninguna' | 'inundacion' | 'derrumbe';
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
