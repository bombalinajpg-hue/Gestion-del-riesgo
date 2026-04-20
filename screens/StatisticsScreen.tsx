/**
 * Datos y Visor — mapa vivo de Santa Rosa con overlays de consulta
 * y panel de estadísticas abajo. No calcula rutas; es un visor.
 *
 * Qué muestra (toggles):
 *   - Mapa de calor de tiempo a refugio (isócronas) por tipo de emergencia
 *   - Puntos de encuentro
 *   - Instituciones
 *   - Reportes ciudadanos activos
 *   - Personas desaparecidas activas
 *
 * Panel inferior con métricas agregadas del municipio.
 */

import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import IsochroneLegend from "../components/IsochroneLegend";
import IsochroneOverlay from "../components/IsochroneOverlay";
import destinosJson from "../data/destinos.json";
import institucionesJson from "../data/instituciones.json";
import { useCommunityStatus } from "../src/hooks/useCommunityStatus";
import { useGraphBootstrap } from "../src/hooks/useGraphBootstrap";
import { getGraph } from "../src/services/graphService";
import { precomputeIsochrones } from "../src/services/isochroneService";
import type { IsochroneTable } from "../src/types/graph";
import type { Destino, EmergencyType, Institucion } from "../src/types/types";
import { DEV_MOCK_LOCATION, MOCK_LOCATION_COORDS } from "../src/utils/devMock";

const destinos = destinosJson as Destino[];
const instituciones = institucionesJson as Institucion[];
const puntosEncuentro = destinos.filter((d) => d.tipo === "punto_encuentro");

const EMERGENCY_OPTIONS: { label: string; value: EmergencyType; emoji: string }[] = [
  { label: "Ninguna", value: "ninguna", emoji: "—" },
  { label: "Inundación", value: "inundacion", emoji: "🌊" },
  { label: "M. en masa", value: "movimiento_en_masa", emoji: "⛰️" },
  { label: "Av. torrencial", value: "avenida_torrencial", emoji: "🌪️" },
];

export default function DatosVisorScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  // Grafo + snap encapsulados en hook.
  const { graphReady, linkedDestinos } = useGraphBootstrap(puntosEncuentro);
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  // Alertas + desaparecidos compartidos con el resto de la app via cache.
  const { alerts, missing, refresh: refreshCommunity } = useCommunityStatus();

  // ─── UI state ────────────────────────────────────────────────────────────
  const [emergencyType, setEmergencyType] = useState<EmergencyType>("inundacion");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showInstitutions, setShowInstitutions] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [showMissing, setShowMissing] = useState(true);
  const [isoTable, setIsoTable] = useState<IsochroneTable | null>(null);
  const [isoComputing, setIsoComputing] = useState(false);

  // ─── Ubicación actual del usuario (solo para el marker, sin tracking) ────
  useEffect(() => {
    // Dev mock: coords fijos en Santa Rosa (ver src/utils/devMock.ts).
    if (DEV_MOCK_LOCATION) {
      setUserLocation(MOCK_LOCATION_COORDS);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync();
        if (cancelled || !enabled) return;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== "granted") return;
        const fix = await Location.getLastKnownPositionAsync();
        if (!cancelled && fix) setUserLocation(fix.coords);
      } catch (e) {
        console.warn("[Visor] location:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Cálculo de isócronas cuando cambia el tipo de emergencia ────────────
  useEffect(() => {
    if (!graphReady || linkedDestinos.length === 0) return;
    if (emergencyType === "ninguna") { setIsoTable(null); return; }
    let cancelled = false;
    (async () => {
      setIsoComputing(true);
      try {
        const table = await precomputeIsochrones({
          profile: "foot-walking",
          emergencyType,
          destinations: linkedDestinos,
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
  }, [graphReady, linkedDestinos, emergencyType]);

  // Refrescamos alertas al enfocar (recompute para ver clusters nuevos).
  useFocusEffect(
    useCallback(() => {
      refreshCommunity({ recompute: true, maxAgeMs: 5_000 });
    }, [refreshCommunity]),
  );

  // ─── Derivados ───────────────────────────────────────────────────────────
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

  const heatmapVisible = showHeatmap && isoTable !== null && emergencyType !== "ninguna";

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Datos y Visor</Text>
          <Text style={styles.headerSubtitle}>Mapa vivo · Santa Rosa de Cabal</Text>
        </View>
      </View>

      {/* Selector de emergencia */}
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
            >
              <Text style={[styles.emergencyChipText, isActive && styles.emergencyChipTextActive]}>
                {opt.emoji} {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Mapa */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
          mapType="standard"
        >
          {heatmapVisible && <IsochroneOverlay graph={getGraph()} table={isoTable!} />}

          {/* Puntos de encuentro siempre visibles */}
          {puntosEncuentro.map((d) => (
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

        {heatmapVisible && (
          <View style={styles.legendWrap} pointerEvents="none">
            <IsochroneLegend />
          </View>
        )}

        {/* Toggles flotantes sobre el mapa */}
        <View style={styles.toggleStrip}>
          <ToggleChip
            label="Calor"
            icon="timer"
            active={showHeatmap}
            onPress={() => setShowHeatmap((v) => !v)}
            disabled={emergencyType === "ninguna"}
          />
          <ToggleChip
            label="Instituciones"
            icon="local-hospital"
            active={showInstitutions}
            onPress={() => setShowInstitutions((v) => !v)}
          />
          <ToggleChip
            label="Reportes"
            icon="warning"
            active={showReports}
            onPress={() => setShowReports((v) => !v)}
            badge={alerts.length}
          />
          <ToggleChip
            label="Desaparecidos"
            icon="person-search"
            active={showMissing}
            onPress={() => setShowMissing((v) => !v)}
            badge={missing.length}
          />
        </View>
      </View>

      {/* Panel de métricas */}
      <ScrollView style={styles.statsPanel} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={styles.statsTitle}>Resumen del municipio</Text>
        <View style={styles.metricsGrid}>
          <MetricCard
            value={puntosEncuentro.length.toString()}
            label="Puntos de encuentro"
            icon="place"
            color="#059669"
            bg="#d1fae5"
          />
          <MetricCard
            value={instituciones.length.toString()}
            label="Instituciones"
            icon="local-hospital"
            color="#b45309"
            bg="#fef3c7"
          />
          <MetricCard
            value={alerts.length.toString()}
            label="Alertas activas"
            icon="warning"
            color="#dc2626"
            bg="#fee2e2"
          />
          <MetricCard
            value={missing.length.toString()}
            label="Desaparecidos activos"
            icon="person-search"
            color="#9333ea"
            bg="#f3e8ff"
          />
        </View>
      </ScrollView>
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

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

interface ToggleChipProps {
  label: string;
  icon: MaterialIconName;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  badge?: number;
}

function ToggleChip({ label, icon, active, onPress, disabled, badge }: ToggleChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.toggleChip,
        active && !disabled && styles.toggleChipActive,
        disabled && styles.toggleChipDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <MaterialIcons
        name={icon}
        size={14}
        color={disabled ? "#9ca3af" : active ? "#fff" : "#334155"}
      />
      <Text
        style={[
          styles.toggleChipText,
          active && !disabled && styles.toggleChipTextActive,
          disabled && { color: "#9ca3af" },
        ]}
      >
        {label}
      </Text>
      {typeof badge === "number" && badge > 0 && (
        <View style={styles.toggleBadge}>
          <Text style={styles.toggleBadgeText}>{Math.min(badge, 9)}</Text>
        </View>
      )}
    </TouchableOpacity>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4338ca",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerSubtitle: { color: "#c7d2fe", fontSize: 11, marginTop: 2 },

  emergencyBar: { maxHeight: 50, flexGrow: 0 },
  emergencyBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  emergencyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#e2e8f0",
  },
  emergencyChipActive: { backgroundColor: "#4338ca" },
  emergencyChipText: { fontSize: 13, color: "#334155", fontWeight: "600" },
  emergencyChipTextActive: { color: "#fff" },

  mapWrap: { flex: 1.3, position: "relative" },
  map: { flex: 1 },

  toggleStrip: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  toggleChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  toggleChipActive: { backgroundColor: "#4338ca" },
  toggleChipDisabled: { opacity: 0.5 },
  toggleChipText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  toggleChipTextActive: { color: "#fff" },
  toggleBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    paddingHorizontal: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

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

  legendWrap: { position: "absolute", top: 10, right: 10 },

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

  statsPanel: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  statsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    width: "47%",
    padding: 12,
    borderRadius: 12,
    gap: 4,
  },
  metricValue: { fontSize: 20, fontWeight: "800" },
  metricLabel: { fontSize: 11, color: "#475569", fontWeight: "600" },
});
