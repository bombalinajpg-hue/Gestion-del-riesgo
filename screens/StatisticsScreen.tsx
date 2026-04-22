/**
 * Datos y Visor — mapa vivo de Santa Rosa con overlays de consulta y
 * un panel de resumen arrastable al fondo. No calcula rutas; es un
 * visor geográfico puro.
 *
 * Layout (vertical, top→bottom):
 *   · Header slim
 *   · Mapa full-screen (con chips flotantes de emergencia arriba,
 *     chips de toggles + cómputo de calor encima del sheet)
 *   · Bottom sheet arrastable:
 *       · Colapsado (~94 px): handle + "Resumen del municipio" + fila
 *         compacta de 4 métricas visibles siempre.
 *       · Expandido (~360 px): misma compacta + grid 2×2 de cards
 *         detalladas.
 *     Arrastrable con gesto vertical; snap al release según posición
 *     y velocidad. También se puede tocar el handle para toggle.
 *
 * La idea de diseño: el usuario debe poder "leer el municipio" con un
 * vistazo al mapa + chips, sin tener que expandir nada. El sheet se
 * expande sólo si quiere ver los números con más contexto.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Geojson, type MapType, Marker } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { FeatureCollection, Geometry } from "geojson";
import AlertsHeatLayer, { ALERTS_HEAT_BANDS } from "../components/AlertsHeatLayer";
import IsochroneLegend from "../components/IsochroneLegend";
import IsochroneOverlay from "../components/IsochroneOverlay";
import NorthArrow from "../components/NorthArrow";
import QuickEvacuateSheet, {
  type ConfirmPayload,
  type LockedDestination,
} from "../components/QuickEvacuateSheet";
import RefugeDetailsModal from "../components/RefugeDetailsModal";
import StreetViewModal from "../components/StreetViewModal";
import WeatherBadge from "../components/WeatherBadge";
import { useRouteContext } from "../context/RouteContext";
import { useLocationTracking } from "../src/hooks/useLocationTracking";
import * as Location from "expo-location";
import avenidaTorrencialData from "../data/amenaza_avenida_torrencial.json";
import inundacionData from "../data/amenaza_inundacion.json";
import movimientoMasaData from "../data/amenaza_movimiento_en_masa.json";
import destinosJson from "../data/destinos.json";
import institucionesJson from "../data/instituciones.json";
import {
  HAZARD_LEVELS,
  hazardFillColor,
  hazardStrokeColor,
} from "../src/theme/hazardColors";
import type { HazardFeatureProperties } from "../src/types/types";
import { useCommunityStatus } from "../src/hooks/useCommunityStatus";
import { useGraphBootstrap } from "../src/hooks/useGraphBootstrap";
import { getGraph } from "../src/services/graphService";
import { precomputeIsochrones } from "../src/services/isochroneService";
import { getAllBlockedEdgeIds } from "../src/services/reportsService";
import type { IsochroneTable } from "../src/types/graph";
import type { Destino, EmergencyType, Institucion } from "../src/types/types";

type HazardCollection = FeatureCollection<Geometry, HazardFeatureProperties>;

const destinos = destinosJson as Destino[];
const instituciones = institucionesJson as Institucion[];
const puntosEncuentro = destinos.filter((d) => d.tipo === "punto_encuentro");

// Colecciones de amenaza filtradas por categoría. Se computan una vez
// a nivel de módulo (los JSONs son inmutables, el filtrado es caro —
// ~3000 features en total) para no recalcular en cada render.
const inundacion = inundacionData as HazardCollection;
const movimientoMasa = movimientoMasaData as HazardCollection;
const avenidaTorrencial = avenidaTorrencialData as HazardCollection;

function filterByCategoria(
  coll: HazardCollection,
  cat: "Baja" | "Media" | "Alta",
): HazardCollection {
  return {
    ...coll,
    features: coll.features.filter((f) => f.properties?.Categoria === cat),
  };
}

const HAZARD_LAYERS: Record<
  Exclude<EmergencyType, "ninguna">,
  Record<"Baja" | "Media" | "Alta", HazardCollection>
> = {
  inundacion: {
    Baja: filterByCategoria(inundacion, "Baja"),
    Media: filterByCategoria(inundacion, "Media"),
    Alta: filterByCategoria(inundacion, "Alta"),
  },
  movimiento_en_masa: {
    Baja: filterByCategoria(movimientoMasa, "Baja"),
    Media: filterByCategoria(movimientoMasa, "Media"),
    Alta: filterByCategoria(movimientoMasa, "Alta"),
  },
  avenida_torrencial: {
    Baja: filterByCategoria(avenidaTorrencial, "Baja"),
    Media: filterByCategoria(avenidaTorrencial, "Media"),
    Alta: filterByCategoria(avenidaTorrencial, "Alta"),
  },
};

const EMERGENCY_OPTIONS: { label: string; value: EmergencyType; emoji: string }[] = [
  { label: "Ninguna", value: "ninguna", emoji: "—" },
  { label: "Inundación", value: "inundacion", emoji: "🌊" },
  { label: "M. en masa", value: "movimiento_en_masa", emoji: "⛰️" },
  { label: "Av. torrencial", value: "avenida_torrencial", emoji: "🌪️" },
];

const SCREEN_HEIGHT = Dimensions.get("window").height;
// Tres puntos de anclaje para el sheet:
//   · COLLAPSED: handle + título + fila compacta de métricas (~130 px).
//   · MID: la mitad típica — cómodo para consultar capas sin perder mapa.
//   · FULL: alto del contenido real del sheet (medido con onLayout),
//     cappeado al alto máximo razonable. Antes poníamos un fijo
//     `SCREEN_HEIGHT - 110` que dejaba un espacio vacío enorme cuando
//     la lista de capas es corta. Ahora medimos para que el sheet
//     suba *exactamente* hasta que la última opción sea visible.
// La decisión entre MID y FULL se toma por velocidad del gesto (fling
// → FULL, soltada lenta → MID).
const SHEET_COLLAPSED = 130;
const SHEET_MID = Math.min(400, Math.floor(SCREEN_HEIGHT * 0.48));
// Cap absoluto: aun si el contenido es enorme, no cubrir el header.
const SHEET_FULL_CAP = Math.floor(SCREEN_HEIGHT - 110);

export default function DatosVisorScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  // Params opcionales para aterrizar enfocado en una alerta específica
  // (ej: desde la barra roja del Home). Si vienen, activamos la capa
  // de reportes y animamos la cámara al punto. Se aplica sólo la
  // primera vez — si el usuario pan-navega, no lo interrumpimos.
  const rawParams = useLocalSearchParams<{
    focusLat?: string | string[];
    focusLng?: string | string[];
    showReports?: string | string[];
  }>();
  const focusParam = useMemo(() => {
    const pick = (v: string | string[] | undefined) =>
      Array.isArray(v) ? v[0] : v;
    const lat = parseFloat(pick(rawParams.focusLat) ?? "");
    const lng = parseFloat(pick(rawParams.focusLng) ?? "");
    const sr = pick(rawParams.showReports) === "1";
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, showReports: sr };
  }, [rawParams.focusLat, rawParams.focusLng, rawParams.showReports]);
  // Contexto compartido para que "Ir aquí" pre-seleccione el destino
  // antes de saltar al mapa de Evacua con `autoRoute=1`.
  const {
    setSelectedDestination,
    setSelectedInstitucion,
    setEmergencyType: setCtxEmergencyType,
    setRouteProfile,
    setStartMode,
    setStartPoint,
    setDestinationMode,
    setQuickRouteMode,
    setPendingDestKind,
    setPickingFromIsochroneMap,
    setShowingInstitucionesOverlay,
  } = useRouteContext();

  const { graphReady, linkedDestinos } = useGraphBootstrap(puntosEncuentro);
  const { alerts, missing, refresh: refreshCommunity } = useCommunityStatus();
  // Heading del usuario para la flecha de norte. `location` lo ignoramos
  // (el mapa usa `showsUserLocation` nativo); solo nos importa el heading.
  const { heading } = useLocationTracking();

  // Modales de destino (reutilizamos los mismos del Evacua)
  const [refugeDetailsVisible, setRefugeDetailsVisible] = useState(false);
  const [refugeDetails, setRefugeDetails] = useState<import("../src/types/v4").RefugeDetails | null>(null);
  const [streetViewVisible, setStreetViewVisible] = useState(false);
  const [streetViewTarget, setStreetViewTarget] = useState<{ lat: number; lng: number; name: string } | null>(null);
  // Sheet de QuickEvacuate en modo "locked": al presionar "Ir aquí" en
  // un pin (refugio o institución) abrimos el sheet con destino fijo
  // para pedir solo emergencia + origen. Antes abríamos un Alert nativo
  // y llevábamos al mapa sin parámetros, lo que obligaba al usuario a
  // configurarlos en el drawer.
  const [quickSheetVisible, setQuickSheetVisible] = useState(false);
  const [lockedDest, setLockedDest] = useState<LockedDestination | null>(null);

  // Default: ninguna emergencia y todas las capas apagadas. El mapa
  // arranca limpio; el usuario decide qué mostrar.
  //
  // `showRisk` = polígonos de amenaza Baja/Media/Alta del tipo de
  // emergencia elegido. Se prende automáticamente al elegir emergencia
  // (sin prender nada, el tipo no comunicaría nada visual) pero el
  // usuario puede apagarlo si quiere ver sólo markers limpios.
  //
  // `showTime` = isócronas (antes "heatmap") — capa opcional que
  // requiere cómputo y depende del tipo de emergencia.
  const [emergencyType, setEmergencyTypeRaw] = useState<EmergencyType>("ninguna");
  const [showRisk, setShowRisk] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [showShelters, setShowShelters] = useState(false);
  const [showInstitutions, setShowInstitutions] = useState(false);
  // Dos vistas diferentes de los reportes ciudadanos:
  //  · showReports → pins/burbujas individuales con conteo. Útil para
  //    inspeccionar reportes puntuales.
  //  · showReportsHeat → mapa de calor agregado estilo isócronas.
  //    Útil para lectura territorial ("¿dónde está concentrado?") y
  //    complemento visual al mapa de tiempo.
  // Son independientes — el usuario puede tener ambos, uno u otro.
  const [showReports, setShowReports] = useState(false);
  const [showReportsHeat, setShowReportsHeat] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  // Aplica focusParam una sola vez por sesión: activa la capa de
  // reportes (si vino el flag) y anima la cámara al punto exacto.
  // Antes usábamos un `setTimeout(300)` que era un race contra la
  // inicialización del mapa: en dispositivos lentos el 300ms no
  // alcanzaba y el `animateToRegion` quedaba no-op. Ahora esperamos
  // a `onMapReady` (callback real del MapView) para garantizar que
  // la cámara ya está lista antes de moverla.
  const [mapReady, setMapReady] = useState(false);
  const focusApplied = useRef(false);
  useEffect(() => {
    if (focusApplied.current) return;
    if (!focusParam) return;
    if (!mapReady) return;
    focusApplied.current = true;
    if (focusParam.showReports) setShowReports(true);
    mapRef.current?.animateToRegion(
      {
        latitude: focusParam.lat,
        longitude: focusParam.lng,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      700,
    );
  }, [focusParam, mapReady]);

  // Wrapper de setEmergencyType que activa el riesgo por default al pasar
  // de "ninguna" a una amenaza, y lo apaga al volver a "ninguna" para
  // que la capa no quede huérfana sin polígonos que pintar.
  const setEmergencyType = useCallback((next: EmergencyType) => {
    setEmergencyTypeRaw(next);
    if (next === "ninguna") {
      setShowRisk(false);
      setShowTime(false);
    } else {
      setShowRisk(true);
    }
  }, []);
  const [isoTable, setIsoTable] = useState<IsochroneTable | null>(null);
  const [isoComputing, setIsoComputing] = useState(false);
  // El mapa arranca en híbrido (satélite + calles) porque es lo que más
  // rápido le da al usuario un ancla visual de dónde vive respecto a
  // las amenazas y refugios. El standard (vectorial gris) se sentía
  // plano y poco útil para el propósito del Visor.
  const [mapType, setMapType] = useState<MapType>("hybrid");
  const cycleMapType = () => {
    setMapType((t) =>
      t === "hybrid" ? "standard" : t === "standard" ? "satellite" : "hybrid",
    );
  };

  // Auto-fit: animamos la cámara para encajar los puntos de la capa
  // SOLO cuando el usuario la prende (transición OFF→ON). Esto evita
  // el "salto" molesto cuando llegan datos nuevos y el usuario estaba
  // navegando manualmente. Cada capa tiene su ref de estado previo.
  const fitPadding = {
    edgePadding: { top: 120, right: 60, bottom: 360, left: 60 },
    animated: true as const,
  };
  const prevShowReports = useRef(false);
  const prevShowMissing = useRef(false);
  const prevShowShelters = useRef(false);
  const prevShowInstitutions = useRef(false);

  useEffect(() => {
    const justOn = showReports && !prevShowReports.current;
    prevShowReports.current = showReports;
    if (justOn && alerts.length > 0) {
      mapRef.current?.fitToCoordinates(
        alerts.map((a) => ({ latitude: a.lat, longitude: a.lng })),
        fitPadding,
      );
    }
  }, [showReports, alerts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const justOn = showMissing && !prevShowMissing.current;
    prevShowMissing.current = showMissing;
    if (justOn && missing.length > 0) {
      mapRef.current?.fitToCoordinates(
        missing.map((m) => ({ latitude: m.lastSeenLat, longitude: m.lastSeenLng })),
        fitPadding,
      );
    }
  }, [showMissing, missing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const justOn = showShelters && !prevShowShelters.current;
    prevShowShelters.current = showShelters;
    if (justOn && puntosEncuentro.length > 0) {
      mapRef.current?.fitToCoordinates(
        puntosEncuentro.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        fitPadding,
      );
    }
  }, [showShelters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const justOn = showInstitutions && !prevShowInstitutions.current;
    prevShowInstitutions.current = showInstitutions;
    if (justOn && instituciones.length > 0) {
      mapRef.current?.fitToCoordinates(
        instituciones.map((i) => ({ latitude: i.lat, longitude: i.lng })),
        fitPadding,
      );
    }
  }, [showInstitutions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apaga todas las capas y desselecciona la emergencia. Útil cuando
  // el usuario activó varias cosas y quiere volver a un mapa limpio
  // sin tener que tocar cada toggle individualmente.
  const handleClearSelection = useCallback(() => {
    // Pasamos por el wrapper `setEmergencyType("ninguna")` para que
    // también apague showRisk/showTime (esos toggles dependen del tipo
    // de emergencia y, si los dejamos encendidos sin emergencia, el
    // mapa queda en un estado inconsistente).
    setEmergencyType("ninguna");
    setShowShelters(false);
    setShowInstitutions(false);
    setShowReports(false);
    setShowReportsHeat(false);
    setShowMissing(false);
  }, [setEmergencyType]);

  // `hayAlgoActivo` vale true si alguna capa o la emergencia están
  // activas. Oculta el botón "limpiar" cuando ya no hay nada que
  // limpiar — evita ruido visual cuando el mapa ya está en su
  // estado por defecto.
  const hayAlgoActivo =
    emergencyType !== "ninguna" ||
    showRisk ||
    showTime ||
    showShelters ||
    showInstitutions ||
    showReports ||
    showReportsHeat ||
    showMissing;

  // Centra el mapa en la ubicación actual del usuario. Útil para que se
  // auto-ubique respecto a polígonos de riesgo y refugios cercanos.
  const handleCenterOnUser = useCallback(async () => {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapRef.current?.animateToRegion(
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500,
      );
    } catch (e) {
      console.warn("[Visor] centerOnUser:", e);
    }
  }, []);

  // ─── Interacción con markers (shelter / institution) ────────────────────
  //
  // Al tocar un pin abrimos un Alert con tres opciones:
  //   · "Ir aquí"    → abre QuickEvacuateSheet en modo locked (el
  //                    destino ya es este pin; solo se preguntan
  //                    emergencia + origen). Al confirmar, el caller
  //                    navega a /map y la ruta auto-calcula.
  //   · "Vista 360°" → abre StreetViewModal inline.
  //   · "Detalles"   → (solo shelter) RefugeDetailsModal.
  //
  // El Alert anterior navegaba al mapa con destino seteado pero sin
  // emergencia ni origen, obligando a configurar eso en el drawer.
  // Ahora el sheet captura esos dos parámetros antes de navegar.
  const openQuickSheet = useCallback((dest: LockedDestination) => {
    setLockedDest(dest);
    setQuickSheetVisible(true);
  }, []);

  // Handler del sheet en modo locked: recibe emergencia+origen, setea
  // el contexto y navega a /map. La ruta la dispara Case A del
  // pipeline (para GPS) o CONFIRMAR PUNTO (para manual).
  const handleLockedConfirm = useCallback((p: ConfirmPayload) => {
    setQuickSheetVisible(false);
    if (!lockedDest) return;
    setSelectedDestination(lockedDest.shelter ?? null);
    setSelectedInstitucion(lockedDest.institucion ?? null);
    setCtxEmergencyType(p.emergency);
    setRouteProfile("foot-walking");
    setStartPoint(null);
    setDestinationMode("manual");
    // pendingDestKind=closest en el pipeline significa "auto-calc
    // inmediato sin picker"; con selectedDestination/Institucion ya
    // poblado, calcularRuta ruta a ese punto concreto (no busca el
    // más cercano).
    setPendingDestKind("closest");
    setPickingFromIsochroneMap(false);
    setShowingInstitucionesOverlay(false);
    setQuickRouteMode(true);
    if (p.start === "gps") {
      setStartMode("gps");
      router.push({ pathname: "/map", params: { autoRoute: "1" } });
    } else {
      setStartMode("manual");
      router.push({ pathname: "/map", params: { autoOpen: "pickStart" } });
    }
  }, [
    lockedDest, router,
    setSelectedDestination, setSelectedInstitucion, setCtxEmergencyType,
    setRouteProfile, setStartPoint, setDestinationMode, setStartMode,
    setPendingDestKind, setPickingFromIsochroneMap,
    setShowingInstitucionesOverlay, setQuickRouteMode,
  ]);

  const handleShelterPress = useCallback((shelter: Destino) => {
    Alert.alert(
      shelter.nombre,
      "¿Qué quieres hacer?",
      [
        {
          text: "🏃 Ir aquí",
          onPress: () =>
            openQuickSheet({ kind: "shelter", name: shelter.nombre, shelter }),
        },
        {
          text: "📷 Vista 360°",
          onPress: () => {
            setStreetViewTarget({ lat: shelter.lat, lng: shelter.lng, name: shelter.nombre });
            setStreetViewVisible(true);
          },
        },
        {
          text: "ℹ️ Detalles",
          onPress: async () => {
            const details = await import("../src/services/refugesService").then((m) =>
              m.getRefugeByName(shelter.nombre),
            );
            setRefugeDetails(details ?? {
              nombre: shelter.nombre,
              servicios: [],
              descripcion: "Aún no hay información detallada para este punto.",
            });
            setRefugeDetailsVisible(true);
          },
        },
        { text: "Cerrar", style: "cancel" },
      ],
    );
  }, [openQuickSheet]);

  const handleInstitutionPress = useCallback((inst: Institucion) => {
    Alert.alert(
      inst.nombre,
      inst.tipo,
      [
        {
          text: "🏃 Ir aquí",
          onPress: () =>
            openQuickSheet({ kind: "institucion", name: inst.nombre, institucion: inst }),
        },
        {
          text: "📷 Vista 360°",
          onPress: () => {
            setStreetViewTarget({ lat: inst.lat, lng: inst.lng, name: inst.nombre });
            setStreetViewVisible(true);
          },
        },
        { text: "Cerrar", style: "cancel" },
      ],
    );
  }, [openQuickSheet]);

  // ─── Bottom sheet animado + drag ─────────────────────────────────────────
  // `sheetHeight` es un Animated.Value porque `height` no es native-driver
  // compatible (tenemos que animar JS-side). El overhead es trivial para
  // este sheet de interacción puntual.
  const sheetHeight = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  // Snapshot de altura al iniciar el drag (PanResponder no da value vivo).
  const dragStartHeightRef = useRef(SHEET_COLLAPSED);
  // Estado actual del sheet: -1 colapsado, 0 mid, 1 full. Lo usamos
  // para que tap en el handle cicle linealmente entre los tres estados
  // en vez de un simple toggle binario.
  const sheetStateRef = useRef<-1 | 0 | 1>(-1);
  // Alto "full" del sheet = alto real del contenido, medido con
  // onLayout del ScrollView interno. Empezamos con MID como fallback
  // hasta que haya una medición real. Antes usábamos un fijo `SCREEN -
  // 110` que dejaba un espacio enorme debajo de la última opción.
  const [sheetFull, setSheetFull] = useState(SHEET_MID);
  // Los handlers del pan responder leen `sheetFull` por ref para no
  // tener que re-crearse en cada medición (con useMemo recreándose
  // perdemos handlers mid-drag).
  const sheetFullRef = useRef(SHEET_MID);
  useEffect(() => {
    sheetFullRef.current = sheetFull;
  }, [sheetFull]);

  // Suma del contenido medido del sheet (handle + header + compactRow +
  // detailContent expandido). La llamamos al layout del ScrollView
  // interno. Se suma también el paddingBottom (insets.bottom).
  const onSheetContentLayout = useCallback(
    (contentHeight: number) => {
      // contentHeight = alto del bloque detailContent (capas + chips).
      // Le sumamos el fijo de encima: handle + header + compactRow.
      const FIXED_TOP = 130; // = SHEET_COLLAPSED aprox.
      const total = FIXED_TOP + contentHeight + insets.bottom + 8;
      const clamped = Math.min(SHEET_FULL_CAP, Math.max(SHEET_MID, total));
      if (Math.abs(clamped - sheetFull) > 4) {
        setSheetFull(clamped);
      }
    },
    [insets.bottom, sheetFull],
  );

  const snapSheet = useCallback(
    (target: number) => {
      sheetStateRef.current =
        target === sheetFullRef.current ? 1 : target === SHEET_MID ? 0 : -1;
      Animated.spring(sheetHeight, {
        toValue: target,
        useNativeDriver: false,
        friction: 11,
        tension: 80,
      }).start();
    },
    [sheetHeight],
  );

  const toggleSheet = useCallback(() => {
    // Tap en el handle cicla: colapsado → mid → full → colapsado.
    const next =
      sheetStateRef.current === -1
        ? SHEET_MID
        : sheetStateRef.current === 0
          ? sheetFullRef.current
          : SHEET_COLLAPSED;
    snapSheet(next);
  }, [snapSheet]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          dragStartHeightRef.current = (sheetHeight as unknown as { _value: number })._value;
        },
        onPanResponderMove: (_, g) => {
          const next = Math.max(
            SHEET_COLLAPSED,
            Math.min(sheetFullRef.current, dragStartHeightRef.current - g.dy),
          );
          sheetHeight.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const current = (sheetHeight as unknown as { _value: number })._value;
          const full = sheetFullRef.current;
          const FLING_UP = -0.8;
          const FLING_DOWN = 0.8;
          let target: number;
          if (g.vy < FLING_UP) {
            target = full;
          } else if (g.vy > FLING_DOWN) {
            target = SHEET_COLLAPSED;
          } else {
            const distances = [
              { v: SHEET_COLLAPSED, d: Math.abs(current - SHEET_COLLAPSED) },
              { v: SHEET_MID, d: Math.abs(current - SHEET_MID) },
              { v: full, d: Math.abs(current - full) },
            ];
            distances.sort((a, b) => a.d - b.d);
            target = distances[0].v;
          }
          snapSheet(target);
        },
      }),
    [sheetHeight, snapSheet],
  );

  // `showsUserLocation` del MapView se encarga del fix de GPS y del
  // punto azul nativo — no necesitamos suscribirnos a la ubicación acá.

  // ─── Cálculo de isócronas cuando cambia la emergencia ────────────────────
  // Solo computamos si el usuario activó el heatmap y eligió emergencia —
  // antes se computaba apenas cambiaba la emergencia incluso con heatmap
  // apagado, gastando CPU/memoria sin razón.
  //
  // Pasamos `blockedEdgeIds` derivado de los reportes ciudadanos para
  // que el mapa de calor respete los mismos cierres que el cálculo de
  // ruta (sin esto el heatmap podía sugerir tiempos a refugio que en
  // realidad ignoran vías bloqueadas). Añadimos `alerts.length` a las
  // deps para re-computar cuando llegan reportes nuevos.
  useEffect(() => {
    if (!graphReady || linkedDestinos.length === 0) return;
    if (!showTime || emergencyType === "ninguna") {
      setIsoTable(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsoComputing(true);
      try {
        const graph = getGraph();
        const blockedEdgeIds = await getAllBlockedEdgeIds(graph);
        if (cancelled) return;
        const table = await precomputeIsochrones({
          profile: "foot-walking",
          emergencyType,
          destinations: linkedDestinos,
          blockedEdgeIds,
          force: true,
        });
        if (!cancelled) setIsoTable(table);
      } catch (e) {
        console.warn("[Visor] iso:", e);
        if (!cancelled) setIsoTable(null);
      } finally {
        if (!cancelled) setIsoComputing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [graphReady, linkedDestinos, emergencyType, showTime, alerts.length]);

  useFocusEffect(
    useCallback(() => {
      refreshCommunity({ recompute: true, maxAgeMs: 5_000 });
    }, [refreshCommunity]),
  );

  const initialRegion = useMemo(() => {
    if (!graphReady) {
      return { latitude: 4.8727, longitude: -75.6109, latitudeDelta: 0.07, longitudeDelta: 0.07 };
    }
    const b = getGraph().bbox;
    return {
      latitude: (b.minLat + b.maxLat) / 2,
      longitude: (b.minLng + b.maxLng) / 2,
      latitudeDelta: Math.max((b.maxLat - b.minLat) * 1.1, 0.01),
      longitudeDelta: Math.max((b.maxLng - b.minLng) * 1.1, 0.01),
    };
  }, [graphReady]);

  // `activeHazard` narrowea `emergencyType` a la variante sin "ninguna"
  // para que el resto del render pueda usarla sin `as Exclude<...>`.
  const activeHazard: Exclude<EmergencyType, "ninguna"> | null =
    emergencyType === "ninguna" ? null : emergencyType;
  const timeVisible = showTime && isoTable !== null && activeHazard !== null;
  const riskVisible = showRisk && activeHazard !== null;
  const riskLayers = activeHazard ? HAZARD_LAYERS[activeHazard] : null;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {/* Header slim */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Volver">
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Visor</Text>
          <Text style={styles.headerSubtitle}>Santa Rosa de Cabal</Text>
        </View>
      </View>

      {/* La barra horizontal de tipos de amenaza se movió al sheet
          (sección "Tipo de amenaza", arriba de Capas visibles). En
          Android se cortaba el último chip — como el sheet es ancho
          completo y hay scroll vertical, allá caben sin problema. */}

      {/* Mapa — ocupa todo el espacio entre header y sheet. */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
          mapType={mapType}
          onMapReady={() => setMapReady(true)}
        >
          {/* Polígonos de riesgo (amenaza del tipo elegido arriba).
              Se pintan antes que las isócronas para que el heatmap quede
              encima si ambos están activos — los tiempos son más
              críticos para ruteo que el color de zona. */}
          {riskVisible && riskLayers && activeHazard && HAZARD_LEVELS[activeHazard].map((nivel) => (
            <Geojson
              key={`risk-${activeHazard}-${nivel}`}
              geojson={riskLayers[nivel]}
              strokeColor={hazardStrokeColor(activeHazard, nivel)}
              fillColor={hazardFillColor(activeHazard, nivel)}
              strokeWidth={1}
            />
          ))}

          {timeVisible && <IsochroneOverlay graph={getGraph()} table={isoTable!} />}

          {showShelters && puntosEncuentro.map((d) => (
            <Marker
              key={`pe-${d.id}`}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              title={d.nombre}
              pinColor="green"
              onPress={() => handleShelterPress(d)}
            />
          ))}

          {showInstitutions && instituciones.map((inst) => (
            <Marker
              key={`inst-${inst.id}`}
              coordinate={{ latitude: inst.lat, longitude: inst.lng }}
              title={inst.nombre}
              description={inst.tipo}
              pinColor="gold"
              onPress={() => handleInstitutionPress(inst)}
            />
          ))}

          {/* Dos vistas distintas de los reportes validados:
              · Mapa de calor (showReportsHeat) → círculos escalonados
                por `supportCount`, estilo bandas de isócronas. Antes
                usábamos `<Heatmap>` de react-native-maps pero
                crasheaba en iOS con datasets pequeños; este overlay
                es estable en ambas plataformas.
              · Burbujas con conteo (showReports) → pins con el
                supportCount de cada cluster. Lectura puntual.
              Son independientes para que el usuario pueda escoger la
              representación que necesita. */}
          {showReportsHeat && <AlertsHeatLayer alerts={alerts} />}
          {showReports && alerts.map((a) => (
            <Marker
              key={`alert-${a.id}`}
              coordinate={{ latitude: a.lat, longitude: a.lng }}
              title={labelForAlert(a.type)}
              description={`${a.supportCount} reporte${a.supportCount === 1 ? "" : "s"} · ${a.uniqueDeviceCount} ciudadano${a.uniqueDeviceCount === 1 ? "" : "s"}`}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {/* No pasamos `tracksViewChanges={false}`: en algunos
                  dispositivos queda el marker vacío en la primera render
                  cuando el child View aún no midió. Con el default
                  (true) el marker se repinta tras el layout.
                  El costo perf es trivial para N<100 alerts. */}
              <View style={[
                styles.alertBubble,
                a.supportCount >= 5 && styles.alertBubbleHigh,
                a.supportCount >= 10 && styles.alertBubbleCritical,
              ]}>
                <Text style={styles.alertBubbleText}>
                  {a.supportCount > 99 ? "99+" : a.supportCount}
                </Text>
              </View>
            </Marker>
          ))}

          {showMissing && missing.map((p) => (
            <Marker
              key={`missing-${p.id}`}
              coordinate={{ latitude: p.lastSeenLat, longitude: p.lastSeenLng }}
              title={`🔍 ${p.name}`}
              description={p.description.substring(0, 80)}
            >
              <View style={styles.missingMarker}>
                <Text style={{ fontSize: 14 }}>🔍</Text>
              </View>
            </Marker>
          ))}
        </MapView>

        {isoComputing && (
          <View style={styles.computingBadge}>
            <ActivityIndicator size="small" color="#d97706" />
            <Text style={styles.computingText}>Calculando mapa de calor...</Text>
          </View>
        )}

        {/* Leyendas — dos pills compactos arriba-izquierda apilados:
            · Nivel de riesgo (polígonos Baja/Media/Alta) si está activo
            · Tiempo a refugio (isócronas) si está activo.
            Cada uno aparece solo si su capa está visible. */}
        {(riskVisible || timeVisible || (showReportsHeat && alerts.length > 0)) && (
          <View style={styles.legendWrap} pointerEvents="none">
            {riskVisible && activeHazard && <RiskLegend emergencyType={activeHazard} />}
            {timeVisible && <IsochroneLegend />}
            {showReportsHeat && alerts.length > 0 && <ReportsHeatLegend />}
          </View>
        )}

        {/* Botones flotantes arriba-derecha: tipo de mapa + clima
            + centrar ubicación. Reproducen la paridad con el mapa de
            Evacua — el Visor es el "mismo mapa" sin el flujo de
            ruteo, así que debe ofrecer las mismas herramientas de
            lectura territorial. */}
        <View style={styles.mapBtnStack}>
          <TouchableOpacity
            style={styles.mapFloatBtn}
            onPress={cycleMapType}
            accessibilityRole="button"
            accessibilityLabel={`Tipo de mapa: ${mapType}. Toca para cambiar`}
          >
            <MaterialIcons
              name={
                mapType === "hybrid" ? "layers" :
                mapType === "satellite" ? "public" : "map"
              }
              size={22}
              color="#0f172a"
            />
          </TouchableOpacity>
          <WeatherBadge />
          <TouchableOpacity
            style={styles.mapFloatBtn}
            onPress={handleCenterOnUser}
            accessibilityRole="button"
            accessibilityLabel="Centrar mapa en mi ubicación"
          >
            <MaterialIcons name="my-location" size={22} color="#0f172a" />
          </TouchableOpacity>
          {hayAlgoActivo && (
            <TouchableOpacity
              style={[styles.mapFloatBtn, styles.clearBtn]}
              onPress={handleClearSelection}
              accessibilityRole="button"
              accessibilityLabel="Limpiar selección: apaga todas las capas y tipos de emergencia"
            >
              <MaterialIcons name="refresh" size={22} color="#dc2626" />
            </TouchableOpacity>
          )}
          <View style={styles.northBadge}>
            <NorthArrow heading={heading} />
          </View>
        </View>

        {/* El hint "Elige una emergencia arriba" se retiró: ahora los
            controles de tipo de amenaza y de capas viven dentro del
            bottom sheet, y los iconos compactos del resumen son
            clickeables como atajo — no hay contenido "arriba" que
            el usuario tenga que buscar. */}

        {/* Los toggles de capas (Refugios, Instituciones, Reportes,
            Desaparecidos, Mapa de calor) viven ahora dentro del bottom
            sheet — sobre el mapa mostrábamos chips azules flotantes
            que tapaban contenido y duplicaban lo que ya estaba en el
            sheet al expandir. Limpio visualmente. */}
      </View>

      {/* Bottom sheet — colapsado muestra métricas compactas, expandido
          muestra cards detalladas. Arrastrable con pan gesture, también
          se puede togglear tocando la zona del handle. */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <TouchableOpacity
            style={styles.handleTouch}
            onPress={toggleSheet}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Expandir o contraer el resumen del municipio"
          >
            <View style={styles.handleBar} />
            <View style={styles.handleTitleRow}>
              <Text style={styles.handleTitle}>Resumen del municipio</Text>
              <MaterialIcons
                name="keyboard-arrow-up"
                size={20}
                color="#64748b"
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Fila compacta — visible en ambos estados. Cada métrica es
            ahora un toggle: tocar prende/apaga la capa correspondiente
            y, al prenderla, la cámara hace fit a los puntos de esa capa
            (igual que los LayerToggle de capas de mapa). El usuario
            pidió que las 4 tarjetas del resumen se comporten así para
            no tener que duplicar el control en "capas visibles". */}
        <View style={styles.compactRow}>
          <CompactMetric
            icon="📍"
            value={puntosEncuentro.length}
            label="p. encuentro"
            active={showShelters}
            onPress={() => setShowShelters((v) => !v)}
          />
          <CompactMetric
            icon="🏥"
            value={instituciones.length}
            label="inst."
            active={showInstitutions}
            onPress={() => setShowInstitutions((v) => !v)}
          />
          <CompactMetric
            icon="⚠️"
            value={alerts.length}
            label="reportes"
            active={showReports}
            onPress={() => setShowReports((v) => !v)}
          />
          <CompactMetric
            icon="🔍"
            value={missing.length}
            label="desap."
            active={showMissing}
            onPress={() => setShowMissing((v) => !v)}
          />
        </View>

        {/* Detalle — aparece al expandir. Primero las capas (qué se ve
            en el mapa) y luego los números crudos, porque al usuario le
            importa primero "qué ver" y después "cuánto hay". */}
        <ScrollView
          style={styles.detailScroll}
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
          // Medimos el alto real del contenido para que el snap "FULL"
          // ajuste el sheet exactamente hasta la última opción — sin
          // dejar espacio vacío debajo.
          onContentSizeChange={(_w, h) => onSheetContentLayout(h)}
        >
          {/* Tipo de amenaza — chips horizontales. El usuario selecciona
              qué tipo de emergencia está consultando. Gatilla las capas
              de riesgo y el cálculo de isócronas (cuando están activas). */}
          <Text style={styles.sectionLabel}>Tipo de amenaza</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.emergencyChipRow}
          >
            {EMERGENCY_OPTIONS.map((opt) => {
              const isActive = emergencyType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.emergencyChip, isActive && styles.emergencyChipActive]}
                  onPress={() => setEmergencyType(opt.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Filtrar por ${opt.label}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[
                    styles.emergencyChipText,
                    isActive && styles.emergencyChipTextActive,
                  ]}>
                    {opt.emoji} {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Capas de MAPA (no de puntos): polígonos de riesgo,
              isócronas y heatmap agregado de alertas. Las capas de
              puntos individuales (refugios, instituciones, reportes,
              desaparecidos) se controlan desde la fila compacta de
              arriba — tocar cada ícono prende/apaga la capa con fit
              automático. Separar "mapas" de "puntos" evita duplicar
              controles. */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Capas de mapa</Text>
          <View style={styles.layerList}>
            <LayerToggle
              label="Mapa nivel de riesgo"
              icon="layers"
              active={showRisk}
              onValueChange={setShowRisk}
              color="#b91c1c"
              disabled={emergencyType === "ninguna"}
              disabledHint="Primero elige un tipo de emergencia"
              hint={
                emergencyType !== "ninguna" && showRisk
                  ? "Polígonos Baja · Media · Alta"
                  : undefined
              }
            />
            <LayerToggle
              label="Mapa de tiempo"
              icon="timer"
              active={showTime}
              onValueChange={setShowTime}
              color="#4338ca"
              disabled={emergencyType === "ninguna"}
              disabledHint="Primero elige un tipo de emergencia"
              hint={
                emergencyType !== "ninguna" && showTime
                  ? "Tiempo a refugio más cercano"
                  : undefined
              }
            />
            <LayerToggle
              label="Mapa de calor de reportes"
              icon="whatshot"
              active={showReportsHeat}
              onValueChange={setShowReportsHeat}
              color="#ea580c"
              disabled={alerts.length === 0}
              disabledHint="No hay reportes activos todavía"
              hint={
                showReportsHeat && alerts.length > 0
                  ? `Densidad de ${alerts.length} reporte${alerts.length === 1 ? "" : "s"}`
                  : undefined
              }
            />
          </View>
        </ScrollView>
      </Animated.View>

      {/* Modales reutilizados de Evacua — misma UX para que el usuario
          reconozca el patrón entre ambas pantallas. */}
      <RefugeDetailsModal
        visible={refugeDetailsVisible}
        onClose={() => setRefugeDetailsVisible(false)}
        refuge={refugeDetails}
        onNavigate={() => {
          setRefugeDetailsVisible(false);
          if (refugeDetails) {
            const sh = puntosEncuentro.find((p) => p.nombre === refugeDetails.nombre);
            if (sh) openQuickSheet({ kind: "shelter", name: sh.nombre, shelter: sh });
          }
        }}
        onStreetView={
          refugeDetails
            ? () => {
                const sh = puntosEncuentro.find((p) => p.nombre === refugeDetails.nombre);
                if (sh) {
                  setStreetViewTarget({ lat: sh.lat, lng: sh.lng, name: sh.nombre });
                  setStreetViewVisible(true);
                }
              }
            : undefined
        }
      />
      <StreetViewModal
        visible={streetViewVisible}
        onClose={() => setStreetViewVisible(false)}
        latitude={streetViewTarget?.lat ?? 0}
        longitude={streetViewTarget?.lng ?? 0}
        placeName={streetViewTarget?.name}
      />

      {/* Sheet de QuickEvacuate en modo locked — se abre al presionar
          "Ir aquí" sobre un pin. Solo pide emergencia y origen porque
          el destino ya fue elegido al tocar el pin. */}
      <QuickEvacuateSheet
        visible={quickSheetVisible}
        onClose={() => setQuickSheetVisible(false)}
        onConfirm={handleLockedConfirm}
        lockedDestination={lockedDest}
      />
    </SafeAreaView>
  );
}

function labelForAlert(type: string): string {
  switch (type) {
    case "bloqueo_vial": return "Bloqueo vial";
    case "sendero_obstruido": return "Sendero obstruido";
    case "inundacion_local": return "Inundación puntual";
    case "deslizamiento_local": return "Deslizamiento";
    case "riesgo_electrico": return "Riesgo eléctrico";
    case "refugio_saturado": return "Refugio saturado";
    case "refugio_cerrado": return "Refugio cerrado";
    default: return "Alerta ciudadana";
  }
}

function ReportsHeatLegend() {
  // Pill compacto con las bandas de AlertsHeatLayer. Muestra un
  // swatch por banda con el umbral mínimo ("≥1", "≥3", "≥5"…). Sigue
  // el mismo lenguaje visual que IsochroneLegend.
  return (
    <View style={styles.riskLegend}>
      <Text style={styles.riskLegendTitle}>Reportes (conteo)</Text>
      <View style={styles.riskLegendRow}>
        {ALERTS_HEAT_BANDS.map((b) => (
          <View key={b.min} style={styles.riskLegendItem}>
            <View
              style={[
                styles.riskLegendSwatch,
                { backgroundColor: b.fill, borderColor: b.stroke },
              ]}
            />
            <Text style={styles.riskLegendLabel}>≥{b.min}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RiskLegend({ emergencyType }: { emergencyType: Exclude<EmergencyType, "ninguna"> }) {
  const niveles = HAZARD_LEVELS[emergencyType];
  const labelEmergencia =
    emergencyType === "inundacion" ? "Inundación"
    : emergencyType === "movimiento_en_masa" ? "M. en masa"
    : "Av. torrencial";
  return (
    <View style={styles.riskLegend}>
      <Text style={styles.riskLegendTitle}>Riesgo · {labelEmergencia}</Text>
      <View style={styles.riskLegendRow}>
        {niveles.map((nivel) => (
          <View key={nivel} style={styles.riskLegendItem}>
            <View
              style={[
                styles.riskLegendSwatch,
                { backgroundColor: hazardFillColor(emergencyType, nivel) },
                { borderColor: hazardStrokeColor(emergencyType, nivel) },
              ]}
            />
            <Text style={styles.riskLegendLabel}>{nivel}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

interface LayerToggleProps {
  label: string;
  icon: MaterialIconName;
  active: boolean;
  onValueChange: (v: boolean) => void;
  color: string;
  badge?: number;
  disabled?: boolean;
  disabledHint?: string;
  /** Texto explicativo opcional (reemplaza al badge hint si está presente). */
  hint?: string;
}

/**
 * Fila de toggle de capa — estilo lista iOS (ícono · label · badge · Switch).
 * Reemplaza las cards tipo chip que cortaban el texto ("Institu…",
 * "Desaparec…") y mezclaban colores agresivos. Ahora:
 *   · Fila de ancho completo: el texto nunca se trunca.
 *   · Color acento solo en ícono y badge; fondo plano para coherencia.
 *   · Switch nativo del sistema en vez de un check inventado.
 */
function LayerToggle({
  label, icon, active, onValueChange, color, badge, disabled, disabledHint, hint,
}: LayerToggleProps) {
  const subtitle = disabled && disabledHint
    ? disabledHint
    : hint
      ? hint
      : typeof badge === "number"
        ? `${badge} ${badge === 1 ? "elemento" : "elementos"}`
        : undefined;
  return (
    <View style={[styles.layerRow, disabled && { opacity: 0.55 }]}>
      <View
        style={[
          styles.layerIconBox,
          {
            backgroundColor: active && !disabled ? color : "#e2e8f0",
          },
        ]}
      >
        <MaterialIcons
          name={icon}
          size={18}
          color={active && !disabled ? "#fff" : "#64748b"}
        />
      </View>
      <View style={styles.layerTextCol}>
        <Text style={styles.layerRowLabel}>{label}</Text>
        {subtitle && <Text style={styles.layerRowHint}>{subtitle}</Text>}
      </View>
      <Switch
        value={active && !disabled}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: color, false: "#cbd5e1" }}
        thumbColor="#ffffff"
        ios_backgroundColor="#cbd5e1"
      />
    </View>
  );
}

function CompactMetric({
  icon,
  value,
  label,
  active,
  onPress,
}: {
  icon: string;
  value: number;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  // El acento azul indica que la capa está activa en el mapa. Usamos
  // TouchableOpacity siempre (si no hay onPress, con activeOpacity=1
  // se comporta visualmente igual a View sin feedback).
  return (
    <TouchableOpacity
      style={[styles.compactMetric, active && styles.compactMetricActive]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `${label}: ${value}. Toca para ${active ? "ocultar" : "ver"} en el mapa` : undefined}
      accessibilityState={onPress ? { selected: !!active } : undefined}
    >
      <Text style={styles.compactIcon}>{icon}</Text>
      <Text style={[styles.compactValue, active && { color: "#4338ca" }]}>{value}</Text>
      <Text style={[styles.compactLabel, active && { color: "#4338ca" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4338ca",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerSubtitle: { color: "#c7d2fe", fontSize: 11, marginTop: 1 },

  // Fila de chips de emergencia dentro del sheet (sección "Tipo de
  // amenaza"). Scroll horizontal; los estilos de chip propios abajo.
  emergencyChipRow: {
    paddingVertical: 2,
    gap: 8,
    paddingRight: 4, // aire al final para que el último chip no pegue al borde
  },
  emergencyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  // Active: borde acento + color de texto fuerte. No pintamos de azul
  // relleno (era muy agresivo y chocaba con el heatmap). El borde +
  // texto intenso es suficientemente claro.
  emergencyChipActive: {
    backgroundColor: "#eef2ff",
    borderColor: "#4338ca",
  },
  emergencyChipText: { fontSize: 13, color: "#475569", fontWeight: "600" },
  emergencyChipTextActive: { color: "#4338ca", fontWeight: "800" },

  mapWrap: { flex: 1, position: "relative" },

  // Lista de toggles de capas dentro del sheet — estilo iOS Settings.
  layerList: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  layerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  layerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  layerTextCol: { flex: 1 },
  layerRowLabel: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  layerRowHint: { fontSize: 11, color: "#94a3b8", marginTop: 1 },

  computingBadge: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    elevation: 3,
  },
  computingText: { color: "#92400e", fontSize: 11, fontWeight: "700" },

  // Leyendas — stack vertical arriba-izquierda. Las dos (riesgo y
  // tiempo) aparecen apiladas cuando el usuario tiene ambas activas.
  legendWrap: { position: "absolute", top: 10, left: 10, gap: 8 },
  riskLegend: {
    // Transparente para ver los polígonos debajo — pareja visual con
    // IsochroneLegend. El contraste se mantiene con texto/shadow.
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
    alignItems: "flex-start",
  },
  riskLegendTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  riskLegendRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  riskLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  riskLegendSwatch: {
    width: 12, height: 10, borderRadius: 3,
    borderWidth: 1,
  },
  riskLegendLabel: { fontSize: 10, color: "#0f172a", fontWeight: "700" },

  // Stack de botones flotantes arriba-derecha del mapa.
  mapBtnStack: { position: "absolute", top: 10, right: 10, gap: 8 },
  mapFloatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5,
  },
  // Variante para "limpiar selección" — borde rojo tenue para sugerir
  // acción destructiva sin gritar al usuario.
  clearBtn: {
    borderWidth: 1.5,
    borderColor: "#fecaca",
  },
  // Contenedor redondo para la flecha de norte — mismo look-and-feel
  // que en Evacua. NorthArrow rota internamente según heading.
  northBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5,
  },
  emptyHint: {
    position: "absolute",
    alignSelf: "center",
    bottom: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  emptyHintText: { color: "#334155", fontSize: 12, fontWeight: "700" },

  missingMarker: {
    backgroundColor: "#fbbf24",
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  // Burbuja estilo "Uber surge" — círculo con número del conteo.
  // Escalonado por cantidad de reportes: verde/ámbar/rojo según severidad.
  alertBubble: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f59e0b",
    paddingHorizontal: 7,
    borderWidth: 2.5,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 5,
  },
  alertBubbleHigh: { backgroundColor: "#ea580c" },   // ≥ 5 reportes
  alertBubbleCritical: { backgroundColor: "#b91c1c" }, // ≥ 10 reportes
  alertBubbleText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: -0.3,
    includeFontPadding: false,
  },

  // Bottom sheet
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 14,
    overflow: "hidden",
  },
  handleArea: {
    alignItems: "stretch",
  },
  handleTouch: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 6,
    alignItems: "stretch",
  },
  handleBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 8,
  },
  handleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  handleTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  compactMetric: {
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  compactMetricActive: {
    backgroundColor: "#eef2ff",
    borderColor: "#4338ca",
  },
  compactIcon: { fontSize: 18, lineHeight: 22 },
  compactValue: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  compactLabel: { fontSize: 10, color: "#64748b", fontWeight: "600" },

  detailScroll: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  detailContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
});
