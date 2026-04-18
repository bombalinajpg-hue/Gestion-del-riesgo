/**
 * Componente principal del mapa — versión v4.
 *
 * Nuevas features sobre v3:
 *   - Marker de destino tappable → abre RefugeDetailsModal
 *   - Botón 👥 (grupo familiar) en columna izquierda
 *   - Botón 🔍 (personas desaparecidas) en columna izquierda
 *   - Markers de personas desaparecidas en el mapa (naranja)
 *   - Markers de miembros del grupo familiar que compartieron ubicación
 *   - Loading spinner en el botón iniciar cuando está calculando
 *   - Debounce de 200ms para recalcular rutas — evita re-cómputos
 *     cuando el usuario cambia parámetros rápidamente
 *
 * Requisito externo:
 *   - `.env` debe tener `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=...`
 *     para que Street View embebido funcione
 *   - `npx expo install expo-clipboard` (para grupo familiar)
 */

import { MaterialIcons } from "@expo/vector-icons";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import {
  fetchPOIs,
  getCategoryIcon,
  POIFeature,
} from "../src/services/poiService";
import type {
  Destino,
  DestinoFinal,
  HazardFeatureProperties,
} from "../src/types/types";
import {
  getGraph,
  linkDestinations,
  loadGraph,
} from "../src/services/graphService";
import { computeRoute } from "../src/services/localRouter";
import {
  precomputeIsochrones,
  queryFromLocation,
} from "../src/services/isochroneService";
import {
  getActiveBlockingAlerts,
  recomputePublicAlerts,
} from "../src/services/reportsService";
import { getActiveMissing } from "../src/services/missingPersonsService";
import { getAllGroups } from "../src/services/familyGroupsService";
import { getRefugeByName } from "../src/services/refugesService";
import type { IsochroneTable, PublicAlert } from "../src/types/graph";
import type { MissingPerson, FamilyGroup, RefugeDetails } from "../src/types/v4";
import {
  findPolygonExitPoint,
  isPointInAnyPolygonOrMulti,
} from "../src/utils/geometry";
import { useRouteCalculationState } from "../src/utils/useRouteCalculationState";
import FamilyGroupModal from "./FamilyGroupModal";
import IsochroneOverlay from "./IsochroneOverlay";
import MissingPersonsModal from "./MissingPersonsModal";
import PreparednessModal from "./PreparednessModal";
import RefugeDetailsModal from "./RefugeDetailsModal";
import ReportButton from "./ReportButton";
import ReportModal from "./ReportModal";
import SafetyStatusModal from "./SafetyStatusModal";
import StreetViewModal from "./StreetViewModal";
import WeatherBadge from "./WeatherBadge";

type HazardCollection = FeatureCollection<Geometry, HazardFeatureProperties>;

const destinos = destinosRaw as Destino[];
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
  const [destinoFinal, setDestinoFinal] = useState<DestinoFinal | null>(null);
  const [alertaDangerMostrada, setAlertaDangerMostrada] = useState(false);
  const [puntoConfirmado, setPuntoConfirmado] = useState(false);
  const [mapType, setMapType] = useState<MapType>("hybrid");
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState<POIFeature[]>([]);
  const [resaltarIniciar, setResaltarIniciar] = useState(false);
  const [resumenRuta, setResumenRuta] = useState<{ distancia: string; tiempo: string } | null>(null);

  const [graphReady, setGraphReady] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [preparednessVisible, setPreparednessVisible] = useState(false);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);
  const [streetViewVisible, setStreetViewVisible] = useState(false);
  const [missingModalVisible, setMissingModalVisible] = useState(false);
  const [familyModalVisible, setFamilyModalVisible] = useState(false);
  const [refugeDetailsVisible, setRefugeDetailsVisible] = useState(false);
  const [refugeDetailsData, setRefugeDetailsData] = useState<RefugeDetails | null>(null);
  const [blockingAlerts, setBlockingAlerts] = useState<PublicAlert[]>([]);
  const [missingPersons, setMissingPersons] = useState<MissingPerson[]>([]);
  const [familyGroups, setFamilyGroups] = useState<FamilyGroup[]>([]);
  const [isoTable, setIsoTable] = useState<IsochroneTable | null>(null);
  const [showIsochroneOverlay, setShowIsochroneOverlay] = useState(false);

  const { isCalculating, setCalculating, scheduleCalculation, cancelAll } = useRouteCalculationState();

  const {
    selectedDestination, setSelectedDestination,
    selectedInstitucion, setSelectedInstitucion,
    routeProfile,
    startMode, setStartMode,
    startPoint, setStartPoint,
    destinationMode, setDestinationMode,
    emergencyType, setEmergencyType,
    shouldCenterOnUser, setShouldCenterOnUser,
    setShouldScrollToDestinos,
  } = useRouteContext();

  const abortRef = useRef<AbortController | null>(null);
  const linkedDestinosRef = useRef<ReturnType<typeof linkDestinations> | null>(null);

  const mmBaja = filterByCategoria(movimientoMasa, "Baja");
  const mmMedia = filterByCategoria(movimientoMasa, "Media");
  const mmAlta = filterByCategoria(movimientoMasa, "Alta");
  const InundMedia = filterByCategoria(inundacion, "Media");
  const InundAlta = filterByCategoria(inundacion, "Alta");
  const avMedia = filterByCategoria(avenidaTorrencial, "Media");
  const avAlta = filterByCategoria(avenidaTorrencial, "Alta");

  const navigation = useNavigation();

  // ── Grafo ───────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      loadGraph(rawGraph as any);
      linkedDestinosRef.current = linkDestinations(destinos.filter((d) => d.tipo === "punto_encuentro"));
      setGraphReady(true);
    } catch (e) {
      console.error("[MapView] Fallo al cargar grafo:", e);
      Alert.alert("Grafo no disponible", "Ejecuta `node scripts/build-graph.js`.");
    }
  }, []);

  // ── Ubicación ───────────────────────────────────────────────────────────
  useEffect(() => {
    let locSub: Location.LocationSubscription | undefined;
    let headSub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) { if (!cancelled) { setLocationError("disabled"); setLoading(false); } return; }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { if (!cancelled) { setLocationError("denied"); setLoading(false); } return; }
        try {
          const fix = await Location.getLastKnownPositionAsync();
          if (fix && !cancelled) { setLocation(fix.coords); setLoading(false); }
        } catch {}
        locSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 3 },
          (loc) => { if (!cancelled) { setLocation(loc.coords); setLoading(false); } },
        );
        headSub = await Location.watchHeadingAsync((h) => {
          if (!cancelled) setHeading(h.trueHeading ?? h.magHeading ?? 0);
        });
      } catch {
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

  useEffect(() => { fetchPOIs(4.8767129, -75.627213).then(setPois); }, []);

  // ── Alertas + desaparecidos + grupo familiar (refresh periódico) ───────
  const refreshAux = async () => {
    try {
      await recomputePublicAlerts();
      setBlockingAlerts(await getActiveBlockingAlerts());
      setMissingPersons(await getActiveMissing());
      setFamilyGroups(await getAllGroups());
    } catch (e) { console.warn("[MapView] refreshAux:", e); }
  };

  useEffect(() => {
    if (!graphReady) return;
    refreshAux();
    const t = setInterval(refreshAux, 60_000);
    return () => clearInterval(t);
  }, [graphReady]);

  // ── Isócronas con debounce ──────────────────────────────────────────────
  useEffect(() => {
    if (!graphReady) return;
    if (emergencyType === "ninguna") { setIsoTable(null); return; }
    if (!linkedDestinosRef.current) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const table = await precomputeIsochrones({
          profile: routeProfile ?? "foot-walking",
          emergencyType,
          destinations: linkedDestinosRef.current!,
        });
        if (!cancelled) setIsoTable(table);
      } catch (e) { console.warn("[MapView] Isócronas:", e); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [graphReady, emergencyType, routeProfile]);

  // ── Cálculo de ruta ─────────────────────────────────────────────────────
  const calcularRuta = async (markAsEvacuando: boolean) => {
    if (!location || !graphReady) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let finalDestination: DestinoFinal | null = selectedInstitucion ?? selectedDestination;
    const puntosEncuentro = destinos.filter((d) => d.tipo === "punto_encuentro");

    if (destinationMode === "closest") {
      const userLocation = startMode === "manual" && startPoint
        ? { latitude: startPoint.lat, longitude: startPoint.lng }
        : { latitude: location.latitude, longitude: location.longitude };
      finalDestination = closestByHaversine(userLocation, puntosEncuentro);
    }
    if (!finalDestination) return;
    setDestinoFinal(finalDestination);

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
    const alternativeEnds = destinationMode === "closest"
      ? puntosEncuentro.map((d) => ({ lat: d.lat, lng: d.lng, name: d.nombre })) : undefined;

    try {
      const result = await computeRoute({
        start: { lat: startLat, lng: startLng },
        end: { lat: finalDestination.lat, lng: finalDestination.lng },
        profile, emergencyType, algorithm: "a-star", alternativeEnds,
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
      if (destinationMode === "closest" && result.destinationName && result.destinationName !== finalDestination.nombre) {
        const chosen = puntosEncuentro.find((d) => d.nombre === result.destinationName);
        if (chosen) setDestinoFinal({ nombre: chosen.nombre, lat: chosen.lat, lng: chosen.lng });
      }
      setResumenRuta(formatRouteSummary(result.distanceMeters, result.durationSeconds));
      setDangerSegment(dangerCoords);
      setRouteCoords(routeCoords);
      if (markAsEvacuando) { setEvacuando(true); setRutaSugerida(false); }
      else { setRutaSugerida(true); }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("[MapView] Ruta:", err);
      if (markAsEvacuando) Alert.alert("Error", "No se pudo calcular la ruta.");
    }
  };

  // ── Auto-cálculo con debounce ───────────────────────────────────────────
  const autoCalcDeps = [
    graphReady, emergencyType, routeProfile, destinationMode,
    selectedDestination, selectedInstitucion, startMode, startPoint,
    puntoConfirmado, location,
  ];
  useEffect(() => {
    if (evacuando) return;
    if (!location || !graphReady) return;
    if (emergencyType === "ninguna") return;
    const ubicacionLista = startMode === "gps" || (startMode === "manual" && startPoint !== null && puntoConfirmado);
    const destinoListo = destinationMode === "closest" || selectedDestination !== null || selectedInstitucion !== null;
    if (!ubicacionLista || !destinoListo || !routeProfile) return;
    if (rutaSugerida && routeCoords.length > 0) return;
    // Debounce de 300ms para que cambios rápidos no disparen muchos cálculos
    scheduleCalculation('auto-route', () => calcularRuta(false), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, autoCalcDeps);

  const iniciarEvacuacion = async () => {
    if (!location || evacuando || !graphReady) return;
    await setCalculating(() => calcularRuta(true));
  };

  const handleCenterOnUser = () => {
    if (!location) return;
    mapRef.current?.animateToRegion(
      { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600,
    );
  };

  const handleResetAll = () => {
    cancelAll();
    abortRef.current?.abort();
    setEvacuando(false);
    setRutaSugerida(false);
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
  };

  const handleResetConfirm = () => {
    const haySeleccion = emergencyType !== "ninguna" ||
      selectedDestination !== null || selectedInstitucion !== null ||
      startMode === "manual" || rutaSugerida || evacuando;
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

  const handleOpenGoogleMaps = () => {
    if (!location || !destinoFinal) return;
    const sLat = startMode === "manual" && startPoint ? startPoint.lat : location.latitude;
    const sLng = startMode === "manual" && startPoint ? startPoint.lng : location.longitude;
    openInGoogleMaps(sLat, sLng, destinoFinal.lat, destinoFinal.lng, routeProfile ?? "foot-walking");
  };

  const handleOpenRefugeDetails = (nombre: string) => {
    const details = getRefugeByName(nombre);
    if (details) {
      setRefugeDetailsData(details);
      setRefugeDetailsVisible(true);
    } else {
      // Si no hay ficha detallada, mostramos un placeholder básico
      setRefugeDetailsData({
        nombre,
        servicios: [],
        descripcion: "Aún no hay información detallada para este punto.",
      });
      setRefugeDetailsVisible(true);
    }
  };

  const userIsochroneQuery = useMemo(() => {
    if (!isoTable || !location || !graphReady) return null;
    return queryFromLocation(location.latitude, location.longitude, isoTable, getGraph());
  }, [isoTable, location, graphReady]);

  // Miembros del grupo familiar con ubicación conocida — para marcadores
  const familyMembersWithLocation = useMemo(() => {
    const out: { deviceId: string; name: string; lat: number; lng: number; groupName: string }[] = [];
    for (const g of familyGroups) {
      for (const m of g.members) {
        if (m.lat !== undefined && m.lng !== undefined) {
          out.push({ deviceId: m.deviceId, name: m.name, lat: m.lat, lng: m.lng, groupName: g.name });
        }
      }
    }
    return out;
  }, [familyGroups]);

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

  const ubicacionLista = startMode === "gps" || (startMode === "manual" && startPoint !== null && puntoConfirmado);
  const destinoListo = destinationMode === "closest" || selectedDestination !== null || selectedInstitucion !== null;
  const todosLosParametros = emergencyType !== "ninguna" && routeProfile !== null && destinoListo && ubicacionLista;
  const seleccionandoPunto = startMode === "manual" && !evacuando;
  const puntoPendiente = seleccionandoPunto && startPoint !== null && !puntoConfirmado;
  const hayRutaCalculada = routeCoords.length > 0 || dangerSegment.length > 0;
  const mostrarBotonIniciar = todosLosParametros && !evacuando && hayRutaCalculada && rutaSugerida;
  const iconoModo = routeProfile === "driving-car" ? "🚗" : routeProfile === "cycling-regular" ? "🚴" : "🚶";
  const mostrarIsocronas = showIsochroneOverlay && isoTable !== null && !evacuando && emergencyType !== "ninguna";
  const mostrarBotonReset = emergencyType !== "ninguna" || selectedDestination !== null ||
    selectedInstitucion !== null || startMode === "manual" || rutaSugerida || evacuando;

  return (
    <View style={styles.container}>
      <View style={styles.floatingTitle}>
        <Text style={styles.floatingTitleText}>Rutas de Evacuación</Text>
      </View>

      <TouchableOpacity
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        style={styles.menuButton}
      >
        <Text style={{ fontSize: 24 }}>☰</Text>
      </TouchableOpacity>

      {/* ── Columna izquierda ─────────────────────────────────────────── */}
      <View style={styles.leftActionColumn} pointerEvents="box-none">
        <ReportButton
          onPress={() => setReportModalVisible(true)}
          nearbyAlertCount={blockingAlerts.length}
          disabled={evacuando}
        />
        <TouchableOpacity
          style={[styles.squareActionBtn, { backgroundColor: "#0891b2" }]}
          onPress={() => setPreparednessVisible(true)}
        >
          <Text style={{ fontSize: 20 }}>🎒</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.squareActionBtn, { backgroundColor: "#10b981" }]}
          onPress={() => setSafetyModalVisible(true)}
        >
          <Text style={{ fontSize: 20 }}>🛡️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.squareActionBtn, { backgroundColor: "#7c3aed" }]}
          onPress={() => setFamilyModalVisible(true)}
          accessibilityLabel="Grupo familiar"
        >
          <Text style={{ fontSize: 20 }}>👨‍👩‍👧</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.squareActionBtn,
            { backgroundColor: "#db2777" },
            missingPersons.length > 0 && { borderWidth: 2, borderColor: "#fef3c7" },
          ]}
          onPress={() => setMissingModalVisible(true)}
          accessibilityLabel="Personas desaparecidas"
        >
          <Text style={{ fontSize: 20 }}>🔍</Text>
          {missingPersons.length > 0 && (
            <View style={styles.miniBadge}>
              <Text style={styles.miniBadgeText}>{Math.min(missingPersons.length, 9)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Columna derecha superior ──────────────────────────────────── */}
      <View style={styles.topRightGroup} pointerEvents="box-none">
        <TouchableOpacity style={styles.squareButton} onPress={() => setShowMapTypePicker(true)}>
          <MaterialIcons name="layers" size={24} color="#073b4c" />
        </TouchableOpacity>
        <WeatherBadge />
        <TouchableOpacity
          style={[
            styles.squareButton,
            showIsochroneOverlay && { backgroundColor: "#10b981" },
            !isoTable && { opacity: 0.4 },
          ]}
          onPress={() => {
            if (!isoTable) {
              Alert.alert("Isócronas no disponibles", "Selecciona un tipo de emergencia para ver el mapa de tiempo a seguridad.");
              return;
            }
            setShowIsochroneOverlay((v) => !v);
          }}
        >
          <MaterialIcons name="timer" size={24} color={showIsochroneOverlay ? "#ffffff" : "#073b4c"} />
        </TouchableOpacity>
        <View style={styles.roundButton}>
          <NorthArrow heading={heading} />
        </View>
      </View>

      {/* ── BANNERS ─────────────────────────────────────────────────── */}
      {evacuando && routeCoords.length > 0 && (
        <View style={styles.evacuandoBanner}>
          <Text style={styles.evacuandoText}>🚨 Evacuando</Text>
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
      {!evacuando && !rutaSugerida && userIsochroneQuery && emergencyType !== "ninguna" && (
        <View style={styles.isochroneInfoBanner}>
          <Text style={styles.isochroneInfoTitle}>⏱️ Tiempo a seguridad</Text>
          <Text style={styles.isochroneInfoTime}>{Math.round(userIsochroneQuery.timeSeconds / 60)} min</Text>
          <Text style={styles.isochroneInfoDest} numberOfLines={1}>→ {userIsochroneQuery.destName}</Text>
        </View>
      )}

      {/* ── MAPA ──────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapType}
        showsCompass={false}
        showsMyLocationButton={false}
        initialRegion={{ latitude: 4.8767129, longitude: -75.627213, latitudeDelta: 0.007, longitudeDelta: 0.007 }}
        showsUserLocation
        onPress={(e) => {
          if (startMode !== "manual" || evacuando) return;
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

        {/* Destino principal — tappable para ver ficha del refugio */}
        {destinoFinal && (
          <Marker
            coordinate={{ latitude: destinoFinal.lat, longitude: destinoFinal.lng }}
            title={destinoFinal.nombre}
            pinColor="azure"
            onPress={() => handleOpenRefugeDetails(destinoFinal.nombre)}
          />
        )}

        {startMode === "manual" && startPoint && (
          <Marker
            coordinate={{ latitude: startPoint.lat, longitude: startPoint.lng }}
            title="Punto inicial"
            pinColor="orange"
          />
        )}

        {/* Alertas ciudadanas */}
        {blockingAlerts.map((alert) => (
          <Marker
            key={alert.id}
            coordinate={{ latitude: alert.lat, longitude: alert.lng }}
            title={labelForAlertType(alert.type)}
            description={`${alert.uniqueDeviceCount} ciudadano(s) · ${Math.round(alert.confidence * 100)}% confianza`}
            pinColor="red"
          />
        ))}

        {/* Personas desaparecidas — marker circular distintivo */}
        {missingPersons.map((p) => (
          <Marker
            key={`missing-${p.id}`}
            coordinate={{ latitude: p.lastSeenLat, longitude: p.lastSeenLng }}
            title={`🔍 ${p.name} · desaparecido/a`}
            description={p.description.substring(0, 80)}
            onPress={() => setMissingModalVisible(true)}
          >
            <View style={styles.missingMarker}>
              <Text style={{ fontSize: 16 }}>🔍</Text>
            </View>
          </Marker>
        ))}

        {/* Miembros del grupo familiar con ubicación */}
        {familyMembersWithLocation.map((m) => (
          <Marker
            key={`family-${m.deviceId}`}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={`👨‍👩‍👧 ${m.name}`}
            description={m.groupName}
          >
            <View style={styles.familyMarker}>
              <Text style={styles.familyMarkerText}>
                {m.name.substring(0, 1).toUpperCase()}
              </Text>
            </View>
          </Marker>
        ))}

        {pois.map((poi, index) => {
          const icon = getCategoryIcon(poi);
          const [lng, lat] = poi.geometry.coordinates;
          const name = poi.properties.osm_tags?.name ?? icon.label;
          return (
            <Marker
              key={`poi-${index}`}
              coordinate={{ latitude: lat, longitude: lng }}
              title={name}
              description={poi.properties.category_ids ? Object.values(poi.properties.category_ids)[0]?.category_name : ""}
            >
              <View style={{ backgroundColor: icon.color, borderRadius: 20, padding: 4, borderWidth: 2, borderColor: "#fff" }}>
                <Text style={{ fontSize: 16 }}>{icon.label}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* ── Columna derecha inferior ──────────────────────────────────── */}
      <View style={styles.bottomRightGroup} pointerEvents="box-none">
        {(evacuando || rutaSugerida) && destinoFinal && (
          <TouchableOpacity
            style={[styles.bottomRightBtn, { backgroundColor: "#6366f1" }]}
            onPress={() => setStreetViewVisible(true)}
          >
            <MaterialIcons name="streetview" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        {(evacuando || rutaSugerida) && destinoFinal && (
          <TouchableOpacity
            style={[styles.bottomRightBtn, { backgroundColor: "#3b82f6" }]}
            onPress={handleOpenGoogleMaps}
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

      {/* ── MODALES ───────────────────────────────────────────────── */}
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

      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmitted={refreshAux}
        initialLocation={location ? { lat: location.latitude, lng: location.longitude } : undefined}
      />

      <PreparednessModal visible={preparednessVisible} onClose={() => setPreparednessVisible(false)} />

      <SafetyStatusModal
        visible={safetyModalVisible}
        onClose={() => setSafetyModalVisible(false)}
        location={location ? { latitude: location.latitude, longitude: location.longitude } : null}
        refugeName={evacuando && destinoFinal ? destinoFinal.nombre : undefined}
      />

      <MissingPersonsModal
        visible={missingModalVisible}
        onClose={() => { setMissingModalVisible(false); refreshAux(); }}
      />

      <FamilyGroupModal
        visible={familyModalVisible}
        onClose={() => { setFamilyModalVisible(false); refreshAux(); }}
      />

      <RefugeDetailsModal
        visible={refugeDetailsVisible}
        onClose={() => setRefugeDetailsVisible(false)}
        refuge={refugeDetailsData}
        onNavigate={refugeDetailsData ? () => {
          // Ya tenemos destino seleccionado — no hace falta re-setear nada
        } : undefined}
        onStreetView={refugeDetailsData ? () => {
          setStreetViewVisible(true);
        } : undefined}
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

      {/* ── Banners de ayuda ─────────────────────────────────────── */}
      {seleccionandoPunto && startPoint === null && (
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
            onPress={iniciarEvacuacion}
            disabled={isCalculating}
          >
            {isCalculating ? (
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            ) : (
              <MaterialIcons name="directions-run" size={22} color="#ffffff" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.evacuarButtonText}>
              {isCalculating ? "CALCULANDO..." : "COMENZAR EVACUACIÓN"}
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
  evacuandoBanner: {
    position: "absolute", top: 176, alignSelf: "center", zIndex: 10,
    backgroundColor: "#073b4c", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  evacuandoText: { color: "#ffffff", fontWeight: "700", fontSize: 14, includeFontPadding: false },
  resumenBanner: {
    position: "absolute", top: 224, alignSelf: "center", zIndex: 10,
    backgroundColor: "#ffffffee", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
    elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    alignItems: "center", maxWidth: "70%",
  },
  resumenText: { color: "#073b4c", fontWeight: "700", fontSize: 13, includeFontPadding: false },
  resumenSub: { color: "#6b7280", fontSize: 11, marginTop: 2 },
  isochroneInfoBanner: {
    position: "absolute", top: 224, alignSelf: "center", zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    alignItems: "center", maxWidth: "70%",
  },
  isochroneInfoTitle: { color: "#374151", fontSize: 11, fontWeight: "600" },
  isochroneInfoTime: { color: "#10b981", fontSize: 20, fontWeight: "800", marginTop: 2 },
  isochroneInfoDest: { color: "#6b7280", fontSize: 11, marginTop: 2, maxWidth: 200 },
  missingMarker: {
    backgroundColor: "#fbbf24",
    borderRadius: 18,
    width: 36, height: 36,
    justifyContent: "center", alignItems: "center",
    borderWidth: 3, borderColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3,
  },
  familyMarker: {
    backgroundColor: "#7c3aed",
    borderRadius: 18,
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
