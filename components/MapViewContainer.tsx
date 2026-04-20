/**
 * Componente principal del mapa — versión v4.2.
 *
 * Fixes críticos sobre v4.1:
 *   1. graphNodeId: snap manual inline con snapToNearestNode, asignando
 *      TANTO graphNodeId como graphNode (triple seguro) para que
 *      precomputeIsochrones no falle con "ningún destino linked".
 *   2. destinoFinal se actualiza apenas el usuario elige (antes solo
 *      se actualizaba tras calcular la ruta, causando que los botones
 *      Ir aquí / Street View no aparecieran hasta tocar el marcador).
 *   3. Botones "Ir aquí" + "Street View" visibles apenas se elige
 *      destino (no requieren que la ruta esté calculada).
 *
 * UX nueva:
 *   - Botón flotante "IR AQUÍ" siempre visible cuando hay destino y
 *     no estamos evacuando. Calcula ruta + entra en modo evacuación.
 *   - Botón "Ver instituciones" en pantalla principal.
 *   - Modo "elegir destino desde el mapa con isócronas".
 */

import { MaterialIcons } from "@expo/vector-icons";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import MapView, { Geojson, MapType, Marker, Polyline } from "react-native-maps";
import { useRouteContext } from "../context/RouteContext";
import avenidaTorrencialData from "../data/amenaza_avenida_torrencial.json";
import InundacionData from "../data/amenaza_inundacion.json";
import movimientoMasaData from "../data/amenaza_movimiento_en_masa.json";
import destinosRaw from "../data/destinos.json";
import rawGraph from "../data/graph.json";
import institucionesRaw from "../data/instituciones.json";
import {
  getGraph,
  linkDestinations,
  loadGraph,
  type RawGraph,
} from "../src/services/graphService";
import {
  precomputeIsochrones,
  queryFromLocation,
} from "../src/services/isochroneService";
import { computeRoute } from "../src/services/localRouter";
import { getRefugeByName } from "../src/services/refugesService";
import {
  getActiveBlockingAlerts,
  recomputePublicAlerts,
} from "../src/services/reportsService";
import type { IsochroneTable, PublicAlert } from "../src/types/graph";
import type {
  Destino,
  DestinoFinal,
  HazardFeatureProperties,
  Institucion,
} from "../src/types/types";
import type { RefugeDetails } from "../src/types/v4";
import {
  findPolygonExitPoint,
  isPointInAnyPolygonOrMulti,
} from "../src/utils/geometry";
import { DEV_MOCK_LOCATION, MOCK_LOCATION_COORDS } from "../src/utils/devMock";
import { prewarmSnapIndex, snapToNearestNode } from "../src/utils/snapToGraph";
import { useRouteCalculationState } from "../src/utils/useRouteCalculationState";
import IsochroneLegend from "./IsochroneLegend";
import IsochroneOverlay from "./IsochroneOverlay";
import RefugeDetailsModal from "./RefugeDetailsModal";
import StreetViewModal from "./StreetViewModal";
import WeatherBadge from "./WeatherBadge";

type HazardCollection = FeatureCollection<Geometry, HazardFeatureProperties>;

const destinos = destinosRaw as Destino[];
const instituciones = institucionesRaw as Institucion[];

// Destino con id de nodo del grafo (asignado por snap). Es la forma que
// precomputeIsochrones espera en su parámetro `destinations`.
type LinkedDestino = Destino & { graphNodeId: number; graphNode: number };
const avenidaTorrencial = avenidaTorrencialData as HazardCollection;
const inundacion = InundacionData as HazardCollection;
const movimientoMasa = movimientoMasaData as HazardCollection;

type LocationError = "denied" | "disabled" | "error";

const filterByCategoria = (
  coll: HazardCollection,
  categoria: "Baja" | "Media" | "Alta",
): HazardCollection => ({
  ...coll,
  features: coll.features.filter((f) => f.properties?.Categoria === categoria),
});

const MAP_TYPES: { label: string; value: MapType; icon: string }[] = [
  { label: "Estándar", value: "standard", icon: "map" },
  { label: "Satélite", value: "satellite", icon: "public" },
  { label: "Híbrido", value: "hybrid", icon: "layers" },
];

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δφ = ((bLat - aLat) * Math.PI) / 180;
  const Δλ = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function closestByHaversine<T extends { lat: number; lng: number }>(
  user: { latitude: number; longitude: number },
  items: T[],
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const it of items) {
    const d = haversineM(user.latitude, user.longitude, it.lat, it.lng);
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
      console.warn("[MapView] findClosestViaGraph:", e);
    }
  }
  return closestByHaversine({ latitude: userLat, longitude: userLng }, destinations);
}

function NorthArrow({ heading }: { heading: number }) {
  return (
    <View style={{ transform: [{ rotate: `-${heading}deg` }], alignItems: "center" }}>
      <Text style={{ fontSize: 9, fontWeight: "900", color: "#ef476f", marginBottom: 1 }}>N</Text>
      <View style={{ width: 0, height: 0, alignItems: "center" }}>
        <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 0, borderBottomWidth: 13, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#073b4c", position: "absolute", left: -7, top: 0 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 0, borderRightWidth: 7, borderBottomWidth: 13, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#ef476f", position: "absolute", left: 0, top: 0 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 0, borderTopWidth: 13, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#ffffff", position: "absolute", left: -7, top: 13 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 0, borderRightWidth: 7, borderTopWidth: 13, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#e0e0e0", position: "absolute", left: 0, top: 13 }} />
      </View>
      <View style={{ height: 26 }} />
    </View>
  );
}

function splitRouteByHazardExit(
  polyline: { lat: number; lng: number }[],
  hazardGeoJson: FeatureCollection | undefined,
) {
  const toLL = (p: { lat: number; lng: number }) => ({ latitude: p.lat, longitude: p.lng });
  if (!hazardGeoJson || polyline.length === 0)
    return { isInDangerZone: false, dangerCoords: [] as any[], routeCoords: polyline.map(toLL) };
  const startInside = isPointInAnyPolygonOrMulti(toLL(polyline[0]), hazardGeoJson);
  if (!startInside)
    return { isInDangerZone: false, dangerCoords: [] as any[], routeCoords: polyline.map(toLL) };
  const coordsLL = polyline.map(toLL);
  const exitIndex = coordsLL.findIndex((c) => !isPointInAnyPolygonOrMulti(c, hazardGeoJson));
  if (exitIndex === -1) return { isInDangerZone: true, dangerCoords: coordsLL, routeCoords: [] as any[] };
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

function openInGoogleMaps(sLat: number, sLng: number, eLat: number, eLng: number, profile: string) {
  const travelmode = profile === "driving-car" ? "driving"
    : profile === "cycling-regular" ? "bicycling" : "walking";
  const url = `https://www.google.com/maps/dir/?api=1&origin=${sLat},${sLng}&destination=${eLat},${eLng}&travelmode=${travelmode}`;
  Linking.openURL(url).catch(() => Alert.alert("No se pudo abrir Google Maps"));
}

export default function MapViewContainer() {
  const mapRef = useRef<MapView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [locationError, setLocationError] = useState<LocationError | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [dangerSegment, setDangerSegment] = useState<{ latitude: number; longitude: number }[]>([]);
  const [evacuando, setEvacuando] = useState(false);
  const [rutaSugerida, setRutaSugerida] = useState(false);
  // TDD puede no encontrar camino que llegue antes del frente; en ese caso
  // el motor devuelve "la menos mala" con A*. Guardamos el flag para que
  // la UI advierta al usuario que el camino no está garantizado seguro.
  const [rutaRiesgosa, setRutaRiesgosa] = useState(false);
  const [destinoFinal, setDestinoFinal] = useState<DestinoFinal | null>(null);
  const [alertaDangerMostrada, setAlertaDangerMostrada] = useState(false);
  const [puntoConfirmado, setPuntoConfirmado] = useState(false);
  const [mapType, setMapType] = useState<MapType>("hybrid");
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);
  const [heading, setHeading] = useState(0);
  const [resaltarIniciar, setResaltarIniciar] = useState(false);
  const [resumenRuta, setResumenRuta] = useState<{ distancia: string; tiempo: string } | null>(null);

  const [graphReady, setGraphReady] = useState(false);
  const [streetViewVisible, setStreetViewVisible] = useState(false);
  const [refugeDetailsVisible, setRefugeDetailsVisible] = useState(false);
  const [refugeDetailsData, setRefugeDetailsData] = useState<RefugeDetails | null>(null);
  const [blockingAlerts, setBlockingAlerts] = useState<PublicAlert[]>([]);
  const [isoTable, setIsoTable] = useState<IsochroneTable | null>(null);
  const [isoError, setIsoError] = useState<string | null>(null);
  const [isoComputing, setIsoComputing] = useState(false);
  const [showIsochroneOverlay, setShowIsochroneOverlay] = useState(false);
  const [showLugares, setShowLugares] = useState(false);

  const { isCalculating, setCalculating, cancelAll } = useRouteCalculationState();

  const {
    selectedDestination, setSelectedDestination,
    selectedInstitucion, setSelectedInstitucion,
    routeProfile, setRouteProfile,
    startMode, setStartMode,
    startPoint, setStartPoint,
    destinationMode, setDestinationMode,
    emergencyType, setEmergencyType,
    shouldCenterOnUser, setShouldCenterOnUser,
    setShouldScrollToDestinos,
    pickingFromIsochroneMap, setPickingFromIsochroneMap,
    showingInstitucionesOverlay, setShowingInstitucionesOverlay,
    quickRouteMode, setQuickRouteMode,
  } = useRouteContext();

  const abortRef = useRef<AbortController | null>(null);
  const linkedDestinosRef = useRef<LinkedDestino[]>([]);
  // Si la última ruta auto-sugerida (modo "closest") se resolvió sin la
  // tabla de isócronas (fallback haversine), queremos recomputar apenas
  // la tabla esté disponible — si no, el usuario se queda con un destino
  // sub-óptimo que ignoró las penalizaciones de amenaza.
  const lastClosestUsedIsoRef = useRef<boolean>(false);

  const mmBaja = filterByCategoria(movimientoMasa, "Baja");
  const mmMedia = filterByCategoria(movimientoMasa, "Media");
  const mmAlta = filterByCategoria(movimientoMasa, "Alta");
  const InundMedia = filterByCategoria(inundacion, "Media");
  const InundAlta = filterByCategoria(inundacion, "Alta");
  const avMedia = filterByCategoria(avenidaTorrencial, "Media");
  const avAlta = filterByCategoria(avenidaTorrencial, "Alta");

  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ autoOpen?: string; autoRoute?: string }>();
  const autoOpenRef = useRef(false);
  // Flags del pipeline quickRoute para evitar ejecutar los prompts más
  // de una vez (cada uno ya cambió estado, no queremos re-disparar).
  const quickAutoRouteRef = useRef(false);
  const quickDestMethodAskedRef = useRef(false);
  const quickActionAskedRef = useRef(false);

  const puntosEncuentro = useMemo(
    () => destinos.filter((d) => d.tipo === "punto_encuentro"),
    [],
  );

  // ── Grafo: carga + SNAP MANUAL con doble seguro de nombres ──────────────
  useEffect(() => {
    try {
      loadGraph(rawGraph as unknown as RawGraph);
      const g = getGraph();
      prewarmSnapIndex(g);
      // Llamamos linkDestinations por si tiene efectos secundarios en el
      // grafo (puede crear aristas hacia los destinos), pero NO confiamos
      // que asigne graphNodeId correctamente.
      try { linkDestinations(puntosEncuentro); } catch (e) {
        console.warn("[MapView] linkDestinations:", e);
      }
      // ★ FIX CRÍTICO: snap manual. `snapToNearestNode` devuelve el ÍNDICE
      // del nodo en el array; `precomputeIsochrones` y los algoritmos
      // esperan el ID real (graph.nodes[i].id). Traducir aquí es lo que
      // evita que las isócronas arranquen desde nodos equivocados.
      const linked: LinkedDestino[] = puntosEncuentro.flatMap((d) => {
        const idx = snapToNearestNode(d.lat, d.lng, g);
        if (idx === null) return [];
        const nodeId = g.nodes[idx].id;
        return [{ ...d, graphNodeId: nodeId, graphNode: nodeId }];
      });
      linkedDestinosRef.current = linked;
      if (linked.length === 0) {
        console.error("[MapView] Ningún destino pudo ser snapeado al grafo");
      } else {
        console.log(`[MapView] ${linked.length}/${puntosEncuentro.length} destinos snapeados al grafo`);
      }
      setGraphReady(true);
    } catch (e) {
      console.error("[MapView] Fallo al cargar grafo:", e);
      Alert.alert("Grafo no disponible", "Ejecuta `node scripts/build-graph.js`.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flujo rápido desde Emergency / Home: si llegamos con `?autoOpen=drawer`,
  // abrimos el drawer automáticamente cuando el grafo está listo para que
  // el usuario vea los parámetros pre-seleccionados y confirme con 1 tap.
  useEffect(() => {
    if (autoOpenRef.current) return;
    if (!graphReady) return;
    if (params.autoOpen === "drawer") {
      autoOpenRef.current = true;
      // Pequeño delay para que la animación de entrada de la pantalla termine.
      const t = setTimeout(() => {
        navigation.dispatch(DrawerActions.openDrawer());
      }, 250);
      return () => clearTimeout(t);
    }
  }, [graphReady, params.autoOpen, navigation]);

  // ── Ubicación ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Dev mock: usa una ubicación fija en Santa Rosa y salta todo el GPS
    // real. Ver src/utils/devMock.ts y EXPO_PUBLIC_DEV_MOCK_LOCATION.
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
          console.warn("[MapView] getLastKnownPositionAsync:", e);
        }
        // Importante: si el cleanup corre durante el await, devolvemos la sub
        // recién creada para que no quede viva (drenando batería + setState
        // sobre componente desmontado).
        locSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 3 },
          (loc) => { if (!cancelled) { setLocation(loc.coords); setLoading(false); } },
        );
        if (cancelled) { locSub.remove(); locSub = undefined; return; }
        headSub = await Location.watchHeadingAsync((h) => {
          if (!cancelled) {
            const raw = h.trueHeading ?? h.magHeading ?? 0;
            setHeading(raw >= 0 ? raw : 0);
          }
        });
        if (cancelled) { headSub.remove(); headSub = undefined; return; }
      } catch (e) {
        console.warn("[MapView] Location setup:", e);
        if (!cancelled) { setLocationError("error"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; locSub?.remove(); headSub?.remove(); };
  }, []);

  useEffect(() => {
    if (!shouldCenterOnUser || !location) return;
    mapRef.current?.animateToRegion(
      { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600,
    );
    setShouldCenterOnUser(false);
  }, [shouldCenterOnUser, location]);

  useEffect(() => {
    setPuntoConfirmado(false);
    if (startMode === "gps") setStartPoint(null);
    setRouteCoords([]); setDangerSegment([]); setRutaSugerida(false); setResumenRuta(null);
  }, [startMode]);

  useEffect(() => {
    if (startMode === "manual" && startPoint) {
      setPuntoConfirmado(false);
      setRouteCoords([]); setDangerSegment([]); setRutaSugerida(false); setResumenRuta(null);
    }
  }, [startPoint]);

  // ★ FIX ISSUE 4: setear destinoFinal apenas el usuario elige
  // (antes solo se seteaba tras calcular la ruta)
  useEffect(() => {
    const picked = selectedInstitucion ?? selectedDestination;
    if (picked) {
      setDestinoFinal({ nombre: picked.nombre, lat: picked.lat, lng: picked.lng });
    }
  }, [selectedDestination, selectedInstitucion]);

  useEffect(() => {
    if (selectedDestination || selectedInstitucion) {
      setResaltarIniciar(true);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]), { iterations: 4 },
      ).start(() => setResaltarIniciar(false));
    }
  }, [selectedDestination, selectedInstitucion]);

  // En modo ruteo solo necesitamos las alertas ciudadanas bloqueantes
  // (ya afectan al algoritmo via reportsService). Desaparecidos, familia
  // y POIs se muestran en Community / Visor.
  const refreshAux = async () => {
    try {
      await recomputePublicAlerts();
      setBlockingAlerts(await getActiveBlockingAlerts());
    } catch (e) { console.warn("[MapView] refreshAux:", e); }
  };

  // Poll de alertas/desaparecidos/familia cada 60 s, SOLO con la app en
  // primer plano. Sin este gate el interval sigue corriendo en background
  // y consume batería + datos mientras nadie lo está viendo.
  useEffect(() => {
    if (!graphReady) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval !== null) return;
      refreshAux();
      interval = setInterval(refreshAux, 60_000);
    };
    const stop = () => {
      if (interval !== null) { clearInterval(interval); interval = null; }
    };
    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") start(); else stop();
    });
    return () => { stop(); sub.remove(); };
  }, [graphReady]);

  const computeIso = async (): Promise<IsochroneTable | null> => {
    if (!graphReady || linkedDestinosRef.current.length === 0) {
      setIsoError("No hay destinos válidos en el grafo");
      return null;
    }
    if (emergencyType === "ninguna") {
      setIsoError(null);
      setIsoTable(null);
      return null;
    }
    setIsoError(null);
    setIsoComputing(true);
    try {
      const table = await precomputeIsochrones({
        profile: routeProfile ?? "foot-walking",
        emergencyType,
        destinations: linkedDestinosRef.current,
      });
      setIsoTable(table);
      return table;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.error("[MapView] Isócronas fallaron:", e);
      setIsoError(msg);
      setIsoTable(null);
      return null;
    } finally {
      setIsoComputing(false);
    }
  };

  useEffect(() => {
    if (!graphReady) return;
    if (emergencyType === "ninguna") { setIsoTable(null); setIsoError(null); return; }
    const t = setTimeout(() => { computeIso(); }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphReady, emergencyType, routeProfile]);

  // ── Cálculo de ruta ─────────────────────────────────────────────────────
  const calcularRuta = async (markAsEvacuando: boolean) => {
    if (!location || !graphReady) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let finalDestination: DestinoFinal | null = selectedInstitucion ?? selectedDestination;
    let closestUsedIso = false;

    if (!finalDestination && destinationMode === "closest") {
      const userLat = startMode === "manual" && startPoint ? startPoint.lat : location.latitude;
      const userLng = startMode === "manual" && startPoint ? startPoint.lng : location.longitude;
      let iso = isoTable;
      if (!iso && emergencyType !== "ninguna") {
        iso = await computeIso();
      }
      closestUsedIso = iso !== null;
      finalDestination = findClosestViaGraph(userLat, userLng, puntosEncuentro, iso);
    }
    if (!finalDestination) return;
    setDestinoFinal(finalDestination);
    lastClosestUsedIsoRef.current = closestUsedIso;

    const hazardSource: HazardCollection | undefined =
      emergencyType === "inundacion" ? inundacion
        : emergencyType === "movimiento_en_masa" ? movimientoMasa
        : emergencyType === "avenida_torrencial" ? avenidaTorrencial : undefined;
    const hazardGeoJson: FeatureCollection | undefined = hazardSource && {
      type: "FeatureCollection",
      features: hazardSource.features.filter(
        (f): f is Feature<Geometry, HazardFeatureProperties> =>
          f.properties?.Categoria === "Media" || f.properties?.Categoria === "Alta",
      ),
    };

    const startLat = startMode === "manual" && startPoint ? startPoint.lat : location.latitude;
    const startLng = startMode === "manual" && startPoint ? startPoint.lng : location.longitude;
    const profile = routeProfile ?? "foot-walking";
    const alternativeEnds = (!selectedInstitucion && !selectedDestination && destinationMode === "closest")
      ? puntosEncuentro.map((d) => ({ lat: d.lat, lng: d.lng, name: d.nombre })) : undefined;

    try {
      const result = await computeRoute({
        start: { lat: startLat, lng: startLng },
        end: { lat: finalDestination.lat, lng: finalDestination.lng },
        profile, emergencyType, algorithm: "time-dependent", alternativeEnds,
      });
      if (controller.signal.aborted) return;
      if (!result) {
        if (markAsEvacuando) Alert.alert("Ruta no disponible", "No se encontró un camino.");
        setRutaSugerida(false);
        return;
      }
      const { isInDangerZone, dangerCoords, routeCoords } = splitRouteByHazardExit(result.polyline, hazardGeoJson);
      if (markAsEvacuando && isInDangerZone && dangerCoords.length > 0 && !alertaDangerMostrada) {
        setAlertaDangerMostrada(true);
        Alert.alert("⚠️ Estás en zona de riesgo", "Sigue la ruta para salir del área peligrosa.", [{ text: "Entendido" }]);
      }
      if (alternativeEnds && result.destinationName && result.destinationName !== finalDestination.nombre) {
        const chosen = puntosEncuentro.find((d) => d.nombre === result.destinationName);
        if (chosen) setDestinoFinal({ nombre: chosen.nombre, lat: chosen.lat, lng: chosen.lng });
      }
      setResumenRuta(formatRouteSummary(result.distanceMeters, result.durationSeconds));
      setDangerSegment(dangerCoords);
      setRouteCoords(routeCoords);
      setRutaRiesgosa(result.isRiskyFallback);
      // Si es ruta riesgosa y el usuario la confirma como evacuación, le
      // avisamos una vez: no hay camino que el modelo garantice salir a
      // tiempo, pero esta es la "menos mala" que encontró.
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
      console.error("[MapView] Ruta:", err);
      if (markAsEvacuando) Alert.alert("Error", "No se pudo calcular la ruta.");
    }
  };

  // Nota: el auto-route fue removido — calcular al elegir emergencia
  // resultaba confuso (veías una ruta sin haberla pedido). El cálculo
  // ahora solo lo dispara el botón "IR AQUÍ" explícitamente.

  // Botón principal "IR AQUÍ" — calcula ruta + inicia evacuación. Acepta
  // dos casos:
  //   - destinoFinal definido (el usuario eligió refugio/institución específicos)
  //   - modo "closest" (calcularRuta hace findClosestViaGraph internamente)
  const handleIrAqui = async () => {
    if (!location || !graphReady || evacuando) return;
    const tieneDestino = destinoFinal !== null || destinationMode === "closest";
    if (!tieneDestino) return;
    if (emergencyType === "ninguna") {
      Alert.alert(
        "Selecciona una emergencia",
        "Para calcular la ruta, primero elige un tipo de emergencia desde el menú.",
        [
          { text: "Abrir menú", onPress: () => navigation.dispatch(DrawerActions.openDrawer()) },
          { text: "Cancelar", style: "cancel" },
        ],
      );
      return;
    }
    await setCalculating(() => calcularRuta(true));
  };

  const handleCenterOnUser = () => {
    if (!location) return;
    mapRef.current?.animateToRegion(
      { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600,
    );
  };

  const handleOpenGoogleMaps = () => {
    if (!location || !destinoFinal) return;
    const sLat = startMode === "manual" && startPoint ? startPoint.lat : location.latitude;
    const sLng = startMode === "manual" && startPoint ? startPoint.lng : location.longitude;
    openInGoogleMaps(sLat, sLng, destinoFinal.lat, destinoFinal.lng, routeProfile ?? "foot-walking");
  };

  const handleResetAll = () => {
    cancelAll();
    abortRef.current?.abort();
    setEvacuando(false);
    setRutaSugerida(false);
    setRutaRiesgosa(false);
    setRouteCoords([]);
    setDangerSegment([]);
    setDestinoFinal(null);
    setAlertaDangerMostrada(false);
    setPuntoConfirmado(false);
    setStartPoint(null);
    setStartMode("gps");
    setEmergencyType("ninguna");
    setSelectedDestination(null);
    setSelectedInstitucion(null);
    setDestinationMode("closest");
    setResaltarIniciar(false);
    setResumenRuta(null);
    setShowIsochroneOverlay(false);
    setPickingFromIsochroneMap(false);
    setShowingInstitucionesOverlay(false);
  };

  const handleResetConfirm = () => {
    const haySeleccion = emergencyType !== "ninguna" ||
      selectedDestination !== null || selectedInstitucion !== null ||
      startMode === "manual" || rutaSugerida || evacuando ||
      pickingFromIsochroneMap || showingInstitucionesOverlay;
    if (!haySeleccion) return;
    Alert.alert(
      evacuando ? "Cancelar evacuación" : "Limpiar selección",
      evacuando ? "¿Cancelar la evacuación actual?" : "¿Limpiar toda la selección?",
      [
        { text: "No", style: "cancel" },
        { text: "Sí, limpiar", style: "destructive", onPress: handleResetAll },
      ],
    );
  };

  const handleLlamarEmergencia = () => {
    Alert.alert("Llamar al 123", "¿Deseas llamar al número de emergencias?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Llamar", onPress: () => Linking.openURL("tel:123") },
    ]);
  };

  // La navegación interna reemplaza Google Maps externo: la cámara sigue
  // al usuario (efecto más abajo) y la ruta que se dibuja es la del motor
  // local (TDD + fallback), no la de Google.

  // ── Pipeline QUICK ROUTE (desde EmergencyScreen) ──────────────────────
  //
  // Caso A — "Desde mi ubicación": llegamos con ?autoRoute=1, startMode=gps,
  // destinationMode=closest. Apenas location y graphReady listos, disparamos
  // calcularRuta(true) — el usuario ya confirmó el flujo rápido, así que
  // pasamos directo a evacuando.
  useEffect(() => {
    if (quickAutoRouteRef.current) return;
    if (!quickRouteMode) return;
    if (params.autoRoute !== "1") return;
    if (!graphReady || !location) return;
    if (startMode !== "gps") return;
    if (emergencyType === "ninguna") return;
    if (evacuando) return;
    quickAutoRouteRef.current = true;
    const t = setTimeout(() => {
      setCalculating(() => calcularRuta(true));
      setQuickRouteMode(false);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRouteMode, params.autoRoute, graphReady, location, startMode, emergencyType, evacuando]);

  // Caso B — "Elegir en el mapa": tras tocar el mapa (startPoint set), en
  // quickRouteMode auto-confirmamos y mostramos un Alert con los 3 métodos
  // de destino. El usuario no tiene que pulsar "CONFIRMAR PUNTO".
  useEffect(() => {
    if (quickDestMethodAskedRef.current) return;
    if (!quickRouteMode) return;
    if (startMode !== "manual") return;
    if (!startPoint) return;
    if (emergencyType === "ninguna") return;
    quickDestMethodAskedRef.current = true;
    setPuntoConfirmado(true);
    const t = setTimeout(() => {
      Alert.alert(
        "¿Cómo eliges el destino?",
        "Selecciona el método para llegar al lugar seguro.",
        [
          {
            text: "🏁 Punto más cercano",
            onPress: () => {
              setDestinationMode("closest");
              setCalculating(() => calcularRuta(true));
              setQuickRouteMode(false);
            },
          },
          {
            text: "🔥 Mapa de calor",
            onPress: () => {
              setDestinationMode("manual");
              setPickingFromIsochroneMap(true);
              setShowIsochroneOverlay(true);
            },
          },
          {
            text: "🏥 Instituciones",
            onPress: () => {
              setDestinationMode("manual");
              setShowingInstitucionesOverlay(true);
            },
          },
          {
            text: "Cancelar",
            style: "cancel",
            onPress: () => setQuickRouteMode(false),
          },
        ],
      );
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRouteMode, startMode, startPoint, emergencyType]);

  // Caso C — tras elegir destino (heatmap o institución) en quickRouteMode
  // mostramos un Alert con 3 acciones: Iniciar navegación / Google Maps /
  // Vista 360°. El destinoFinal ya se actualizó por el useEffect de
  // [selectedDestination, selectedInstitucion].
  useEffect(() => {
    if (quickActionAskedRef.current) return;
    if (!quickRouteMode) return;
    if (!destinoFinal) return;
    if (evacuando) return;
    if (!pickingFromIsochroneMap && !showingInstitucionesOverlay &&
        !selectedDestination && !selectedInstitucion) return;
    quickActionAskedRef.current = true;
    const t = setTimeout(() => {
      Alert.alert(
        `→ ${destinoFinal.nombre}`,
        "¿Qué quieres hacer?",
        [
          {
            text: "🏃 Iniciar ruta de evacuación",
            onPress: () => {
              setCalculating(() => calcularRuta(true));
              setQuickRouteMode(false);
            },
          },
          {
            text: "🗺️ Calcular con Google Maps",
            onPress: () => {
              handleOpenGoogleMaps();
              setQuickRouteMode(false);
            },
          },
          {
            text: "📷 Vista 360°",
            onPress: () => {
              setStreetViewVisible(true);
              setQuickRouteMode(false);
            },
          },
          { text: "Cancelar", style: "cancel" },
        ],
      );
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRouteMode, destinoFinal, evacuando, selectedDestination, selectedInstitucion]);

  const handleOpenRefugeDetails = (nombre: string) => {
    const details = getRefugeByName(nombre);
    if (details) {
      setRefugeDetailsData(details);
      setRefugeDetailsVisible(true);
    } else {
      setRefugeDetailsData({
        nombre,
        servicios: [],
        descripcion: "Aún no hay información detallada para este punto.",
      });
      setRefugeDetailsVisible(true);
    }
  };

  const handleNavigateFromRefuge = () => {
    handleIrAqui();
  };

  const handleIsochroneButton = async () => {
    if (emergencyType === "ninguna") {
      Alert.alert(
        "Isócronas no disponibles",
        "Selecciona un tipo de emergencia desde el menú para ver el mapa de tiempo a seguridad.",
      );
      return;
    }
    if (!isoTable) {
      if (isoComputing) {
        Alert.alert("Calculando...", "Las isócronas se están calculando. Espera un momento.");
        return;
      }
      const table = await computeIso();
      if (!table) {
        Alert.alert(
          "No se pudo calcular",
          isoError ? `Detalle: ${isoError}` : "No fue posible calcular las isócronas.",
        );
        return;
      }
      setShowIsochroneOverlay(true);
      return;
    }
    setShowIsochroneOverlay((v) => !v);
  };

  // ★ Click en marcador de destino (modo normal o modo picking)
  const handleDestinationMarkerPress = (dest: Destino) => {
    if (pickingFromIsochroneMap) {
      // Usuario está eligiendo desde el mapa → confirmar selección
      setSelectedDestination(dest);
      setDestinationMode("manual");
      setPickingFromIsochroneMap(false);
      setShowIsochroneOverlay(false);
      return;
    }
    if (showingInstitucionesOverlay) {
      // No debería pasar aquí (los markers de instituciones son distintos)
      return;
    }
    // Comportamiento normal: abrir ficha del refugio
    handleOpenRefugeDetails(dest.nombre);
  };

  // initialRegion derivado del bbox del grafo — así el mapa siempre abre
  // enmarcando exactamente la zona cubierta, sin asumir una ciudad fija.
  const initialRegion = useMemo(() => {
    if (!graphReady) {
      return { latitude: 4.8727, longitude: -75.6109, latitudeDelta: 0.07, longitudeDelta: 0.07 };
    }
    const b = getGraph().bbox;
    const latitude = (b.minLat + b.maxLat) / 2;
    const longitude = (b.minLng + b.maxLng) / 2;
    const latitudeDelta = Math.max((b.maxLat - b.minLat) * 1.1, 0.01);
    const longitudeDelta = Math.max((b.maxLng - b.minLng) * 1.1, 0.01);
    return { latitude, longitude, latitudeDelta, longitudeDelta };
  }, [graphReady]);

  // Preview del destino más cercano cuando el usuario eligió modo "closest"
  // y hay emergencia seleccionada: así ve cuál refugio se tomaría ANTES
  // de disparar el cálculo completo. IMPORTANTE: este useMemo debe estar
  // antes de cualquier `return` condicional, para no violar las Rules of
  // Hooks (el orden de hooks debe ser idéntico en cada render).
  const closestPreview = useMemo((): Destino | null => {
    if (destinoFinal) return null;
    if (destinationMode !== "closest") return null;
    if (!location || !graphReady) return null;
    if (emergencyType === "ninguna") return null;
    const lat = startMode === "manual" && startPoint ? startPoint.lat : location.latitude;
    const lng = startMode === "manual" && startPoint ? startPoint.lng : location.longitude;
    return findClosestViaGraph(lat, lng, puntosEncuentro, isoTable);
  }, [destinoFinal, destinationMode, location, graphReady, emergencyType, startMode, startPoint, isoTable]);

  if (locationError) {
    const mensajes: Record<LocationError, { titulo: string; detalle: string }> = {
      denied: { titulo: "Permiso denegado", detalle: "La app necesita acceso a tu ubicación." },
      disabled: { titulo: "GPS desactivado", detalle: "Activa el GPS en configuración." },
      error: { titulo: "Error de ubicación", detalle: "No se pudo acceder al GPS." },
    };
    const { titulo, detalle } = mensajes[locationError];
    return (
      <View style={styles.loadingContainer}>
        <MaterialIcons name="location-off" size={48} color="#ef476f" />
        <Text style={{ marginTop: 16, color: "#073b4c", fontWeight: "700", fontSize: 16 }}>{titulo}</Text>
        <Text style={{ marginTop: 8, color: "#555", fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>{detalle}</Text>
        <TouchableOpacity style={{ marginTop: 20, backgroundColor: "#118ab2", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20 }} onPress={() => Linking.openSettings()}>
          <Text style={{ color: "#ffffff", fontWeight: "600" }}>Abrir Configuración</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading || !location)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ef476f" />
        <Text style={{ marginTop: 12, color: "#073b4c", fontWeight: "600" }}>Obteniendo ubicación...</Text>
      </View>
    );

  // El origen está listo solo cuando el usuario lo confirma explícitamente
  // (tanto GPS como manual). Esto da al usuario una pausa para verificar
  // antes de pasar a elegir destino.
  const ubicacionLista = puntoConfirmado;
  const seleccionandoPunto = startMode === "manual" && !evacuando;
  // Botón "Confirmar punto de inicio" — ahora también se muestra en modo
  // GPS (no solo manual) para obligar a una confirmación antes de elegir
  // destino. No aplica en quickRouteMode (Emergency auto-confirma).
  const puntoPendiente =
    !puntoConfirmado && !evacuando && !quickRouteMode &&
    !pickingFromIsochroneMap && !showingInstitucionesOverlay &&
    emergencyType !== "ninguna" && routeProfile !== null &&
    ((startMode === "gps" && location !== null) ||
      (startMode === "manual" && startPoint !== null));
  const hayRutaCalculada = routeCoords.length > 0 || dangerSegment.length > 0;
  const iconoModo = routeProfile === "driving-car" ? "🚗" : routeProfile === "cycling-regular" ? "🚴" : "🚶";
  const mostrarIsocronas = (showIsochroneOverlay || pickingFromIsochroneMap) && isoTable !== null && !evacuando && emergencyType !== "ninguna";
  const mostrarBotonReset = emergencyType !== "ninguna" || selectedDestination !== null ||
    selectedInstitucion !== null || startMode === "manual" || rutaSugerida || evacuando ||
    pickingFromIsochroneMap || showingInstitucionesOverlay;

  // Los parámetros están completos cuando el usuario ya picó todo lo que
  // el motor de ruteo necesita. En modo "closest" basta con que haya
  // destinationMode y preview; en modo manual hace falta destinoFinal.
  const parametrosListos =
    ubicacionLista &&
    routeProfile !== null &&
    emergencyType !== "ninguna" &&
    (destinoFinal !== null || (destinationMode === "closest" && closestPreview !== null));

  // Botón "Calcular ruta de evacuación" — aparece cuando todos los
  // parámetros están listos. El "Elegir parámetros" viejo se eliminó:
  // el drawer se abre automáticamente desde el Home y guía al usuario.
  const mostrarBotonIniciar = parametrosListos && !evacuando &&
    !pickingFromIsochroneMap && !showingInstitucionesOverlay;

  // El mapa arranca limpio. Solo se muestran refugios cuando:
  //  - el usuario activó el toggle "Ver lugares" (top-right)
  //  - el usuario activó el modo "Elegir con mapa de calor" (picking)
  //  - el usuario ya eligió un destino específico (destinoFinal)
  // En closest mode no se muestran — el usuario confía en el algoritmo y
  // la ruta aparece al presionar IR AQUÍ.
  const destinosToShow: Destino[] =
    showLugares || pickingFromIsochroneMap
      ? puntosEncuentro
      : destinoFinal
        ? [destinoFinal as Destino]
        : [];

  return (
    <View style={styles.container}>
      <View style={styles.floatingTitle}>
        <Text style={styles.floatingTitleText}>EvacuApp</Text>
      </View>

      {DEV_MOCK_LOCATION && (
        <View style={styles.devMockBadge} pointerEvents="none">
          <Text style={styles.devMockBadgeText}>📍 DEV MOCK</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backMapButton}
        accessibilityLabel="Volver"
      >
        <MaterialIcons name="arrow-back" size={22} color="#073b4c" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        style={styles.menuButton}
      >
        <Text style={{ fontSize: 24 }}>☰</Text>
      </TouchableOpacity>

      {/* La columna izquierda con botones de reports/prep/safety/family/
          missing/instituciones se movió a sus propios módulos desde el
          rediseño v4.3. Este mapa se dedica exclusivamente a calcular
          la ruta de evacuación. */}

      <View style={styles.topRightGroup} pointerEvents="box-none">
        <TouchableOpacity style={styles.squareButton} onPress={() => setShowMapTypePicker(true)}>
          <MaterialIcons name="layers" size={24} color="#073b4c" />
        </TouchableOpacity>
        <WeatherBadge />
        <TouchableOpacity
          style={[
            styles.squareButton,
            showIsochroneOverlay && { backgroundColor: "#10b981" },
            isoComputing && { backgroundColor: "#fef3c7" },
          ]}
          onPress={handleIsochroneButton}
        >
          {isoComputing ? (
            <ActivityIndicator size="small" color="#d97706" />
          ) : (
            <MaterialIcons name="timer" size={24} color={showIsochroneOverlay ? "#ffffff" : "#073b4c"} />
          )}
        </TouchableOpacity>
        {/* Toggle "Ver lugares": muestra/oculta todos los refugios +
            instituciones sobre el mapa, independiente del wizard. */}
        <TouchableOpacity
          style={[
            styles.squareButton,
            showLugares && { backgroundColor: "#f59e0b" },
          ]}
          onPress={() => setShowLugares((v) => !v)}
          accessibilityLabel="Ver refugios e instituciones"
        >
          <MaterialIcons name="place" size={24} color={showLugares ? "#ffffff" : "#073b4c"} />
        </TouchableOpacity>
        <View style={styles.roundButton}>
          <NorthArrow heading={heading} />
        </View>
      </View>

      {mostrarIsocronas && (
        <View style={styles.legendPosition} pointerEvents="none">
          <IsochroneLegend />
        </View>
      )}

      {/* Stack de banners superiores. Todos comparten esta columna y se
          apilan con gap en vez de competir por el mismo `top`. */}
      <View style={styles.topBannersStack} pointerEvents="box-none">
        {pickingFromIsochroneMap && (
          <View style={styles.pickingBanner}>
            <MaterialIcons name="touch-app" size={18} color="#fff" />
            <Text style={styles.pickingBannerText}>
              Toca un refugio en el mapa para elegirlo
            </Text>
          </View>
        )}
        {evacuando && routeCoords.length > 0 && (
          <View style={styles.evacuandoBanner}>
            <Text style={styles.evacuandoText}>🚨 Evacuando</Text>
          </View>
        )}
        {rutaRiesgosa && (evacuando || rutaSugerida) && (
          <View style={styles.riskyBanner}>
            <MaterialIcons name="warning" size={18} color="#fff" />
            <Text style={styles.riskyBannerText}>
              Ruta no garantizada · el frente podría cortarla
            </Text>
          </View>
        )}
        {rutaSugerida && !evacuando && (
          <View style={[styles.evacuandoBanner, { backgroundColor: "#118ab2" }]}>
            <Text style={styles.evacuandoText}>🧭 Ruta sugerida</Text>
          </View>
        )}
        {isCalculating && !evacuando && (
          <View style={[styles.evacuandoBanner, { backgroundColor: "#6366f1" }]}>
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.evacuandoText}>Calculando ruta...</Text>
          </View>
        )}
        {(evacuando || rutaSugerida) && resumenRuta && destinoFinal && (
          <View style={styles.resumenBanner}>
            <Text style={styles.resumenText}>
              {iconoModo} {resumenRuta.distancia} · ⏱️ {resumenRuta.tiempo}
            </Text>
            <Text style={styles.resumenSub} numberOfLines={1}>→ {destinoFinal.nombre}</Text>
          </View>
        )}
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapType}
        showsCompass={false}
        showsMyLocationButton={false}
        initialRegion={initialRegion}
        showsUserLocation
        onPress={(e) => {
          if (startMode !== "manual" || evacuando) return;
          if (pickingFromIsochroneMap || showingInstitucionesOverlay) return;
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setStartPoint({ lat: latitude, lng: longitude });
        }}
      >
        {routeCoords.length > 0 && <Polyline coordinates={routeCoords} strokeColor="#2196f3" strokeWidth={4} />}
        {dangerSegment.length > 0 && <Polyline coordinates={dangerSegment} strokeColor="#ef476f" strokeWidth={4} />}

        {emergencyType === "inundacion" && (
          <>
            <Geojson geojson={InundMedia} strokeColor="rgba(30,144,255,0.5)" fillColor="rgba(30,144,255,0.12)" strokeWidth={1} />
            <Geojson geojson={InundAlta} strokeColor="rgba(0,0,205,0.6)" fillColor="rgba(0,0,205,0.18)" strokeWidth={1} />
          </>
        )}
        {emergencyType === "movimiento_en_masa" && (
          <>
            <Geojson geojson={mmBaja} strokeColor="rgba(255,215,0,0.5)" fillColor="rgba(255,215,0,0.12)" strokeWidth={1} />
            <Geojson geojson={mmMedia} strokeColor="rgba(255,140,0,0.5)" fillColor="rgba(255,140,0,0.12)" strokeWidth={1} />
            <Geojson geojson={mmAlta} strokeColor="rgba(139,0,0,0.6)" fillColor="rgba(139,0,0,0.18)" strokeWidth={1} />
          </>
        )}
        {emergencyType === "avenida_torrencial" && (
          <>
            <Geojson geojson={avMedia} strokeColor="rgba(255,100,0,0.5)" fillColor="rgba(255,100,0,0.12)" strokeWidth={1} />
            <Geojson geojson={avAlta} strokeColor="rgba(180,0,0,0.6)" fillColor="rgba(180,0,0,0.18)" strokeWidth={1} />
          </>
        )}

        {mostrarIsocronas && isoTable && <IsochroneOverlay graph={getGraph()} table={isoTable} />}

        {/* Destinos: uno solo (manual), todos cuando picking, o todos
            con el más cercano resaltado cuando modo "closest". */}
        {destinosToShow.map((d) => {
          const isPreview = closestPreview?.nombre === d.nombre;
          return (
            <Marker
              key={`dest-${d.nombre}`}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              title={isPreview ? `⭐ ${d.nombre}` : d.nombre}
              description={isPreview ? "Destino sugerido (el más cercano)" : undefined}
              pinColor={
                pickingFromIsochroneMap ? "green" :
                isPreview ? "red" :
                "azure"
              }
              stopPropagation
              onPress={(e) => { e.stopPropagation?.(); handleDestinationMarkerPress(d); }}
            />
          );
        })}

        {/* Instituciones: solo cuando el usuario las activa desde el
            flujo quickRoute, o cuando el usuario activó el toggle "Ver
            lugares". Si el tap viene del overlay del wizard la institución
            se toma como destino; si viene del toggle de visualización solo
            abre la info sin cambiar el flujo. */}
        {(showingInstitucionesOverlay || showLugares) && instituciones.map((inst) => (
          <Marker
            key={`inst-${inst.id}`}
            coordinate={{ latitude: inst.lat, longitude: inst.lng }}
            title={inst.nombre}
            description={inst.tipo}
            pinColor="gold"
            stopPropagation
            onPress={(e) => {
              e.stopPropagation?.();
              if (showingInstitucionesOverlay) {
                setSelectedInstitucion(inst);
                setShowingInstitucionesOverlay(false);
              }
            }}
          />
        ))}

        {startMode === "manual" && startPoint && (
          <Marker
            coordinate={{ latitude: startPoint.lat, longitude: startPoint.lng }}
            title="Punto inicial"
            pinColor="orange"
            stopPropagation
          />
        )}

        {/* Alertas ciudadanas: solo visibles mientras se está evacuando
            (para avisar al usuario de zonas que el router ya está evitando).
            Antes de iniciar la ruta, el mapa queda limpio — las alertas se
            ven en el Visor si el usuario las quiere consultar. */}
        {evacuando && blockingAlerts.map((alert) => (
          <Marker
            key={alert.id}
            coordinate={{ latitude: alert.lat, longitude: alert.lng }}
            title={labelForAlertType(alert.type)}
            description={`${alert.uniqueDeviceCount} ciudadano(s) · ${Math.round(alert.confidence * 100)}%`}
            pinColor="red"
            stopPropagation
          />
        ))}
      </MapView>

      {/* ★ ISSUE 4 FIX: botones Ir aquí + Street View visibles apenas hay destino */}
      <View style={styles.bottomRightGroup} pointerEvents="box-none">
        {destinoFinal && !pickingFromIsochroneMap && !showingInstitucionesOverlay && (
          <TouchableOpacity
            style={[styles.bottomRightBtn, { backgroundColor: "#6366f1" }]}
            onPress={() => setStreetViewVisible(true)}
            accessibilityLabel="Ver Street View 360"
          >
            <MaterialIcons name="streetview" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        {destinoFinal && !pickingFromIsochroneMap && !showingInstitucionesOverlay && (
          <TouchableOpacity
            style={[styles.bottomRightBtn, { backgroundColor: "#3b82f6" }]}
            onPress={handleOpenGoogleMaps}
            accessibilityLabel="Abrir en Google Maps"
          >
            <MaterialIcons name="map" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.bottomRightBtn} onPress={handleCenterOnUser}>
          <MaterialIcons name="my-location" size={24} color="#073b4c" />
        </TouchableOpacity>
        {mostrarBotonReset && (
          <TouchableOpacity
            style={[styles.bottomRightBtn, { backgroundColor: "#fef2f2", borderWidth: 1.5, borderColor: "#fecaca" }]}
            onPress={handleResetConfirm}
          >
            <MaterialIcons name="refresh" size={24} color="#dc2626" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.emergencyButton} onPress={handleLlamarEmergencia}>
        <MaterialIcons name="phone" size={28} color="#ffffff" />
      </TouchableOpacity>

      <Modal visible={showMapTypePicker} transparent animationType="slide" onRequestClose={() => setShowMapTypePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowMapTypePicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Tipo de mapa</Text>
                  <TouchableOpacity onPress={() => setShowMapTypePicker(false)}>
                    <MaterialIcons name="close" size={24} color="#073b4c" />
                  </TouchableOpacity>
                </View>
                <View style={styles.mapTypeRow}>
                  {MAP_TYPES.map((type) => {
                    const isActive = mapType === type.value;
                    return (
                      <TouchableOpacity
                        key={type.value}
                        style={styles.mapTypeOption}
                        onPress={() => { setMapType(type.value); setShowMapTypePicker(false); }}
                      >
                        <View style={[styles.mapTypeIconBox, isActive && styles.mapTypeIconBoxActive]}>
                          <MaterialIcons name={type.icon as any} size={32} color={isActive ? "#118ab2" : "#073b4c"} />
                        </View>
                        <Text style={[styles.mapTypeLabel, isActive && styles.mapTypeLabelActive]}>{type.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ReportModal, PreparednessModal, SafetyStatusModal, MissingPersonsModal
          y FamilyGroupModal fueron movidos a sus módulos propios. Aquí solo
          quedan los modales estrictamente ligados al flujo de ruteo. */}

      <RefugeDetailsModal
        visible={refugeDetailsVisible}
        onClose={() => setRefugeDetailsVisible(false)}
        refuge={refugeDetailsData}
        onNavigate={refugeDetailsData ? handleNavigateFromRefuge : undefined}
        onStreetView={refugeDetailsData ? () => setStreetViewVisible(true) : undefined}
      />

      {destinoFinal && (
        <StreetViewModal
          visible={streetViewVisible}
          onClose={() => setStreetViewVisible(false)}
          latitude={destinoFinal.lat}
          longitude={destinoFinal.lng}
          placeName={destinoFinal.nombre}
        />
      )}

      {seleccionandoPunto && startPoint === null && !pickingFromIsochroneMap && !showingInstitucionesOverlay && (
        <View style={styles.floatingBanner}>
          <Text style={styles.floatingBannerText}>Toca el mapa para seleccionar tu punto de inicio</Text>
        </View>
      )}

      {puntoPendiente && (
        <TouchableOpacity
          style={styles.confirmarPuntoButton}
          onPress={() => {
            setPuntoConfirmado(true);
            setShouldScrollToDestinos(true);
            navigation.dispatch(DrawerActions.openDrawer());
          }}
        >
          <MaterialIcons name="check-circle" size={20} color="#ffffff" style={{ marginRight: 8 }} />
          <Text style={styles.confirmarPuntoButtonText}>CONFIRMAR PUNTO DE INICIO</Text>
        </TouchableOpacity>
      )}

      {/* BOTÓN "INICIAR RUTA DE EVACUACIÓN" — cuando todos los parámetros
          están listos (destinoFinal o closest+preview). */}
      {mostrarBotonIniciar && (
        <Animated.View
          style={{
            transform: [{ scale: resaltarIniciar ? pulseAnim : 1 }],
            position: "absolute", bottom: 170, alignSelf: "center",
          }}
        >
          <TouchableOpacity
            style={[
              styles.evacuarButton,
              resaltarIniciar && styles.evacuarButtonResaltado,
              isCalculating && { opacity: 0.7 },
            ]}
            onPress={handleIrAqui}
            disabled={isCalculating}
          >
            {isCalculating ? (
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            ) : (
              <MaterialIcons name="directions-run" size={22} color="#ffffff" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.evacuarButtonText}>
              {isCalculating ? "CALCULANDO..." : "CALCULAR RUTA DE EVACUACIÓN"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {evacuando && (
        <TouchableOpacity style={styles.cancelarButton} onPress={handleResetConfirm}>
          <Text style={styles.cancelarButtonText}>✕ CANCELAR EVACUACIÓN</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

function labelForAlertType(type: string): string {
  switch (type) {
    case "bloqueo_vial": return "⚠️ Bloqueo vial";
    case "sendero_obstruido": return "⚠️ Sendero obstruido";
    case "inundacion_local": return "⚠️ Inundación puntual";
    case "deslizamiento_local": return "⚠️ Deslizamiento";
    case "riesgo_electrico": return "⚠️ Riesgo eléctrico";
    case "refugio_saturado": return "ℹ️ Refugio saturado";
    case "refugio_cerrado": return "ℹ️ Refugio cerrado";
    default: return "⚠️ Alerta ciudadana";
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f0f4f8" },
  floatingTitle: {
    position: "absolute", top: 60, alignSelf: "center", zIndex: 10,
    backgroundColor: "#ffffffdd", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 5,
  },
  floatingTitleText: { color: "#073b4c", fontWeight: "bold", fontSize: 18, letterSpacing: 0.5 },
  devMockBadge: {
    position: "absolute",
    top: 104,
    alignSelf: "center",
    zIndex: 11,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  devMockBadgeText: {
    color: "#92400e",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  backMapButton: {
    position: "absolute", top: 60, left: 20, zIndex: 11,
    backgroundColor: "#ffffffee", width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  menuButton: {
    position: "absolute", top: 120, left: 20, zIndex: 10,
    backgroundColor: "#ffffffee", padding: 10, borderRadius: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  leftActionColumn: { position: "absolute", left: 20, top: 180, zIndex: 10, gap: 8 },
  squareActionBtn: {
    width: 46, height: 46, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  miniBadge: {
    position: "absolute", top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: "#fbbf24",
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2, borderColor: "#fff",
  },
  miniBadgeText: { color: "#78350f", fontSize: 10, fontWeight: "800" },
  topRightGroup: { position: "absolute", top: 120, right: 20, zIndex: 10, gap: 8 },
  squareButton: {
    backgroundColor: "#ffffffee", width: 46, height: 46, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  roundButton: {
    backgroundColor: "#ffffffee", width: 46, height: 46, borderRadius: 23,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  bottomRightGroup: { position: "absolute", bottom: 70, right: 20, zIndex: 10, gap: 10, alignItems: "flex-end" },
  bottomRightBtn: {
    backgroundColor: "#ffffffee", width: 50, height: 50, borderRadius: 25,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  emergencyButton: {
    position: "absolute", bottom: 70, left: 20, zIndex: 10,
    backgroundColor: "#ef476f", width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#ef476f", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  topBannersStack: {
    position: "absolute", top: 170, left: 0, right: 0, zIndex: 10,
    alignItems: "center", gap: 8,
  },
  pickingBanner: {
    backgroundColor: "#10b981",
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    flexDirection: "row", alignItems: "center", gap: 8,
    elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8,
  },
  pickingBannerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  evacuandoBanner: {
    backgroundColor: "#073b4c", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  evacuandoText: { color: "#ffffff", fontWeight: "700", fontSize: 14, includeFontPadding: false },
  riskyBanner: {
    backgroundColor: "#b91c1c", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "85%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
  },
  riskyBannerText: { color: "#fff", fontWeight: "700", fontSize: 12, flexShrink: 1 },
  resumenBanner: {
    backgroundColor: "#ffffffee", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
    elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    alignItems: "center", maxWidth: "70%",
  },
  resumenText: { color: "#073b4c", fontWeight: "700", fontSize: 13, includeFontPadding: false },
  resumenSub: { color: "#6b7280", fontSize: 11, marginTop: 2 },
  isochroneInfoBanner: {
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    alignItems: "center", maxWidth: "70%",
  },
  isochroneInfoTitle: { color: "#374151", fontSize: 11, fontWeight: "600" },
  isochroneInfoTime: { color: "#10b981", fontSize: 20, fontWeight: "800", marginTop: 2 },
  isochroneInfoDest: { color: "#6b7280", fontSize: 11, marginTop: 2, maxWidth: 200 },
  legendPosition: { position: "absolute", right: 20, top: 420, zIndex: 10 },
  missingMarker: {
    backgroundColor: "#fbbf24", borderRadius: 18,
    width: 36, height: 36,
    justifyContent: "center", alignItems: "center",
    borderWidth: 3, borderColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3,
  },
  familyMarker: {
    backgroundColor: "#7c3aed", borderRadius: 18,
    width: 36, height: 36,
    justifyContent: "center", alignItems: "center",
    borderWidth: 3, borderColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3,
  },
  familyMarkerText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  floatingBanner: {
    position: "absolute", bottom: 170, alignSelf: "center",
    backgroundColor: "#ffffffee", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, elevation: 5,
  },
  floatingBannerText: { color: "#073b4c", fontWeight: "500", fontSize: 13 },
  confirmarPuntoButton: {
    position: "absolute", bottom: 170, alignSelf: "center",
    backgroundColor: "#118ab2", paddingVertical: 16, paddingHorizontal: 28, borderRadius: 30,
    flexDirection: "row", alignItems: "center", elevation: 8,
  },
  confirmarPuntoButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 15 },
  evacuarButton: {
    backgroundColor: "#ef476f", paddingVertical: 16, paddingHorizontal: 28, borderRadius: 30,
    flexDirection: "row", alignItems: "center", elevation: 8,
    shadowColor: "#ef476f", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8,
  },
  evacuarButtonResaltado: { shadowOpacity: 0.9, shadowRadius: 16, elevation: 16 },
  evacuarButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 16, letterSpacing: 1 },
  cancelarButton: {
    position: "absolute", bottom: 170, alignSelf: "center",
    backgroundColor: "#073b4c", paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30, elevation: 8,
  },
  cancelarButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 16 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#073b4c" },
  mapTypeRow: { flexDirection: "row", justifyContent: "space-around" },
  mapTypeOption: { alignItems: "center", width: 72 },
  mapTypeIconBox: {
    width: 64, height: 64, borderRadius: 14, backgroundColor: "#f4f4f4",
    borderWidth: 2, borderColor: "#e0e0e0", justifyContent: "center", alignItems: "center", marginBottom: 8,
  },
  mapTypeIconBoxActive: { borderColor: "#118ab2", backgroundColor: "#e8f4fd" },
  mapTypeLabel: { fontSize: 13, color: "#073b4c", fontWeight: "500", textAlign: "center" },
  mapTypeLabelActive: { color: "#118ab2", fontWeight: "700" },
});