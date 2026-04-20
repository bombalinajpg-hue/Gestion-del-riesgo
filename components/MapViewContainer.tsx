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
import type { FeatureCollection, Geometry } from "geojson";
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
import MapView, { MapType, Marker, Polyline } from "react-native-maps";
import { useRouteContext } from "../context/RouteContext";
import avenidaTorrencialData from "../data/amenaza_avenida_torrencial.json";
import InundacionData from "../data/amenaza_inundacion.json";
import movimientoMasaData from "../data/amenaza_movimiento_en_masa.json";
import destinosRaw from "../data/destinos.json";
import institucionesRaw from "../data/instituciones.json";
import { getGraph } from "../src/services/graphService";
import { queryFromLocation } from "../src/services/isochroneService";
import { getRefugeByName } from "../src/services/refugesService";
import { useCommunityStatus } from "../src/hooks/useCommunityStatus";
import { useGraphBootstrap } from "../src/hooks/useGraphBootstrap";
import { useIsochrones } from "../src/hooks/useIsochrones";
import { useLocationTracking } from "../src/hooks/useLocationTracking";
import { useQuickRoutePipeline } from "../src/hooks/useQuickRoutePipeline";
import { useRoutePlanning } from "../src/hooks/useRoutePlanning";
import type { IsochroneTable } from "../src/types/graph";
import type {
  Destino,
  HazardFeatureProperties,
  Institucion,
} from "../src/types/types";
import type { RefugeDetails } from "../src/types/v4";
import { DEV_MOCK_LOCATION } from "../src/utils/devMock";
import { useRouteCalculationState } from "../src/utils/useRouteCalculationState";
import IsochroneLegend from "./IsochroneLegend";
import IsochroneOverlay from "./IsochroneOverlay";
import MapHazardLayers from "./MapHazardLayers";
import MapTopControls from "./MapTopControls";
import RefugeDetailsModal from "./RefugeDetailsModal";
import RouteStatusBanners from "./RouteStatusBanners";
import StreetViewModal from "./StreetViewModal";

type HazardCollection = FeatureCollection<Geometry, HazardFeatureProperties>;

const destinos = destinosRaw as Destino[];
const instituciones = institucionesRaw as Institucion[];

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

// Los datos vienen de JSONs importados estáticamente — son inmutables.
// Computamos las capas filtradas una sola vez a nivel de módulo en lugar
// de re-filtrar ~3000 features en cada render.
const mmBaja = filterByCategoria(movimientoMasa, "Baja");
const mmMedia = filterByCategoria(movimientoMasa, "Media");
const mmAlta = filterByCategoria(movimientoMasa, "Alta");
const InundMedia = filterByCategoria(inundacion, "Media");
const InundAlta = filterByCategoria(inundacion, "Alta");
const avMedia = filterByCategoria(avenidaTorrencial, "Media");
const avAlta = filterByCategoria(avenidaTorrencial, "Alta");

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

const MAP_TYPES: { label: string; value: MapType; icon: MaterialIconName }[] = [
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

function openInGoogleMaps(sLat: number, sLng: number, eLat: number, eLng: number, profile: string) {
  const travelmode = profile === "driving-car" ? "driving"
    : profile === "cycling-regular" ? "bicycling" : "walking";
  const url = `https://www.google.com/maps/dir/?api=1&origin=${sLat},${sLng}&destination=${eLat},${eLng}&travelmode=${travelmode}`;
  Linking.openURL(url).catch(() => Alert.alert("No se pudo abrir Google Maps"));
}

export default function MapViewContainer() {
  const mapRef = useRef<MapView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // GPS + heading encapsulados en hook; ver src/hooks/useLocationTracking.ts.
  const { location, heading, loading, locationError } = useLocationTracking();
  // Estado de ruta (routeCoords, destinoFinal, evacuando, rutaSugerida,
  // rutaRiesgosa, resumen, alertaDangerMostrada) + calcularRuta viven
  // en useRoutePlanning. Se instancia más abajo, tras tener location,
  // graphReady, emergencyType, isoTable, etc.
  const [puntoConfirmado, setPuntoConfirmado] = useState(false);
  const [mapType, setMapType] = useState<MapType>("hybrid");
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);
  const [resaltarIniciar, setResaltarIniciar] = useState(false);

  const [streetViewVisible, setStreetViewVisible] = useState(false);
  const [refugeDetailsVisible, setRefugeDetailsVisible] = useState(false);
  const [refugeDetailsData, setRefugeDetailsData] = useState<RefugeDetails | null>(null);
  // Alertas ciudadanas vienen de la cache compartida. El poll de 60 s
  // abajo dispara recompute para mantener el clustering fresco; el resto
  // de pantallas ve los mismos datos sin duplicar queries.
  const { alerts: blockingAlerts, refresh: refreshCommunity } = useCommunityStatus();
  // isoTable + computeIso encapsulados (ver useIsochrones). Se configura
  // tras `routeProfile` y `emergencyType` más abajo vía useRouteContext.
  const [showIsochroneOverlay, setShowIsochroneOverlay] = useState(false);
  const [showLugares, setShowLugares] = useState(false);

  const { isCalculating, setCalculating, cancelAll } = useRouteCalculationState();

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
    pickingFromIsochroneMap, setPickingFromIsochroneMap,
    showingInstitucionesOverlay, setShowingInstitucionesOverlay,
    quickRouteMode, setQuickRouteMode,
  } = useRouteContext();

  const navigation = useNavigation();
  const router = useRouter();
  // `useLocalSearchParams` puede devolver `string | string[]` si una clave
  // aparece duplicada en la URL. Normalizamos al primer valor y validamos
  // contra los literales esperados; cualquier valor desconocido queda como
  // `undefined` para que los efectos downstream no dispararen por error.
  // `autoRoute=1` sigue siendo significativo (lo usa useQuickRoutePipeline
  // para disparar cálculo automático desde EmergencyScreen). `autoOpen`
  // quedó como informativo; ya no dispara navegación automática.
  const rawParams = useLocalSearchParams<{ autoRoute?: string | string[] }>();
  const autoRoute = (() => {
    const v = Array.isArray(rawParams.autoRoute) ? rawParams.autoRoute[0] : rawParams.autoRoute;
    return v === "1" ? v : undefined;
  })();

  const puntosEncuentro = useMemo(
    () => destinos.filter((d) => d.tipo === "punto_encuentro"),
    [],
  );

  // Grafo + snap encapsulados en hook. Devuelve cuando todo está listo
  // y los destinos ya están asociados a sus nodos del grafo.
  const { graphReady, linkedDestinos } = useGraphBootstrap(puntosEncuentro);

  // Tabla de isócronas: cálculo, cache y auto-refresh con debounce.
  const { isoTable, isoError, isoComputing, computeIso } = useIsochrones({
    graphReady,
    linkedDestinos,
    emergencyType,
    routeProfile,
  });

  // Estado de ruta + calcularRuta encapsulados (ver useRoutePlanning).
  const {
    routeCoords, dangerSegment,
    destinoFinal,
    rutaSugerida, evacuando,
    rutaRiesgosa, resumenRuta,
    calcularRuta, resetRouteState,
  } = useRoutePlanning({
    location, graphReady, puntosEncuentro,
    emergencyType, routeProfile, startMode, startPoint, destinationMode,
    selectedDestination, selectedInstitucion,
    isoTable, computeIso,
    hazardByEmergency: {
      inundacion,
      movimiento_en_masa: movimientoMasa,
      avenida_torrencial: avenidaTorrencial,
    },
  });

  // Antes llegar con `?autoOpen=drawer` abría el drawer automáticamente.
  // Ahora mostramos un FAB rojo destacado (ícono de persona corriendo)
  // para que el usuario decida cuándo abrir el menú de parámetros —
  // aterrizar directo en el drawer se sentía como un salto sin contexto.
  // El flag `autoOpen=drawer` sigue siendo legítimo en la URL, solo que
  // ya no dispara nada: lo conservamos por compatibilidad con deep-links
  // existentes (HomeScreen, widgets externos) sin cambiar su contrato.

  // Suscripción de GPS + heading encapsulada en useLocationTracking.

  useEffect(() => {
    if (!shouldCenterOnUser || !location) return;
    mapRef.current?.animateToRegion(
      { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600,
    );
    setShouldCenterOnUser(false);
  }, [shouldCenterOnUser, location]);

  // Cambio de startMode: reset de puntoConfirmado y del startPoint si
  // vuelve a "gps". El limpiado de coords/rutaSugerida lo hace el hook.
  useEffect(() => {
    setPuntoConfirmado(false);
    if (startMode === "gps") setStartPoint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMode]);

  useEffect(() => {
    if (startMode === "manual" && startPoint) {
      setPuntoConfirmado(false);
    }
  }, [startPoint, startMode]);

  // La sincronización destinoFinal ← selectedDestination/selectedInstitucion
  // vive ahora dentro de useRoutePlanning.

  useEffect(() => {
    if (!selectedDestination && !selectedInstitucion) return;
    setResaltarIniciar(true);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      { iterations: 4 },
    );
    anim.start(() => setResaltarIniciar(false));
    return () => {
      // Si el componente se desmonta o cambia la selección a mitad del
      // pulso, detenemos la animación y el callback de final — sin esto
      // Animated mantendría el driver corriendo sobre un valor huérfano.
      anim.stop();
      pulseAnim.setValue(1);
    };
  }, [selectedDestination, selectedInstitucion, pulseAnim]);

  // Poll de alertas/desaparecidos/familia cada 60 s, SOLO con la app en
  // primer plano. Dispara recompute para reclusterizar los reports; los
  // demás consumidores de useCommunityStatus reciben los datos nuevos
  // automáticamente via la cache compartida.
  useEffect(() => {
    if (!graphReady) return;
    const tick = () => refreshCommunity({ recompute: true });
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval !== null) return;
      tick();
      interval = setInterval(tick, 60_000);
    };
    const stop = () => {
      if (interval !== null) { clearInterval(interval); interval = null; }
    };
    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") start(); else stop();
    });
    return () => { stop(); sub.remove(); };
  }, [graphReady, refreshCommunity]);

  // calcularRuta vive ahora en useRoutePlanning (arriba).

  // El cálculo solo lo dispara el botón "CALCULAR RUTA DE EVACUACIÓN"
  // explícitamente; antes había un auto-route al cambiar de emergencia
  // que resultaba confuso (veías una ruta sin haberla pedido).

  // Botón principal "CALCULAR RUTA DE EVACUACIÓN" — calcula ruta + inicia
  // evacuación. Acepta dos casos:
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
    resetRouteState();
    setPuntoConfirmado(false);
    setStartPoint(null);
    setStartMode("gps");
    setEmergencyType("ninguna");
    setSelectedDestination(null);
    setSelectedInstitucion(null);
    setDestinationMode("closest");
    setResaltarIniciar(false);
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

  // Pipeline QUICK ROUTE (desde EmergencyScreen): ver src/hooks/useQuickRoutePipeline.
  useQuickRoutePipeline({
    quickRouteMode, setQuickRouteMode,
    autoRouteParam: autoRoute,
    graphReady, location,
    startMode, startPoint, emergencyType, evacuando,
    destinoFinal, selectedDestination, selectedInstitucion,
    destinationMode,
    pickingFromIsochroneMap, showingInstitucionesOverlay,
    setDestinationMode, setPickingFromIsochroneMap,
    setShowingInstitucionesOverlay, setShowIsochroneOverlay,
    setPuntoConfirmado, setStreetViewVisible,
    calcularRuta, setCalculating,
    openGoogleMaps: handleOpenGoogleMaps,
  });

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

  // Memoizado para no llamar `getGraph()` en cada render dentro del JSX.
  // El grafo es singleton y no cambia tras `graphReady`, así que la
  // identidad es estable — IsochroneOverlay puede memoizarse sobre `graph`.
  const graphForOverlay = useMemo(
    () => (graphReady ? getGraph() : null),
    [graphReady],
  );

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
        accessibilityLabel="Abrir menú de emergencia"
        accessibilityRole="button"
      >
        <Text style={{ fontSize: 24 }}>☰</Text>
      </TouchableOpacity>

      {/* La columna izquierda con botones de reports/prep/safety/family/
          missing/instituciones se movió a sus propios módulos desde el
          rediseño v4.3. Este mapa se dedica exclusivamente a calcular
          la ruta de evacuación. */}

      <MapTopControls
        heading={heading}
        showIsochroneOverlay={showIsochroneOverlay}
        isoComputing={isoComputing}
        showLugares={showLugares}
        onOpenMapTypePicker={() => setShowMapTypePicker(true)}
        onToggleIsochrones={handleIsochroneButton}
        onToggleLugares={() => setShowLugares((v) => !v)}
      />

      {mostrarIsocronas && (
        <View style={styles.legendPosition} pointerEvents="none">
          <IsochroneLegend />
        </View>
      )}

      <RouteStatusBanners
        pickingFromIsochroneMap={pickingFromIsochroneMap}
        evacuando={evacuando}
        hasRouteCoords={routeCoords.length > 0}
        rutaSugerida={rutaSugerida}
        rutaRiesgosa={rutaRiesgosa}
        isCalculating={isCalculating}
        resumenRuta={resumenRuta}
        destinoFinal={destinoFinal}
        iconoModo={iconoModo}
      />

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

        <MapHazardLayers
          emergencyType={emergencyType}
          mmBaja={mmBaja} mmMedia={mmMedia} mmAlta={mmAlta}
          InundMedia={InundMedia} InundAlta={InundAlta}
          avMedia={avMedia} avAlta={avAlta}
        />

        {mostrarIsocronas && isoTable && graphForOverlay && (
          <IsochroneOverlay graph={graphForOverlay} table={isoTable} />
        )}

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
            lugares". Si viene de quickRoute la institución se toma como
            destino; si viene del toggle solo abre la info del marker. */}
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
        <TouchableOpacity
          style={styles.bottomRightBtn}
          onPress={handleCenterOnUser}
          accessibilityLabel="Centrar mapa en mi ubicación"
          accessibilityRole="button"
        >
          <MaterialIcons name="my-location" size={24} color="#073b4c" />
        </TouchableOpacity>
        {mostrarBotonReset && (
          <TouchableOpacity
            style={[styles.bottomRightBtn, { backgroundColor: "#fef2f2", borderWidth: 1.5, borderColor: "#fecaca" }]}
            onPress={handleResetConfirm}
            accessibilityLabel={evacuando ? "Cancelar evacuación" : "Limpiar selección"}
            accessibilityRole="button"
          >
            <MaterialIcons name="refresh" size={24} color="#dc2626" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.emergencyButton}
        onPress={handleLlamarEmergencia}
        accessibilityLabel="Llamar a la línea de emergencia 123"
        accessibilityRole="button"
        accessibilityHint="Abre el marcador telefónico con el número 123"
      >
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
                          <MaterialIcons name={type.icon} size={32} color={isActive ? "#118ab2" : "#073b4c"} />
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
          accessibilityLabel="Confirmar punto de inicio"
          accessibilityRole="button"
        >
          <MaterialIcons name="check-circle" size={20} color="#ffffff" style={{ marginRight: 8 }} />
          <Text style={styles.confirmarPuntoButtonText}>CONFIRMAR PUNTO DE INICIO</Text>
        </TouchableOpacity>
      )}

      {/* FAB de configuración — abre el drawer de parámetros. Color teal
          y ícono `tune` (perillas) para diferenciarlo de la acción de
          evacuación real, que es el botón azul "CALCULAR RUTA" abajo.
          Rojo quedaba para la acción panic del Home; acá el verdadero
          disparador de ruta no es este botón sino el siguiente. */}
      {!mostrarBotonIniciar && !evacuando && !pickingFromIsochroneMap && !showingInstitucionesOverlay && (
        <TouchableOpacity
          style={styles.configurarRutaFab}
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          activeOpacity={0.85}
          accessibilityLabel="Configurar parámetros de la ruta de evacuación"
          accessibilityRole="button"
          accessibilityHint="Abre el menú para elegir tipo de emergencia, perfil y punto de partida"
        >
          <MaterialIcons name="tune" size={22} color="#fff" />
          <Text style={styles.configurarRutaFabText}>CONFIGURAR</Text>
        </TouchableOpacity>
      )}

      {/* BOTÓN "CALCULAR RUTA DE EVACUACIÓN" — cuando todos los parámetros
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
            accessibilityLabel={isCalculating ? "Calculando ruta" : "Calcular ruta de evacuación"}
            accessibilityRole="button"
            accessibilityState={{ disabled: isCalculating, busy: isCalculating }}
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
        <TouchableOpacity
          style={styles.cancelarButton}
          onPress={handleResetConfirm}
          accessibilityLabel="Cancelar evacuación en curso"
          accessibilityRole="button"
        >
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
  // FAB "Configurar" — teal `#0f766e` para comunicar "acción secundaria,
  // tranquila, de configuración". El rojo queda reservado para acciones
  // de pánico (Home CTA "Evacua" + 123). Pill bottom-center.
  configurarRutaFab: {
    position: "absolute",
    bottom: 170,
    alignSelf: "center",
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  configurarRutaFabText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
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