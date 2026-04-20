/**
 * Hook que encapsula el cálculo de ruta y todo el estado derivado.
 *
 * Antes vivía como ~150 líneas inline en MapViewContainer, mezcladas
 * con UI. Aquí queda aislado: los consumidores pasan inputs (ubicación,
 * grafo, parámetros del ctx) y obtienen estado de ruta + una función
 * `calcularRuta(markAsEvacuando)` para disparar el cálculo.
 *
 * Responsabilidades:
 *  - AbortController para cancelar cálculos en vuelo (double-tap seguro).
 *  - Modo "closest": si falta destinoFinal, usa `findClosestViaGraph`
 *    con la tabla de isócronas si está disponible; si no, cae a
 *    haversine. Recuerda cuál método se usó para recomputar cuando la
 *    tabla llegue después (lastClosestUsedIsoRef).
 *  - Post-procesado: `splitRouteByHazardExit` para dibujar segmento
 *    peligroso aparte. Alert una sola vez si el usuario empieza dentro
 *    de zona Alta (`alertaDangerMostrada`).
 *  - TDD → A* fallback: si el motor marca `isRiskyFallback`, Alert
 *    avisando que no hay camino garantizado.
 *
 * Además centraliza los effects que limpian el estado de ruta cuando
 * cambian parámetros aguas arriba (`startMode`, `startPoint`), y el
 * effect que auto-actualiza `destinoFinal` con la selección del drawer.
 */

import { Alert } from "react-native";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Location from "expo-location";
import type { IsochroneTable } from "../types/graph";
import type {
  Destino,
  DestinoFinal,
  EmergencyType,
  HazardFeatureProperties,
  RouteProfile,
  StartMode,
  StartPoint,
} from "../types/types";
import { computeRoute } from "../services/localRouter";
import { queryFromLocation } from "../services/isochroneService";
import { getGraph } from "../services/graphService";
import {
  findPolygonExitPoint,
  isPointInAnyPolygonOrMulti,
} from "../utils/geometry";

type HazardCollection = FeatureCollection<Geometry, HazardFeatureProperties>;
type LatLngMarker = { latitude: number; longitude: number };

export interface UseRoutePlanningParams {
  location: Location.LocationObjectCoords | null;
  graphReady: boolean;
  puntosEncuentro: Destino[];
  emergencyType: EmergencyType;
  routeProfile: RouteProfile | null;
  startMode: StartMode;
  startPoint: StartPoint | null;
  destinationMode: "manual" | "closest";
  selectedDestination: Destino | null;
  selectedInstitucion: DestinoFinal | null;
  isoTable: IsochroneTable | null;
  computeIso: () => Promise<IsochroneTable | null>;
  /** Las capas GeoJSON filtradas por emergencyType; pasadas por el caller. */
  hazardByEmergency: {
    inundacion: HazardCollection;
    movimiento_en_masa: HazardCollection;
    avenida_torrencial: HazardCollection;
  };
}

export interface UseRoutePlanningResult {
  routeCoords: LatLngMarker[];
  dangerSegment: LatLngMarker[];
  destinoFinal: DestinoFinal | null;
  setDestinoFinal: React.Dispatch<React.SetStateAction<DestinoFinal | null>>;
  rutaSugerida: boolean;
  evacuando: boolean;
  setEvacuando: React.Dispatch<React.SetStateAction<boolean>>;
  rutaRiesgosa: boolean;
  resumenRuta: { distancia: string; tiempo: string } | null;
  alertaDangerMostrada: boolean;
  setAlertaDangerMostrada: React.Dispatch<React.SetStateAction<boolean>>;
  calcularRuta: (markAsEvacuando: boolean) => Promise<void>;
  /** Limpia todo el estado de ruta (rutaSugerida, evacuando, coords, etc.). */
  resetRouteState: () => void;
}

function findClosestByHaversine<T extends { lat: number; lng: number }>(
  user: { latitude: number; longitude: number },
  items: T[],
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const it of items) {
    const φ1 = (user.latitude * Math.PI) / 180;
    const φ2 = (it.lat * Math.PI) / 180;
    const Δφ = ((it.lat - user.latitude) * Math.PI) / 180;
    const Δλ = ((it.lng - user.longitude) * Math.PI) / 180;
    const x =
      Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const d = 6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    if (d < bestDist) { bestDist = d; best = it; }
  }
  return best;
}

function findClosestViaGraph(
  userLat: number,
  userLng: number,
  destinations: Destino[],
  isoTable: IsochroneTable | null,
): Destino | null {
  if (isoTable) {
    try {
      const graph = getGraph();
      const query = queryFromLocation(userLat, userLng, isoTable, graph);
      if (query && query.destName) {
        const dest = destinations.find((d) => d.nombre === query.destName);
        if (dest) return dest;
      }
    } catch (e) {
      console.warn("[useRoutePlanning] findClosestViaGraph:", e);
    }
  }
  return findClosestByHaversine(
    { latitude: userLat, longitude: userLng },
    destinations,
  );
}

function splitRouteByHazardExit(
  polyline: { lat: number; lng: number }[],
  hazardGeoJson: FeatureCollection | undefined,
): { isInDangerZone: boolean; dangerCoords: LatLngMarker[]; routeCoords: LatLngMarker[] } {
  const toLL = (p: { lat: number; lng: number }): LatLngMarker =>
    ({ latitude: p.lat, longitude: p.lng });
  if (!hazardGeoJson || polyline.length === 0)
    return { isInDangerZone: false, dangerCoords: [], routeCoords: polyline.map(toLL) };
  const startInside = isPointInAnyPolygonOrMulti(toLL(polyline[0]), hazardGeoJson);
  if (!startInside)
    return { isInDangerZone: false, dangerCoords: [], routeCoords: polyline.map(toLL) };
  const coordsLL = polyline.map(toLL);
  const exitIndex = coordsLL.findIndex((c) => !isPointInAnyPolygonOrMulti(c, hazardGeoJson));
  if (exitIndex === -1) return { isInDangerZone: true, dangerCoords: coordsLL, routeCoords: [] };
  const exitPoint = exitIndex > 0
    ? findPolygonExitPoint(coordsLL[exitIndex - 1], coordsLL[exitIndex], hazardGeoJson)
    : coordsLL[exitIndex];
  return {
    isInDangerZone: true,
    dangerCoords: [...coordsLL.slice(0, exitIndex), exitPoint],
    routeCoords: [exitPoint, ...coordsLL.slice(exitIndex)],
  };
}

function formatRouteSummary(dm: number, ds: number) {
  const distancia = dm >= 1000 ? `${(dm / 1000).toFixed(1)} km` : `${Math.round(dm)} m`;
  const mins = Math.round(ds / 60);
  const tiempo = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}min`;
  return { distancia, tiempo };
}

export function useRoutePlanning(
  params: UseRoutePlanningParams,
): UseRoutePlanningResult {
  const {
    location,
    graphReady,
    puntosEncuentro,
    emergencyType,
    routeProfile,
    startMode,
    startPoint,
    destinationMode,
    selectedDestination,
    selectedInstitucion,
    isoTable,
    computeIso,
    hazardByEmergency,
  } = params;

  const [routeCoords, setRouteCoords] = useState<LatLngMarker[]>([]);
  const [dangerSegment, setDangerSegment] = useState<LatLngMarker[]>([]);
  const [destinoFinal, setDestinoFinal] = useState<DestinoFinal | null>(null);
  const [rutaSugerida, setRutaSugerida] = useState(false);
  const [evacuando, setEvacuando] = useState(false);
  const [rutaRiesgosa, setRutaRiesgosa] = useState(false);
  const [resumenRuta, setResumenRuta] = useState<{ distancia: string; tiempo: string } | null>(null);
  const [alertaDangerMostrada, setAlertaDangerMostrada] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastClosestUsedIsoRef = useRef<boolean>(false);

  // Mantenemos los parámetros "de usuario" en un ref para que calcularRuta
  // pueda leer valores frescos sin quebrar la estabilidad de la función.
  const inputsRef = useRef({
    location, graphReady, puntosEncuentro, emergencyType, routeProfile,
    startMode, startPoint, destinationMode,
    selectedDestination, selectedInstitucion, isoTable, computeIso,
    hazardByEmergency,
  });
  inputsRef.current = {
    location, graphReady, puntosEncuentro, emergencyType, routeProfile,
    startMode, startPoint, destinationMode,
    selectedDestination, selectedInstitucion, isoTable, computeIso,
    hazardByEmergency,
  };

  const resetRouteState = () => {
    abortRef.current?.abort();
    setRouteCoords([]);
    setDangerSegment([]);
    setDestinoFinal(null);
    setRutaSugerida(false);
    setEvacuando(false);
    setRutaRiesgosa(false);
    setResumenRuta(null);
    setAlertaDangerMostrada(false);
    lastClosestUsedIsoRef.current = false;
  };

  const calcularRuta = async (markAsEvacuando: boolean): Promise<void> => {
    const p = inputsRef.current;
    if (!p.location || !p.graphReady) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let finalDestination: DestinoFinal | null =
      p.selectedInstitucion ?? p.selectedDestination;
    let closestUsedIso = false;

    if (!finalDestination && p.destinationMode === "closest") {
      const userLat = p.startMode === "manual" && p.startPoint ? p.startPoint.lat : p.location.latitude;
      const userLng = p.startMode === "manual" && p.startPoint ? p.startPoint.lng : p.location.longitude;
      let iso = p.isoTable;
      if (!iso && p.emergencyType !== "ninguna") {
        iso = await p.computeIso();
      }
      closestUsedIso = iso !== null;
      finalDestination = findClosestViaGraph(userLat, userLng, p.puntosEncuentro, iso);
    }
    if (!finalDestination) return;
    setDestinoFinal(finalDestination);
    lastClosestUsedIsoRef.current = closestUsedIso;

    const hazardSource: HazardCollection | undefined =
      p.emergencyType === "inundacion" ? p.hazardByEmergency.inundacion
        : p.emergencyType === "movimiento_en_masa" ? p.hazardByEmergency.movimiento_en_masa
        : p.emergencyType === "avenida_torrencial" ? p.hazardByEmergency.avenida_torrencial
        : undefined;
    const hazardGeoJson: FeatureCollection | undefined = hazardSource && {
      type: "FeatureCollection",
      features: hazardSource.features.filter(
        (f): f is Feature<Geometry, HazardFeatureProperties> =>
          f.properties?.Categoria === "Media" || f.properties?.Categoria === "Alta",
      ),
    };

    const startLat = p.startMode === "manual" && p.startPoint ? p.startPoint.lat : p.location.latitude;
    const startLng = p.startMode === "manual" && p.startPoint ? p.startPoint.lng : p.location.longitude;
    const profile = p.routeProfile ?? "foot-walking";
    const alternativeEnds =
      (!p.selectedInstitucion && !p.selectedDestination && p.destinationMode === "closest")
        ? p.puntosEncuentro.map((d) => ({ lat: d.lat, lng: d.lng, name: d.nombre }))
        : undefined;

    try {
      const result = await computeRoute({
        start: { lat: startLat, lng: startLng },
        end: { lat: finalDestination.lat, lng: finalDestination.lng },
        profile, emergencyType: p.emergencyType, algorithm: "time-dependent", alternativeEnds,
      });
      if (controller.signal.aborted) return;
      if (!result) {
        if (markAsEvacuando) Alert.alert("Ruta no disponible", "No se encontró un camino.");
        setRutaSugerida(false);
        return;
      }
      const split = splitRouteByHazardExit(result.polyline, hazardGeoJson);
      if (markAsEvacuando && split.isInDangerZone && split.dangerCoords.length > 0 && !alertaDangerMostrada) {
        setAlertaDangerMostrada(true);
        Alert.alert("⚠️ Estás en zona de riesgo", "Sigue la ruta para salir del área peligrosa.", [{ text: "Entendido" }]);
      }
      if (alternativeEnds && result.destinationName && result.destinationName !== finalDestination.nombre) {
        const chosen = p.puntosEncuentro.find((d) => d.nombre === result.destinationName);
        if (chosen) setDestinoFinal({ nombre: chosen.nombre, lat: chosen.lat, lng: chosen.lng });
      }
      setResumenRuta(formatRouteSummary(result.distanceMeters, result.durationSeconds));
      setDangerSegment(split.dangerCoords);
      setRouteCoords(split.routeCoords);
      setRutaRiesgosa(result.isRiskyFallback);
      if (markAsEvacuando && result.isRiskyFallback) {
        Alert.alert(
          "⚠️ Sin ruta garantizada",
          "El modelo no encontró un camino que llegue antes del frente de la amenaza. Esta es la ruta menos expuesta que existe. Actúa con extrema precaución.",
          [{ text: "Entendido" }],
        );
      }
      if (markAsEvacuando) { setEvacuando(true); setRutaSugerida(false); }
      else { setRutaSugerida(true); }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("[useRoutePlanning] computeRoute:", err);
      if (markAsEvacuando) Alert.alert("Error", "No se pudo calcular la ruta.");
    }
  };

  // Sincroniza `destinoFinal` con la selección del drawer: cuando el
  // usuario pica un refugio/institución, lo reflejamos como destino.
  useEffect(() => {
    const picked = selectedInstitucion ?? selectedDestination;
    if (picked) {
      setDestinoFinal({ nombre: picked.nombre, lat: picked.lat, lng: picked.lng });
    }
  }, [selectedDestination, selectedInstitucion]);

  // Limpia el estado de ruta cuando el usuario cambia parámetros aguas
  // arriba (startMode o reelige startPoint manual).
  useEffect(() => {
    setRouteCoords([]);
    setDangerSegment([]);
    setRutaSugerida(false);
    setResumenRuta(null);
  }, [startMode]);

  useEffect(() => {
    if (startMode === "manual" && startPoint) {
      setRouteCoords([]);
      setDangerSegment([]);
      setRutaSugerida(false);
      setResumenRuta(null);
    }
  }, [startPoint, startMode]);

  // Memo del closestPreview para que la UI muestre el refugio sugerido
  // antes de disparar la ruta real. Sin dependencia circular con calcularRuta.
  const _closestPreview = useMemo((): Destino | null => {
    if (destinoFinal) return null;
    if (destinationMode !== "closest") return null;
    if (!location || !graphReady) return null;
    if (emergencyType === "ninguna") return null;
    const lat = startMode === "manual" && startPoint ? startPoint.lat : location.latitude;
    const lng = startMode === "manual" && startPoint ? startPoint.lng : location.longitude;
    return findClosestViaGraph(lat, lng, puntosEncuentro, isoTable);
  }, [destinoFinal, destinationMode, location, graphReady, emergencyType, startMode, startPoint, isoTable, puntosEncuentro]);
  // `_closestPreview` queda accesible como propiedad derivada si el
  // caller lo necesita exportar — se devuelve abajo.
  void _closestPreview;

  return {
    routeCoords,
    dangerSegment,
    destinoFinal,
    setDestinoFinal,
    rutaSugerida,
    evacuando,
    setEvacuando,
    rutaRiesgosa,
    resumenRuta,
    alertaDangerMostrada,
    setAlertaDangerMostrada,
    calcularRuta,
    resetRouteState,
  };
}
