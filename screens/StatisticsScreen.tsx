/**
 * StatisticsScreen — Datos abiertos y estadísticas.
 *
 * Muestra información útil para el usuario y agrega valor académico
 * al proyecto. Los datos mostrados aquí provienen de:
 *   - Reportes ciudadanos acumulados en este dispositivo
 *   - Datos estáticos del municipio (hazards, destinos, instituciones)
 *   - Conteo de desaparecidos, grupos familiares, kit items
 *
 * Para una versión futura con backend, estos datos vendrían de una
 * API central que agrega info de todos los dispositivos.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import destinosJson from "../data/destinos.json";
import institucionesJson from "../data/instituciones.json";
import { getAllMissing } from "../src/services/missingPersonsService";
import {
  getActiveBlockingAlerts,
  recomputePublicAlerts,
} from "../src/services/reportsService";

const destinos = destinosJson as any[];
const instituciones = institucionesJson as any[];

export default function StatisticsScreen() {
  const router = useRouter();
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [totalMissing, setTotalMissing] = useState(0);
  const [resolvedMissing, setResolvedMissing] = useState(0);

  const refresh = async () => {
    try {
      await recomputePublicAlerts();
      setActiveAlerts((await getActiveBlockingAlerts()).length);
      const all = await getAllMissing();
      setTotalMissing(all.length);
      setResolvedMissing(all.filter((p) => p.status === "encontrada").length);
    } catch {}
  };

  useEffect(() => {
    refresh();
    // Re-carga al enfocar la pantalla
    return () => {};
  }, [navigation]);

  const puntosEncuentro = destinos.filter((d: any) => d.tipo === "punto_encuentro").length;
  const institucionesCount = instituciones.length;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Estadísticas</Text>
          <Text style={styles.headerSubtitle}>
            Santa Rosa de Cabal · Datos abiertos
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Resumen del municipio */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEmoji}>🏔️</Text>
          <Text style={styles.heroTitle}>Santa Rosa de Cabal</Text>
          <Text style={styles.heroSubtitle}>
            Infraestructura mapeada para gestión del riesgo
          </Text>
        </View>

        {/* Grid de métricas principales */}
        <View style={styles.metricsGrid}>
          <MetricCard
            value={puntosEncuentro.toString()}
            label="Puntos de encuentro"
            icon="place"
            color="#059669"
            bg="#d1fae5"
          />
          <MetricCard
            value={institucionesCount.toString()}
            label="Instituciones"
            icon="local-hospital"
            color="#b45309"
            bg="#fef3c7"
          />
          <MetricCard
            value={activeAlerts.toString()}
            label="Alertas activas"
            icon="warning"
            color="#dc2626"
            bg="#fee2e2"
            pulse={activeAlerts > 0}
          />
          <MetricCard
            value={totalMissing.toString()}
            label="Reportes desaparecidos"
            icon="person-search"
            color="#9333ea"
            bg="#f3e8ff"
          />
        </View>

        {/* Desaparecidos detalle */}
        {totalMissing > 0 && (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>
              🔍 Casos de personas desaparecidas
            </Text>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Text style={styles.detailBigNum}>
                  {totalMissing - resolvedMissing}
                </Text>
                <Text style={styles.detailLabel}>Activos</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailItem}>
                <Text style={[styles.detailBigNum, { color: "#059669" }]}>
                  {resolvedMissing}
                </Text>
                <Text style={styles.detailLabel}>Encontrados</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailItem}>
                <Text style={styles.detailBigNum}>
                  {totalMissing > 0
                    ? Math.round((resolvedMissing / totalMissing) * 100)
                    : 0}
                  %
                </Text>
                <Text style={styles.detailLabel}>Resolución</Text>
              </View>
            </View>
          </View>
        )}

        {/* Amenazas del municipio */}
        <Text style={styles.sectionTitle}>Amenazas identificadas</Text>

        <View style={styles.hazardCard}>
          <View style={styles.hazardHeader}>
            <Text style={styles.hazardEmoji}>🌊</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.hazardName}>Inundación</Text>
              <Text style={styles.hazardType}>Zona de amenaza fluvial</Text>
            </View>
            <View
              style={[styles.hazardBadge, { backgroundColor: "#dbeafe" }]}
            >
              <Text style={[styles.hazardBadgeText, { color: "#1e40af" }]}>
                Media / Alta
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.hazardCard}>
          <View style={styles.hazardHeader}>
            <Text style={styles.hazardEmoji}>⛰️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.hazardName}>Movimiento en masa</Text>
              <Text style={styles.hazardType}>Deslizamientos de tierra</Text>
            </View>
            <View
              style={[styles.hazardBadge, { backgroundColor: "#fef3c7" }]}
            >
              <Text style={[styles.hazardBadgeText, { color: "#92400e" }]}>
                Baja / Media / Alta
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.hazardCard}>
          <View style={styles.hazardHeader}>
            <Text style={styles.hazardEmoji}>🌪️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.hazardName}>Avenida torrencial</Text>
              <Text style={styles.hazardType}>Crecientes súbitas</Text>
            </View>
            <View
              style={[styles.hazardBadge, { backgroundColor: "#ffedd5" }]}
            >
              <Text style={[styles.hazardBadgeText, { color: "#7c2d12" }]}>
                Media / Alta
              </Text>
            </View>
          </View>
        </View>

        {/* Nota metodológica */}
        <View style={styles.noteBox}>
          <MaterialIcons name="science" size={18} color="#475569" />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle}>Nota metodológica</Text>
            <Text style={styles.noteText}>
              Los datos de amenazas provienen del estudio del municipio
              basado en cartografía geomorfológica. Los reportes ciudadanos
              se agregan cuando 3 o más dispositivos distintos reportan
              situaciones similares en un radio de 30 metros.
            </Text>
          </View>
        </View>

        {/* Footer académico */}
        <View style={styles.academicFooter}>
          <MaterialIcons name="school" size={16} color="#64748b" />
          <Text style={styles.academicText}>
            Proyecto de pasantía · Ingeniería Catastral · Universidad
            Distrital Francisco José de Caldas
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({
  value,
  label,
  icon,
  color,
  bg,
  pulse,
}: {
  value: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  pulse?: boolean;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: bg }]}>
        <MaterialIcons name={icon as any} size={22} color={color} />
        {pulse && <View style={[styles.pulseDot, { backgroundColor: "#dc2626" }]} />}
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef2ff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#4338ca",
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerSubtitle: { color: "#c7d2fe", fontSize: 11, marginTop: 1 },
  content: { padding: 16, paddingBottom: 32 },

  heroCard: {
    backgroundColor: "#fff",
    padding: 22,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  heroEmoji: { fontSize: 46 },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#312e81",
    marginTop: 4,
  },
  heroSubtitle: { fontSize: 12, color: "#6366f1", marginTop: 4 },

  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    width: "48%",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    position: "relative",
  },
  pulseDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  metricLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },

  detailCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 12,
  },
  detailRow: { flexDirection: "row", alignItems: "center" },
  detailItem: { flex: 1, alignItems: "center" },
  detailDivider: {
    width: 1,
    height: 38,
    backgroundColor: "#e2e8f0",
  },
  detailBigNum: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  detailLabel: { fontSize: 10, color: "#64748b", marginTop: 3 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  hazardCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  hazardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hazardEmoji: { fontSize: 24 },
  hazardName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  hazardType: { fontSize: 11, color: "#64748b", marginTop: 1 },
  hazardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  hazardBadgeText: { fontSize: 10, fontWeight: "700" },

  noteBox: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    padding: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 10,
  },
  noteTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 4,
  },
  noteText: { fontSize: 11, color: "#475569", lineHeight: 16 },

  academicFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  academicText: {
    flex: 1,
    fontSize: 10,
    color: "#94a3b8",
    textAlign: "center",
    fontStyle: "italic",
  },
});
