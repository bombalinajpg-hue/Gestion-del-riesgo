/**
 * Hook para suscripción al GPS + heading, con cleanup robusto y
 * soporte para mock de desarrollo.
 *
 * Encapsula:
 *  - Chequeo de permisos + servicios de ubicación.
 *  - getLastKnownPosition (fix rápido inicial).
 *  - watchPositionAsync + watchHeadingAsync con cleanup que maneja el
 *    caso de unmount durante el await (la suscripción recién creada se
 *    libera para no drenar batería).
 *  - Si `EXPO_PUBLIC_DEV_MOCK_LOCATION=1`, usa coords fijas en Santa
 *    Rosa y salta todo el stack real del GPS.
 *  - Filtrado de `heading`: `trueHeading` puede ser -1 cuando no hay
 *    fix; lo normalizamos a 0.
 */

import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { DEV_MOCK_LOCATION, MOCK_LOCATION_COORDS } from "../utils/devMock";

export type LocationError = "denied" | "disabled" | "error";

export interface UseLocationTrackingResult {
  location: Location.LocationObjectCoords | null;
  heading: number;
  loading: boolean;
  locationError: LocationError | null;
}

export function useLocationTracking(): UseLocationTrackingResult {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [locationError, setLocationError] = useState<LocationError | null>(null);
  const [loading, setLoading] = useState(true);
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    if (DEV_MOCK_LOCATION) {
      setLocation(MOCK_LOCATION_COORDS);
      setLoading(false);
      setHeading(0);
      return;
    }
    let locSub: Location.LocationSubscription | undefined;
    let headSub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync();
        if (cancelled) return;
        if (!enabled) { setLocationError("disabled"); setLoading(false); return; }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== "granted") { setLocationError("denied"); setLoading(false); return; }
        try {
          const fix = await Location.getLastKnownPositionAsync();
          if (cancelled) return;
          if (fix) { setLocation(fix.coords); setLoading(false); }
        } catch (e) {
          console.warn("[useLocationTracking] getLastKnownPositionAsync:", e);
        }
        // Si el cleanup corrió durante el await, liberamos la sub que
        // quedó colgando — de lo contrario seguiría emitiendo eventos
        // sobre un componente desmontado y drenaría batería.
        locSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 3 },
          (loc) => { if (!cancelled) { setLocation(loc.coords); setLoading(false); } },
        );
        if (cancelled) { locSub.remove(); locSub = undefined; return; }
        headSub = await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          // expo-location devuelve -1 cuando el dispositivo no tiene
          // brújula o el sensor aún no se estabilizó. Ignoramos esos
          // eventos en vez de clamp a 0: "apuntando al norte" sería
          // información falsa. Sin actualización, el último heading
          // válido (o el 0 inicial) persiste.
          const raw = h.trueHeading ?? h.magHeading ?? -1;
          if (raw < 0) return;
          setHeading(raw % 360);
        });
        if (cancelled) { headSub.remove(); headSub = undefined; return; }
      } catch (e) {
        console.warn("[useLocationTracking] setup:", e);
        if (!cancelled) { setLocationError("error"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; locSub?.remove(); headSub?.remove(); };
  }, []);

  return { location, heading, loading, locationError };
}
