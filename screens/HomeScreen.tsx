/**
 * HomeScreen — Pantalla principal de la app.
 *
 * Estructura:
 *   - Hero con logo, nombre de la app y llamado a la acción
 *   - Grid de 6 módulos (Rutas, Emergencia, Participación,
 *     Capacitación, Prepárate, Estadísticas)
 *   - Summary card con estado de preparación del usuario
 *   - Botón flotante de llamada al 123
 *
 * Cada card tiene: ícono grande, título, subtítulo corto, color
 * distintivo, y acción de navegación al stack correspondiente.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAllGroups } from "../src/services/familyGroupsService";
import { getActiveMissing } from "../src/services/missingPersonsService";
import {
  getProgress as getPreparednessProgress,
  loadPreparedness,
} from "../src/services/preparednessService";
import { getActiveBlockingAlerts } from "../src/services/reportsService";

// ─── Configuración de módulos ──────────────────────────────────────────────

interface ModuleDef {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  bgColor: string;
  screen: string; // path de expo-router
  params?: any;
  size: "large" | "normal";
}

const MODULES: ModuleDef[] = [
  {
    id: "routes",
    title: "Rutas de Evacuación",
    subtitle: "Calcula tu camino más seguro",
    icon: "directions-run",
    color: "#0f766e",
    bgColor: "#ccfbf1",
    screen: "/map",
    size: "large",
  },
  {
    id: "emergency",
    title: "Durante la Emergencia",
    subtitle: "Acciones rápidas si ya pasó algo",
    icon: "warning",
    color: "#b91c1c",
    bgColor: "#fee2e2",
    screen: "/emergency",
    size: "normal",
  },
  {
    id: "community",
    title: "Participación Ciudadana",
    subtitle: "Reporta · Familia · Desaparecidos",
    icon: "group",
    color: "#7c3aed",
    bgColor: "#ede9fe",
    screen: "/community",
    size: "normal",
  },
  {
    id: "training",
    title: "Capacitación",
    subtitle: "Aprende sobre emergencias",
    icon: "school",
    color: "#c2410c",
    bgColor: "#ffedd5",
    screen: "/training",
    size: "normal",
  },
  {
    id: "prepare",
    title: "Prepárate",
    subtitle: "Kit 72h y plan familiar",
    icon: "backpack",
    color: "#0369a1",
    bgColor: "#e0f2fe",
    screen: "/prepare",
    size: "normal",
  },
  {
    id: "statistics",
    title: "Estadísticas",
    subtitle: "Datos abiertos del municipio",
    icon: "insights",
    color: "#4338ca",
    bgColor: "#e0e7ff",
    screen: "/statistics",
    size: "normal",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const [prepPct, setPrepPct] = useState(0);
  const [prepCount, setPrepCount] = useState({ checked: 0, total: 18 });
  const [familyGroups, setFamilyGroups] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [activeMissing, setActiveMissing] = useState(0);

  const refreshStatus = async () => {
    try {
      const prep = await loadPreparedness();
      const progress = getPreparednessProgress(prep);
      setPrepPct(progress.percent);
      setPrepCount({ checked: progress.checked, total: progress.total });
      const groups = await getAllGroups();
      setFamilyGroups(groups.length);
      const alerts = await getActiveBlockingAlerts();
      setActiveAlerts(alerts.length);
      const missing = await getActiveMissing();
      setActiveMissing(missing.length);
    } catch {}
  };

  useEffect(() => {
    refreshStatus();
    // Re-carga al enfocar la pantalla
    return () => {};
  }, [navigation]);

  const handleCall123 = () => {
    Alert.alert("Llamar al 123", "¿Deseas llamar al número de emergencias?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Llamar", onPress: () => Linking.openURL("tel:123") },
    ]);
  };

  const prepColor =
    prepPct >= 1 ? "#059669" : prepPct >= 0.5 ? "#eab308" : "#dc2626";

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── HERO ──────────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <View style={styles.heroGradientTop} />
            <View style={styles.heroBadge}>
              <MaterialIcons name="shield" size={14} color="#ffffff" />
              <Text style={styles.heroBadgeText}>SANTA ROSA DE CABAL</Text>
            </View>
            <Text style={styles.heroTitle}>
              Rutas{"\n"}
              <Text style={styles.heroTitleAccent}>de Evacuación</Text>
            </Text>
            <Text style={styles.heroSubtitle}>
              Prepárate · Actúa · Comunica
            </Text>
            <View style={styles.heroDecoration}>
              <View style={[styles.heroDot, { backgroundColor: "#ef476f" }]} />
              <View style={[styles.heroDot, { backgroundColor: "#ffd166" }]} />
              <View style={[styles.heroDot, { backgroundColor: "#06d6a0" }]} />
              <View style={[styles.heroDot, { backgroundColor: "#118ab2" }]} />
            </View>
          </View>

          {/* ── ALERT BAR (si hay alertas activas en zona) ──────────────── */}
          {activeAlerts > 0 && (
            <TouchableOpacity
              style={styles.alertBar}
              onPress={() => router.push("/community")}
              activeOpacity={0.8}
            >
              <MaterialIcons name="error" size={18} color="#fff" />
              <Text style={styles.alertBarText}>
                {activeAlerts} alerta{activeAlerts !== 1 ? "s" : ""} ciudadana
                {activeAlerts !== 1 ? "s" : ""} activa
                {activeAlerts !== 1 ? "s" : ""} cerca
              </Text>
              <MaterialIcons name="chevron-right" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {/* ── CTA PRINCIPAL ─────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push({ pathname: "/map", params: { autoOpen: "drawer" } })}
            activeOpacity={0.85}
          >
            <View style={styles.ctaIconWrap}>
              <MaterialIcons name="directions-run" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Calcular ruta de evacuación</Text>
              <Text style={styles.ctaSubtitle}>
                Encuentra tu camino seguro ahora
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={22} color="#fff" />
          </TouchableOpacity>

          {/* ── MÓDULOS SECUNDARIOS (grid 2x3) ───────────────────────── */}
          <Text style={styles.sectionTitle}>Todas las herramientas</Text>
          <View style={styles.grid}>
            {MODULES.filter((m) => m.id !== "routes").map((mod) => (
              <TouchableOpacity
                key={mod.id}
                style={styles.gridCard}
                onPress={() => router.push(mod.screen)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.gridIconWrap,
                    { backgroundColor: mod.bgColor },
                  ]}
                >
                  <MaterialIcons
                    name={mod.icon as any}
                    size={28}
                    color={mod.color}
                  />
                  {/* Badges específicos */}
                  {mod.id === "community" && activeMissing > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{activeMissing}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.gridTitle}>{mod.title}</Text>
                <Text style={styles.gridSubtitle}>{mod.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── STATUS CARD ───────────────────────────────────────────── */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <MaterialIcons name="task-alt" size={18} color="#374151" />
              <Text style={styles.statusTitle}>Tu estado de preparación</Text>
            </View>

            <View style={styles.statusRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusLabel}>Kit de emergencia</Text>
                <View style={styles.statusBarBg}>
                  <View
                    style={[
                      styles.statusBarFill,
                      {
                        width: `${prepPct * 100}%`,
                        backgroundColor: prepColor,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.statusValue}>
                  {prepCount.checked}/{prepCount.total} ·{" "}
                  {Math.round(prepPct * 100)}%
                </Text>
              </View>
            </View>

            <View style={styles.statusItemsRow}>
              <View style={styles.statusItem}>
                <MaterialIcons
                  name={familyGroups > 0 ? "check-circle" : "radio-button-unchecked"}
                  size={16}
                  color={familyGroups > 0 ? "#059669" : "#9ca3af"}
                />
                <Text style={styles.statusItemText}>
                  {familyGroups > 0
                    ? `Grupo familiar (${familyGroups})`
                    : "Sin grupo familiar"}
                </Text>
              </View>
              <View style={styles.statusItem}>
                <MaterialIcons
                  name={prepPct === 1 ? "check-circle" : "radio-button-unchecked"}
                  size={16}
                  color={prepPct === 1 ? "#059669" : "#9ca3af"}
                />
                <Text style={styles.statusItemText}>
                  {prepPct === 1 ? "Kit completo" : "Kit incompleto"}
                </Text>
              </View>
            </View>
          </View>

          {/* ── FOOTER ────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Basado en UNGRD y Defensa Civil Colombiana
            </Text>
            <Text style={styles.footerSub}>
              Ingeniería Catastral · Universidad Distrital
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ── BOTÓN 123 FLOTANTE ───────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.emergencyFab}
        onPress={handleCall123}
        activeOpacity={0.85}
      >
        <MaterialIcons name="phone" size={22} color="#fff" />
        <Text style={styles.emergencyFabText}>123</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { paddingBottom: 120 },

  // ─── Hero ───
  hero: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 24,
    paddingTop: 32,
    paddingBottom: 28,
    backgroundColor: "#073b4c",
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
  },
  heroGradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: "#0a4a5f",
    opacity: 0.5,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  heroBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  heroTitleAccent: { color: "#ffd166" },
  heroSubtitle: {
    color: "#cbd5e1",
    fontSize: 14,
    marginTop: 8,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  heroDecoration: {
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
  },
  heroDot: { width: 10, height: 10, borderRadius: 5 },

  // ─── Alerta ciudadana ───
  alertBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#dc2626",
    borderRadius: 12,
    gap: 8,
  },
  alertBarText: {
    flex: 1,
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  // ─── CTA principal ───
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#0f766e",
    padding: 16,
    borderRadius: 18,
    gap: 14,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    justifyContent: "center",
    alignItems: "center",
  },
  ctaTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  ctaSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    marginTop: 2,
  },

  // ─── Grid ───
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
  },
  gridCard: {
    width: "47.5%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    minHeight: 130,
  },
  gridIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#dc2626",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  gridTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 18,
  },
  gridSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 3,
    lineHeight: 14,
  },

  // ─── Status card ───
  statusCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  statusTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  statusRow: { marginBottom: 12 },
  statusLabel: { fontSize: 12, color: "#475569", marginBottom: 6 },
  statusBarBg: {
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  statusBarFill: { height: "100%", borderRadius: 4 },
  statusValue: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4,
  },
  statusItemsRow: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusItemText: { fontSize: 11, color: "#475569" },

  // ─── Footer ───
  footer: { marginTop: 24, alignItems: "center", paddingHorizontal: 16 },
  footerText: { fontSize: 11, color: "#94a3b8", fontStyle: "italic" },
  footerSub: { fontSize: 10, color: "#cbd5e1", marginTop: 2 },

  // ─── FAB 123 ───
  emergencyFab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  emergencyFabText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
