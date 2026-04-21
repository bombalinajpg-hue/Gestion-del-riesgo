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
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import IsochroneLegend from "../components/IsochroneLegend";
import IsochroneOverlay from "../components/IsochroneOverlay";
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
// Altura del sheet en estados. El colapsado deja visibles handle +
// título + fila compacta de métricas (~110 px). El expandido se cappea
// a 48 % del alto de pantalla para que el mapa siga siendo dominante
// en teléfonos chicos. Los valores ya incluyen espacio típico para el
// home-indicator (la SafeAreaView lo restará vía paddingBottom).
const SHEET_COLLAPSED = 130;
const SHEET_EXPANDED = Math.min(400, Math.floor(SCREEN_HEIGHT * 0.48));

export default function DatosVisorScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();

  const { graphReady, linkedDestinos } = useGraphBootstrap(puntosEncuentro);
  const { alerts, missing, refresh: refreshCommunity } = useCommunityStatus();

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
  const [showReports, setShowReports] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

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

  // ─── Bottom sheet animado + drag ─────────────────────────────────────────
  // `sheetHeight` es un Animated.Value porque `height` no es native-driver
  // compatible (tenemos que animar JS-side). El overhead es trivial para
  // este sheet de interacción puntual.
  const sheetHeight = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  // Snapshot de altura al iniciar el drag (PanResponder no da value vivo).
  const dragStartHeightRef = useRef(SHEET_COLLAPSED);
  const isExpandedRef = useRef(false);

  const snapSheet = useCallback(
    (target: number) => {
      isExpandedRef.current = target === SHEET_EXPANDED;
      Animated.spring(sheetHeight, {
        toValue: target,
        useNativeDriver: false,
        friction: 9,
        tension: 55,
      }).start();
    },
    [sheetHeight],
  );

  const toggleSheet = useCallback(() => {
    snapSheet(isExpandedRef.current ? SHEET_COLLAPSED : SHEET_EXPANDED);
  }, [snapSheet]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Activamos el gesto al primer movimiento vertical notable, así
        // un tap simple no lo dispara y deja pasar al TouchableOpacity
        // del handle (para toggle con tap).
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          // React Native tipó `_value` como private, pero leerlo acá es
          // el patrón oficial documentado para PanResponder + Animated.
          dragStartHeightRef.current = (sheetHeight as unknown as { _value: number })._value;
        },
        onPanResponderMove: (_, g) => {
          const next = Math.max(
            SHEET_COLLAPSED,
            Math.min(SHEET_EXPANDED, dragStartHeightRef.current - g.dy),
          );
          sheetHeight.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const current = (sheetHeight as unknown as { _value: number })._value;
          // Decidimos por velocidad si hay impulso claro; si no, por la
          // mitad del recorrido.
          const midpoint = (SHEET_COLLAPSED + SHEET_EXPANDED) / 2;
          const shouldExpand =
            g.vy < -0.3 || (Math.abs(g.vy) < 0.3 && current > midpoint);
          snapSheet(shouldExpand ? SHEET_EXPANDED : SHEET_COLLAPSED);
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

      {/* Chips de emergencia — barra compacta entre header y mapa.
          La dejamos como fila normal (no overlay) para no ocultar parte
          del mapa con un panel flotante superior. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.emergencyBar}
        contentContainerStyle={styles.emergencyBarContent}
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
              <Text style={[styles.emergencyChipText, isActive && styles.emergencyChipTextActive]}>
                {opt.emoji} {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Mapa — ocupa todo el espacio entre barra de emergencia y sheet. */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
          mapType={mapType}
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
            />
          ))}

          {showInstitutions && instituciones.map((inst) => (
            <Marker
              key={`inst-${inst.id}`}
              coordinate={{ latitude: inst.lat, longitude: inst.lng }}
              title={inst.nombre}
              description={inst.tipo}
              pinColor="gold"
            />
          ))}

          {showReports && alerts.map((a) => (
            <Marker
              key={`alert-${a.id}`}
              coordinate={{ latitude: a.lat, longitude: a.lng }}
              title={labelForAlert(a.type)}
              description={`${a.uniqueDeviceCount} ciudadano(s)`}
              pinColor="red"
            />
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
        {(riskVisible || timeVisible) && (
          <View style={styles.legendWrap} pointerEvents="none">
            {riskVisible && activeHazard && <RiskLegend emergencyType={activeHazard} />}
            {timeVisible && <IsochroneLegend />}
          </View>
        )}

        {/* Botones flotantes arriba-derecha: tipo de mapa + centrar
            ubicación. Ambos son acciones frecuentes de exploración. */}
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
          <TouchableOpacity
            style={styles.mapFloatBtn}
            onPress={handleCenterOnUser}
            accessibilityRole="button"
            accessibilityLabel="Centrar mapa en mi ubicación"
          >
            <MaterialIcons name="my-location" size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {/* Hint cuando todo está apagado: orientar al usuario nuevo. */}
        {!showShelters && !showInstitutions && !showReports && !showMissing && !riskVisible && !timeVisible && (
          <View style={styles.emptyHint} pointerEvents="none">
            <MaterialIcons name="arrow-downward" size={16} color="#334155" />
            <Text style={styles.emptyHintText}>
              Elige una emergencia arriba o activa capas abajo
            </Text>
          </View>
        )}

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

        {/* Fila compacta — visible en ambos estados. */}
        <View style={styles.compactRow}>
          <CompactMetric icon="📍" value={puntosEncuentro.length} label="refugios" />
          <CompactMetric icon="🏥" value={instituciones.length} label="inst." />
          <CompactMetric icon="⚠️" value={alerts.length} label="alertas" />
          <CompactMetric icon="🔍" value={missing.length} label="desap." />
        </View>

        {/* Detalle — aparece al expandir. Primero las capas (qué se ve
            en el mapa) y luego los números crudos, porque al usuario le
            importa primero "qué ver" y después "cuánto hay". */}
        <ScrollView
          style={styles.detailScroll}
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Capas visibles</Text>
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
              label="Refugios"
              icon="place"
              active={showShelters}
              onValueChange={setShowShelters}
              color="#059669"
              badge={puntosEncuentro.length}
            />
            <LayerToggle
              label="Instituciones"
              icon="local-hospital"
              active={showInstitutions}
              onValueChange={setShowInstitutions}
              color="#b45309"
              badge={instituciones.length}
            />
            <LayerToggle
              label="Alertas ciudadanas"
              icon="warning"
              active={showReports}
              onValueChange={setShowReports}
              color="#dc2626"
              badge={alerts.length}
            />
            <LayerToggle
              label="Desaparecidos"
              icon="person-search"
              active={showMissing}
              onValueChange={setShowMissing}
              color="#9333ea"
              badge={missing.length}
            />
          </View>
        </ScrollView>
      </Animated.View>
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

interface MetricCardProps {
  value: string;
  label: string;
  icon: MaterialIconName;
  color: string;
  bg: string;
}

function MetricCard({ value, label, icon, color, bg }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, { backgroundColor: bg }]}>
      <MaterialIcons name={icon} size={22} color={color} />
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function CompactMetric({
  icon,
  value,
  label,
}: {
  icon: string;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.compactMetric}>
      <Text style={styles.compactIcon}>{icon}</Text>
      <Text style={styles.compactValue}>{value}</Text>
      <Text style={styles.compactLabel}>{label}</Text>
    </View>
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

  // Barra de chips de emergencia entre header y mapa.
  emergencyBar: {
    maxHeight: 48,
    flexGrow: 0,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  emergencyBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
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
    backgroundColor: "rgba(255,255,255,0.95)",
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
    paddingHorizontal: 6,
    flex: 1,
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
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 12,
    gap: 4,
  },
  metricValue: { fontSize: 22, fontWeight: "800" },
  metricLabel: { fontSize: 11, color: "#475569", fontWeight: "600" },
});
