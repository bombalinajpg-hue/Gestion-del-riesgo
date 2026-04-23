/**
 * Visor geográfico — mapa exploratorio para consulta libre.
 *
 * A diferencia de MapViewContainer (que orquesta el flujo de evacuación),
 * este componente expone las capas catastrales derivadas del Estudio
 * Detallado ALDESARROLLO (2025) sin forzar al usuario a calcular ruta:
 *
 *   · Selección libre de tipo de emergencia para previsualizar riesgos
 *   · Capas catastrales: Elementos expuestos · Predios por riesgo · Pendiente
 *   · Amenazas del río San Eugenio (las mismas que usa Evacua)
 *   · Modal "Cuantificación del riesgo" con valores catastrales en COP
 *   · Leyenda dinámica según capas activas
 *
 * Integra el Objetivo 1 del anteproyecto (análisis de condiciones
 * geográficas) y el Objetivo 2 (visualización).
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import MapView, { MapType, Marker } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { FeatureCollection, Geometry } from "geojson";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";

import { getGroup as getFamilyGroup } from "../src/services/familyGroupsService";
import { getRefugeByName } from "../src/services/refugesService";
import type { FamilyGroup, FamilyMember, RefugeDetails } from "../src/types/v4";
import { useVisorContext } from "../context/VisorContext";
import RefugeDetailsModal from "./RefugeDetailsModal";
import StreetViewModal from "./StreetViewModal";

import avenidaTorrencialData from "../data/amenaza_avenida_torrencial.json";
import InundacionData from "../data/amenaza_inundacion.json";
import movimientoMasaData from "../data/amenaza_movimiento_en_masa.json";
import elementosExpuestosData from "../data/catastro/elementos_expuestos.json";
import riesgoInundacionData from "../data/catastro/riesgo_inundacion.json";
import riesgoAvenidaTorrencialData from "../data/catastro/riesgo_avenidas_torrenciales.json";
import riesgoMovimientoMasaData from "../data/catastro/riesgo_movimientos_masa.json";
import pendienteGradosData from "../data/catastro/pendiente_grados.json";
import exposicionCatastralData from "../data/catastro/exposicion_catastral.json";
import destinosRaw from "../data/destinos.json";
import institucionesRaw from "../data/instituciones.json";

import type { EmergencyType, HazardFeatureProperties } from "../src/types/types";
import type { Destino, Institucion } from "../src/types/types";
import { useRouteContext } from "../context/RouteContext";
import BottomNavBar from "./BottomNavBar";
import CatastroLegend from "./CatastroLegend";
import CatastroTogglesPanel from "./CatastroTogglesPanel";
import ExposicionCatastralModal from "./ExposicionCatastralModal";
import MapCatastroLayers from "./MapCatastroLayers";
import MapHazardLayers from "./MapHazardLayers";
import QuickEvacuateSheet, { type ConfirmPayload, type LockedDestination } from "./QuickEvacuateSheet";

const destinosData = destinosRaw as Destino[];
const institucionesData = institucionesRaw as Institucion[];
const puntosEncuentroVisor = destinosData.filter((d) => d.tipo === "punto_encuentro");

type HazardCollection = FeatureCollection<Geometry, HazardFeatureProperties>;

const avenidaTorrencial = avenidaTorrencialData as HazardCollection;
const inundacion = InundacionData as HazardCollection;
const movimientoMasa = movimientoMasaData as HazardCollection;

const filterByCategoria = (
  coll: HazardCollection,
  categoria: "Baja" | "Media" | "Alta",
): HazardCollection => ({
  ...coll,
  features: coll.features.filter((f) => f.properties?.Categoria === categoria),
});

const mmBaja = filterByCategoria(movimientoMasa, "Baja");
const mmMedia = filterByCategoria(movimientoMasa, "Media");
const mmAlta = filterByCategoria(movimientoMasa, "Alta");
const InundMedia = filterByCategoria(inundacion, "Media");
const InundAlta = filterByCategoria(inundacion, "Alta");
const avMedia = filterByCategoria(avenidaTorrencial, "Media");
const avAlta = filterByCategoria(avenidaTorrencial, "Alta");

// Bbox zona de estudio EDAVR (mismo criterio que MapViewContainer).
const INITIAL_REGION = {
  latitude: 4.8751,
  longitude: -75.6271,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

const MAP_TYPES: { label: string; value: MapType; icon: React.ComponentProps<typeof MaterialIcons>["name"] }[] = [
  { label: "Estándar", value: "standard", icon: "map" },
  { label: "Satélite", value: "satellite", icon: "public" },
  { label: "Híbrido", value: "hybrid", icon: "layers" },
];

const EMERGENCIA_OPTIONS: { value: EmergencyType; label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] }[] = [
  { value: "ninguna", label: "Ninguna", icon: "landscape" },
  { value: "inundacion", label: "Inundación", icon: "water-drop" },
  { value: "avenida_torrencial", label: "Avenida torrencial", icon: "waves" },
  { value: "movimiento_en_masa", label: "Movimiento en masa", icon: "terrain" },
];

export default function MapVisorContainer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ familyCode?: string | string[] }>();
  const familyCodeParam = Array.isArray(params.familyCode) ? params.familyCode[0] : params.familyCode;
  const mapRef = useRef<MapView>(null);
  const routeCtx = useRouteContext();
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [mapType, setMapType] = useState<MapType>("hybrid");
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);
  const [showEmergenciaPicker, setShowEmergenciaPicker] = useState(false);

  // Estado de toggles + emergencia + región del mapa vive en VisorContext
  // (arriba del árbol) para que sobreviva al desmontaje de la pantalla
  // cuando el usuario navega a otra tab y vuelve.
  const {
    showElementosExpuestos, setShowElementosExpuestos,
    showPrediosRiesgo, setShowPrediosRiesgo,
    showPendiente, setShowPendiente,
    showPuntosEncuentro, setShowPuntosEncuentro,
    showInstituciones, setShowInstituciones,
    emergencyType, setEmergencyType,
    savedRegion, setSavedRegion,
    hasForcedInitialCenter, markForcedInitialCenterDone,
    resetAll: resetVisorState,
  } = useVisorContext();

  const [catastroPanelOpen, setCatastroPanelOpen] = useState(false);
  const [exposicionModalOpen, setExposicionModalOpen] = useState(false);

  // "Ir aquí": al tocar un pin (punto de encuentro o institución) abrimos
  // el QuickEvacuateSheet con el destino ya fijado (modo locked). El
  // sheet pregunta emergencia + origen y dispara la navegación a /map.
  const [lockedDest, setLockedDest] = useState<LockedDestination | null>(null);
  const [evacuaSheetOpen, setEvacuaSheetOpen] = useState(false);

  // Modal de detalle al tocar un pin (punto de encuentro o institución).
  // Expone dos acciones: "Ir aquí" (abre QuickEvacuateSheet con destino
  // fijo y calcula ruta) y "Vista 360" (abre StreetViewModal). Antes de
  // F4 este flujo existía vía RefugeDetailsModal; F4 lo reemplazó con
  // un callout directo que perdía la opción de Street View — se
  // reintrodujo como el componente esperado.
  // Datos del pin actualmente seleccionado. Permanecen aunque se cierre
  // el modal — porque el StreetView, que abre DESPUÉS del detalle,
  // necesita las coords/nombre del mismo pin. Al abrir otro pin se
  // sobrescriben via `openMarkerDetail`.
  const [detailRefuge, setDetailRefuge] = useState<RefugeDetails | null>(null);
  const [detailLockedDest, setDetailLockedDest] = useState<LockedDestination | null>(null);
  const [detailCoords, setDetailCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Flag de visibilidad del RefugeDetailsModal, desacoplado de los datos.
  // Android no soporta dos Modals abiertos simultáneamente; este flag
  // permite cerrar el detalle antes de abrir StreetView (o el sheet
  // Evacua) sin perder los datos que esos modales necesitan.
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [streetViewOpen, setStreetViewOpen] = useState(false);

  const anyCatastroLayerActive = useMemo(
    () => showElementosExpuestos || showPrediosRiesgo || showPendiente,
    [showElementosExpuestos, showPrediosRiesgo, showPendiente],
  );

  // Google Maps SDK Android ignora `initialRegion` en re-mounts y salta
  // al GPS del usuario (o a una región default del mundo). Para
  // garantizar que el mapa siempre arranque donde debe:
  //
  //  - Primera vez en la sesión (no hay `savedRegion`): animamos al
  //    bbox de Santa Rosa con duración 400 ms, para que se vea como
  //    una intro intencional.
  //  - Re-montajes siguientes (venimos de otra tab): animamos al
  //    `savedRegion` con duración 0 — instantáneo, sin flicker visual.
  //
  // El ref local `hasAppliedThisMountRef` garantiza que esto dispara
  // una sola vez por montaje, aunque `savedRegion` cambie después por
  // interacción del usuario.
  const hasAppliedThisMountRef = useRef(false);
  useEffect(() => {
    if (hasAppliedThisMountRef.current) return;
    hasAppliedThisMountRef.current = true;
    const target = savedRegion ?? INITIAL_REGION;
    const duration = hasForcedInitialCenter ? 0 : 400;
    const t = setTimeout(() => {
      mapRef.current?.animateToRegion(target, duration);
      if (!hasForcedInitialCenter) markForcedInitialCenterDone();
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        500,
      );
    } catch {}
  };

  // "Limpiar mapa" DESACTIVA todas las capas y re-centra sobre la zona
  // de estudio. Delega el reset de capas al context para que el cambio
  // sea consistente desde cualquier otro componente que también lo use
  // en el futuro.
  const handleResetMapView = () => {
    mapRef.current?.animateToRegion(INITIAL_REGION, 500);
    resetVisorState();
    setFamilyGroup(null);
  };

  // Si navegamos al Visor desde "Grupo familiar" (tocando un miembro con
  // ubicación compartida), cargamos el grupo y centramos el mapa sobre
  // los puntos de los miembros. Los markers azules los renderizamos
  // dentro del MapView más abajo.
  //
  // Polling cada 20 s mientras el Visor esté abierto con `familyCode`
  // para que las ubicaciones de los miembros se actualicen sin tener
  // que cerrar y reabrir el modal. Cuando el componente se desmonta o
  // el familyCode cambia, el interval se limpia automáticamente — por
  // eso no consume batería en background.
  useEffect(() => {
    if (!familyCodeParam) {
      setFamilyGroup(null);
      return;
    }
    let cancelled = false;
    let firstLoad = true;

    const refreshGroup = async () => {
      const g = await getFamilyGroup(familyCodeParam);
      if (cancelled || !g) return;
      setFamilyGroup(g);
      // Solo en la primera carga hacemos el fitBounds. En refrescos
      // siguientes dejamos la cámara donde el usuario la haya movido
      // — sería molesto que cada 20 s la cámara saltara sola.
      if (firstLoad) {
        firstLoad = false;
        const withLoc = g.members.filter(
          (m): m is FamilyMember & { lat: number; lng: number } =>
            m.lat !== undefined && m.lng !== undefined,
        );
        if (withLoc.length > 0) {
          const lats = withLoc.map((m) => m.lat);
          const lngs = withLoc.map((m) => m.lng);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          mapRef.current?.animateToRegion(
            {
              latitude: (minLat + maxLat) / 2,
              longitude: (minLng + maxLng) / 2,
              latitudeDelta: Math.max(maxLat - minLat, 0.01) * 1.5,
              longitudeDelta: Math.max(maxLng - minLng, 0.01) * 1.5,
            },
            600,
          );
        }
      }
    };

    refreshGroup();
    const interval = setInterval(refreshGroup, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [familyCodeParam]);

  /** Abre el sheet de 3 preguntas con el destino ya fijado. Al
   *  confirmar, `handleEvacuaConfirm` navega a `/map` para que el
   *  módulo Evacua calcule y dibuje la ruta — el Visor se mantiene
   *  dedicado a exploración de capas, no hace ruteo. */
  const openRouteFromMarker = (dest: LockedDestination) => {
    setLockedDest(dest);
    setEvacuaSheetOpen(true);
  };

  /** Abre el modal de detalle al tocar un pin (punto de encuentro o
   *  institución). Carga los detalles enriquecidos del refugio desde
   *  `refugesService` si existen. Para instituciones que no tienen
   *  ficha detallada se construye un `RefugeDetails` mínimo con solo
   *  el nombre y `servicios: []` — suficiente para que el modal
   *  renderice las acciones "Ir aquí" y "Vista 360". */
  const openMarkerDetail = (
    name: string,
    lat: number,
    lng: number,
    lockedDest: LockedDestination,
  ) => {
    const found = getRefugeByName(name);
    const refuge: RefugeDetails = found ?? { nombre: name, servicios: [] };
    setDetailRefuge(refuge);
    setDetailCoords({ lat, lng });
    setDetailLockedDest(lockedDest);
    setDetailModalVisible(true);
  };

  // Cierra el modal pero PRESERVA los datos — porque StreetView o el
  // sheet Evacua pueden abrirse a continuación y siguen necesitando
  // `detailRefuge`, `detailCoords`, `detailLockedDest`. Los datos se
  // sobrescriben cuando el usuario toca otro pin.
  const closeMarkerDetail = () => {
    setDetailModalVisible(false);
  };

  /** Handler del sheet en el Visor. Setea el contexto y navega a /map
   *  para que el módulo Evacua haga el cálculo y el tracking. Mantener
   *  el ruteo en /map evita duplicar la lógica y deja al Visor
   *  enfocado en exploración de capas. */
  const handleEvacuaConfirm = (p: ConfirmPayload) => {
    setEvacuaSheetOpen(false);
    routeCtx.setSelectedDestination(p.shelter ?? null);
    routeCtx.setSelectedInstitucion(p.institucion ?? null);
    routeCtx.setEmergencyType(p.emergency);
    routeCtx.setRouteProfile("foot-walking");
    routeCtx.setQuickRouteMode(true);
    routeCtx.setStartPoint(null);
    routeCtx.setPendingDestKind("closest");
    routeCtx.setDestinationMode("manual");
    routeCtx.setPickingFromIsochroneMap(false);
    routeCtx.setShowingInstitucionesOverlay(false);
    if (p.start === "gps") {
      routeCtx.setStartMode("gps");
      router.push({ pathname: "/map", params: { autoRoute: "1" } });
    } else {
      routeCtx.setStartMode("manual");
      router.push({ pathname: "/map", params: { autoOpen: "pickStart" } });
    }
  };

  const emergenciaActivaLabel = useMemo(
    () => EMERGENCIA_OPTIONS.find((o) => o.value === emergencyType)?.label ?? "Ninguna",
    [emergencyType],
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.titleBar}>
        <View style={styles.titleIconWrap}>
          <MaterialIcons name="layers" size={22} color="#ffffff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titleText}>Visor geográfico</Text>
          <Text style={styles.subtitleText}>
            Santa Rosa de Cabal · Río San Eugenio
          </Text>
        </View>
      </View>

      {/* Selector de emergencia para previsualización (sin calcular ruta) */}
      <TouchableOpacity
        style={[styles.emergenciaChip, { top: insets.top + 110 }]}
        onPress={() => setShowEmergenciaPicker(true)}
      >
        <MaterialIcons name="warning" size={16} color="#0f172a" />
        <Text style={styles.emergenciaChipLabel}>Emergencia:</Text>
        <Text style={styles.emergenciaChipValue}>{emergenciaActivaLabel}</Text>
        <MaterialIcons name="expand-more" size={16} color="#0f172a" />
      </TouchableOpacity>

      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapType}
        // Usa la región guardada si existe (preserva la vista del
        // usuario entre navegaciones de tab). Fallback al bbox de
        // Santa Rosa en el primer montaje de la sesión.
        initialRegion={savedRegion ?? INITIAL_REGION}
        onRegionChangeComplete={(region) => setSavedRegion(region)}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
      >
        <MapHazardLayers
          emergencyType={emergencyType}
          mmBaja={mmBaja}
          mmMedia={mmMedia}
          mmAlta={mmAlta}
          InundMedia={InundMedia}
          InundAlta={InundAlta}
          avMedia={avMedia}
          avAlta={avAlta}
        />

        <MapCatastroLayers
          emergencyType={emergencyType}
          showElementosExpuestos={showElementosExpuestos}
          showPrediosRiesgo={showPrediosRiesgo}
          showPendiente={showPendiente}
          elementosExpuestos={elementosExpuestosData as FeatureCollection}
          riesgoInundacion={riesgoInundacionData as FeatureCollection}
          riesgoAvenidaTorrencial={riesgoAvenidaTorrencialData as FeatureCollection}
          riesgoMovimientoMasa={riesgoMovimientoMasaData as FeatureCollection}
          pendienteGrados={pendienteGradosData as FeatureCollection}
        />

        {/* Puntos de encuentro — pins verdes. Tap → abre el modal de
            detalle con "Ir aquí" + "Vista 360". */}
        {showPuntosEncuentro &&
          puntosEncuentroVisor.map((p) => (
            <Marker
              key={`pe-${p.id}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              pinColor="#059669"
              title={p.nombre}
              description="Toca para ver opciones"
              onPress={(e) => {
                // Evita que el onPress del MapView (picking manual en Evacua)
                // se dispare por el tap del marker.
                e.stopPropagation?.();
                openMarkerDetail(p.nombre, p.lat, p.lng, {
                  name: p.nombre,
                  kind: "shelter",
                  shelter: p,
                });
              }}
            />
          ))}

        {/* Instituciones — pins naranjas (hospital, policía, bomberos). */}
        {showInstituciones &&
          institucionesData.map((i) => (
            <Marker
              key={`inst-${i.id}`}
              coordinate={{ latitude: i.lat, longitude: i.lng }}
              pinColor="#b45309"
              title={i.nombre}
              description="Toca para ver opciones"
              onPress={(e) => {
                e.stopPropagation?.();
                openMarkerDetail(i.nombre, i.lat, i.lng, {
                  name: i.nombre,
                  kind: "institucion",
                  institucion: i,
                });
              }}
            />
          ))}

        {/* Miembros del grupo familiar — pins azules. Se muestran solo
            cuando entramos al Visor desde "Grupo familiar" con param
            familyCode. La ubicación viene del backend (PATCH que cada
            miembro dispara al tocar "Compartir mi ubicación"). */}
        {familyGroup &&
          familyGroup.members
            .filter((m) => m.lat !== undefined && m.lng !== undefined)
            .map((m) => (
              <Marker
                key={`fam-${m.deviceId}`}
                coordinate={{ latitude: m.lat!, longitude: m.lng! }}
                pinColor="#2563eb"
                title={`${m.name} (grupo ${familyGroup.code})`}
                description={
                  m.status === "need_help" ? "🆘 Necesita ayuda · toca para centrar"
                  : m.status === "evacuating" ? "🏃 Evacuando · toca para centrar"
                  : m.status === "safe" ? "✅ A salvo · toca para centrar"
                  : "Sin datos · toca para centrar"
                }
                onCalloutPress={() => {
                  // Centra la cámara sobre este miembro con zoom cercano.
                  // Útil cuando hay varios miembros dispersos y el usuario
                  // quiere enfocarse en uno específico.
                  mapRef.current?.animateToRegion(
                    {
                      latitude: m.lat!,
                      longitude: m.lng!,
                      latitudeDelta: 0.006,
                      longitudeDelta: 0.006,
                    },
                    500,
                  );
                }}
              />
            ))}

        {/* Ruta exploratoria. Se pinta cuando el usuario tocó "Ir aquí"
            en el RefugeDetailsModal de algún pin. */}
      </MapView>

      {/* Controles superiores — solo map type picker */}
      <TouchableOpacity
        style={[styles.mapTypeBtn, { top: insets.top + 110 }]}
        onPress={() => setShowMapTypePicker(true)}
        accessibilityLabel="Cambiar tipo de mapa"
      >
        <MaterialIcons name="layers" size={22} color="#073b4c" />
      </TouchableOpacity>

      {/* Columna de controles flotantes a la derecha:
          mi ubicación, limpiar mapa, FAB catastro. */}
      <View style={[styles.rightColumn, { bottom: 90 + insets.bottom }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.squareBtn}
          onPress={handleMyLocation}
          accessibilityLabel="Centrar en mi ubicación"
        >
          <MaterialIcons name="my-location" size={22} color="#073b4c" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.squareBtn}
          onPress={handleResetMapView}
          accessibilityLabel="Limpiar mapa"
        >
          <MaterialIcons name="refresh" size={22} color="#dc2626" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.squareBtn,
            anyCatastroLayerActive && { backgroundColor: "#0f766e" },
          ]}
          onPress={() => setCatastroPanelOpen((v) => !v)}
          accessibilityLabel="Capas catastrales"
        >
          <MaterialIcons
            name="account-balance"
            size={22}
            color={anyCatastroLayerActive ? "#fff" : "#0f766e"}
          />
        </TouchableOpacity>
      </View>

      <CatastroLegend
        showElementos={showElementosExpuestos}
        showPredios={showPrediosRiesgo}
        showPendiente={showPendiente}
      />

      <CatastroTogglesPanel
        visible={catastroPanelOpen}
        showElementos={showElementosExpuestos}
        showPredios={showPrediosRiesgo}
        showPendiente={showPendiente}
        showPuntosEncuentro={showPuntosEncuentro}
        showInstituciones={showInstituciones}
        onToggleElementos={setShowElementosExpuestos}
        onTogglePredios={setShowPrediosRiesgo}
        onTogglePendiente={setShowPendiente}
        onTogglePuntosEncuentro={setShowPuntosEncuentro}
        onToggleInstituciones={setShowInstituciones}
        onOpenExposicion={() => {
          setCatastroPanelOpen(false);
          setExposicionModalOpen(true);
        }}
        onClose={() => setCatastroPanelOpen(false)}
        hasEmergencia={emergencyType !== "ninguna"}
      />

      <ExposicionCatastralModal
        visible={exposicionModalOpen}
        onClose={() => setExposicionModalOpen(false)}
        data={exposicionCatastralData as any}
        emergencyType={emergencyType}
      />

      {/* Picker de tipo de mapa */}
      <Modal
        visible={showMapTypePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMapTypePicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMapTypePicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Tipo de mapa</Text>
                {MAP_TYPES.map((mt) => (
                  <Pressable
                    key={mt.value}
                    style={[styles.pickerRow, mapType === mt.value && styles.pickerRowActive]}
                    onPress={() => {
                      setMapType(mt.value);
                      setShowMapTypePicker(false);
                    }}
                  >
                    <MaterialIcons name={mt.icon} size={20} color="#0f172a" />
                    <Text style={styles.pickerRowLabel}>{mt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Picker de emergencia */}
      <Modal
        visible={showEmergenciaPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmergenciaPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowEmergenciaPicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Previsualizar escenario</Text>
                <Text style={styles.pickerHint}>
                  Elige el fenómeno para ver las capas de amenaza y riesgo asociadas.
                </Text>
                {EMERGENCIA_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.pickerRow, emergencyType === opt.value && styles.pickerRowActive]}
                    onPress={() => {
                      setEmergencyType(opt.value);
                      setShowEmergenciaPicker(false);
                    }}
                  >
                    <MaterialIcons name={opt.icon} size={20} color="#0f172a" />
                    <Text style={styles.pickerRowLabel}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal de detalle al tocar un pin. Expone "Ir aquí" (abre el
          sheet de 3 preguntas → /map) y "Vista 360" (StreetViewModal).
          Visibilidad controlada por `detailModalVisible` (no por la
          existencia de datos) para que al cerrar se puedan abrir otros
          Modals sin que los datos se pierdan — Android no soporta dos
          Modals visibles al mismo tiempo. */}
      <RefugeDetailsModal
        visible={detailModalVisible}
        refuge={detailRefuge}
        onClose={closeMarkerDetail}
        onNavigate={() => {
          if (detailLockedDest) {
            closeMarkerDetail();
            // Delay pequeño para que Android termine de cerrar el
            // modal actual antes de abrir el sheet. Sin esto el sheet
            // no aparece y queda un estado fantasma donde el usuario
            // debe tocar de nuevo para re-disparar el abrir.
            setTimeout(() => openRouteFromMarker(detailLockedDest), 250);
          }
        }}
        onStreetView={() => {
          closeMarkerDetail();
          // Mismo patrón: cerrar antes de abrir el siguiente Modal.
          setTimeout(() => setStreetViewOpen(true), 250);
        }}
      />

      {/* Street View del destino seleccionado. Se monta sobre el
          detalle; al cerrar, el detalle sigue visible para que el
          usuario pueda luego tocar "Ir aquí" sin reabrirlo. */}
      {detailCoords && detailRefuge && (
        <StreetViewModal
          visible={streetViewOpen}
          onClose={() => setStreetViewOpen(false)}
          latitude={detailCoords.lat}
          longitude={detailCoords.lng}
          placeName={detailRefuge.nombre}
        />
      )}

      {/* Sheet de Evacua (modo locked) — se abre tras "Ir aquí" del
          modal de detalle para calcular ruta directa a ese destino. */}
      <QuickEvacuateSheet
        visible={evacuaSheetOpen}
        onClose={() => setEvacuaSheetOpen(false)}
        onConfirm={handleEvacuaConfirm}
        puntosEncuentro={puntosEncuentroVisor}
        instituciones={institucionesData}
        lockedDestination={lockedDest}
      />

      <BottomNavBar active="visor" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f5f9" },
  map: { flex: 1 },
  // Header estético con fondo teal. La altura ya no es fija — crece con
  // el padding para dar aire al título/subtítulo. Bordes rectos por
  // coherencia con el BottomNavBar (ambos extremos rectos).
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: "#0f766e",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  titleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  subtitleText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
    marginTop: 2,
    fontWeight: "500",
  },
  emergenciaChip: {
    position: "absolute",
    left: 16,
    backgroundColor: "#ffffffee",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 22,
    zIndex: 10,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  emergenciaChipLabel: { fontSize: 12, color: "#475569" },
  emergenciaChipValue: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  mapTypeBtn: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#ffffffee",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 100,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  // Columna de botones flotantes en el borde derecho: mi ubicación,
  // limpiar mapa, capas catastrales. El `bottom` se sobreescribe en
  // runtime con `insets.bottom + 90` para respetar la bottom nav.
  rightColumn: {
    position: "absolute",
    right: 16,
    gap: 10,
    zIndex: 10,
    alignItems: "flex-end",
  },
  squareBtn: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#ffffffee",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: "100%",
    alignSelf: "stretch",
  },
  pickerTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  pickerHint: { fontSize: 11, color: "#64748b", marginBottom: 8 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 10,
  },
  pickerRowActive: { backgroundColor: "#ccfbf1" },
  pickerRowLabel: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "500",
  },
});
