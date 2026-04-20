/**
 * HomeScreen — Pantalla principal de la app.
 *
 * Estructura:
 *   - Hero con logo, nombre de la app y llamado a la acción
 *   - Alert bar (si hay alertas ciudadanas activas)
 *   - CTA principal "Calcular ruta"
 *   - Grid 2×3 de módulos secundarios
 *   - Botón flotante 123
 *
 * El panel "Tu estado de preparación" se quitó porque el kit y el grupo
 * familiar ya viven en sus propios módulos (Prepárate y Participación
 * Ciudadana) y se mostraban dos veces.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QuickEvacuateSheet, { type StartSource } from "../components/QuickEvacuateSheet";
import { useRouteContext } from "../context/RouteContext";
import { useCommunityStatus } from "../src/hooks/useCommunityStatus";
import type { EmergencyType } from "../src/types/types";

// Helper de pluralización en español. El texto corto ("N alertas cerca")
// funciona mejor en barras angostas que la forma larga anterior — la
// palabra "ciudadana" no agrega información en este contexto porque es
// el único tipo de alerta que la app muestra en la barra.
function pluralizeAlerts(count: number): string {
  return count === 1 ? "1 alerta cerca" : `${count} alertas cerca`;
}

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

interface ModuleDef {
  id: string;
  title: string;
  subtitle: string;
  icon: MaterialIconName;
  color: string;
  bgColor: string;
  screen: Href;
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
  },
  {
    id: "emergency",
    title: "Durante la Emergencia",
    subtitle: "Acciones rápidas si ya pasó algo",
    icon: "warning",
    color: "#b91c1c",
    bgColor: "#fee2e2",
    screen: "/emergency",
  },
  {
    id: "community",
    title: "Participación Ciudadana",
    subtitle: "Reporta · Familia · Desaparecidos",
    icon: "group",
    color: "#7c3aed",
    bgColor: "#ede9fe",
    screen: "/community",
  },
  {
    id: "training",
    title: "Capacitación",
    subtitle: "Aprende sobre emergencias",
    icon: "school",
    color: "#c2410c",
    bgColor: "#ffedd5",
    screen: "/training",
  },
  {
    id: "prepare",
    title: "Prepárate",
    subtitle: "Kit 72h y plan familiar",
    icon: "backpack",
    color: "#0369a1",
    bgColor: "#e0f2fe",
    screen: "/prepare",
  },
  {
    id: "statistics",
    title: "Datos y Visor",
    subtitle: "Mapa vivo · reportes · cifras",
    icon: "map",
    color: "#4338ca",
    bgColor: "#e0e7ff",
    screen: "/statistics",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  // Cache compartida entre pantallas. Refrescamos al enfocar solo si la
  // cache es más vieja que 15 s — si ya se actualizó recientemente desde
  // otra pantalla, no duplicamos queries.
  const { alertCount: activeAlerts, missingCount: activeMissing, refresh } =
    useCommunityStatus();
  const {
    setEmergencyType,
    setStartMode,
    setStartPoint,
    setDestinationMode,
    setSelectedDestination,
    setSelectedInstitucion,
    setRouteProfile,
    setQuickRouteMode,
  } = useRouteContext();
  const [sheetVisible, setSheetVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh({ maxAgeMs: 15_000 });
    }, [refresh]),
  );

  const handleCall123 = () => {
    Alert.alert("Llamar al 123", "¿Deseas llamar al número de emergencias?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Llamar", onPress: () => Linking.openURL("tel:123") },
    ]);
  };

  // El sheet de evacuación rápida devuelve las dos decisiones juntas; acá
  // setteamos contexto y navegamos con los params que gatillan el
  // quickRoutePipeline (Case A con `autoRoute=1` para GPS, Case B con
  // `autoOpen=pickStart` para manual + destinationMode=closest ya
  // pre-seteado para que salte el Alert de método).
  const handleQuickEvacuate = (
    emergency: Exclude<EmergencyType, "ninguna">,
    start: StartSource,
  ) => {
    setSheetVisible(false);
    setSelectedDestination(null);
    setSelectedInstitucion(null);
    setEmergencyType(emergency);
    setRouteProfile("foot-walking");
    setDestinationMode("closest");
    setQuickRouteMode(true);
    setStartPoint(null);
    if (start === "gps") {
      setStartMode("gps");
      router.push({ pathname: "/map", params: { autoRoute: "1" } });
    } else {
      setStartMode("manual");
      router.push({ pathname: "/map", params: { autoOpen: "pickStart" } });
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── HERO (clickeable → Acerca de) ─────────────────────────── */}
          <TouchableOpacity
            style={styles.hero}
            onPress={() => router.push("/about")}
            activeOpacity={0.9}
            accessibilityLabel="Acerca de EvacuApp"
          >
            <View style={styles.heroGradientTop} />
            <View style={styles.heroInfoHint}>
              <MaterialIcons name="info-outline" size={14} color="#ffd166" />
              <Text style={styles.heroInfoHintText}>Acerca de</Text>
              <MaterialIcons name="chevron-right" size={14} color="#ffd166" />
            </View>
            <View style={styles.heroBadge}>
              <MaterialIcons name="shield" size={14} color="#ffffff" />
              <Text style={styles.heroBadgeText}>SANTA ROSA DE CABAL</Text>
            </View>
            <Text style={styles.heroTitle}>
              Evacu<Text style={styles.heroTitleAccent}>App</Text>
            </Text>
            <Text style={styles.heroSubtitle}>
              Prepárate · Actúa · Comunica
            </Text>
          </TouchableOpacity>

          {/* ── ALERT BAR (si hay alertas activas en zona) ──────────────── */}
          {activeAlerts > 0 && (
            <TouchableOpacity
              style={styles.alertBar}
              onPress={() => router.push("/community")}
              activeOpacity={0.8}
            >
              <MaterialIcons name="error" size={18} color="#fff" />
              <Text style={styles.alertBarText}>{pluralizeAlerts(activeAlerts)}</Text>
              <MaterialIcons name="chevron-right" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {/* ── CTA PRINCIPAL — Panic button ───────────────────────────
              Un solo tap lanza el flujo de emergencia (Alert de tipo,
              Alert de inicio) y auto-calcula la ruta al refugio más
              cercano con pesos de amenaza. Rojo saturado + sombra
              encendida para que sea identificable como "acción crítica"
              sin aprendizaje previo — mismo lenguaje visual que el 123. */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => setSheetVisible(true)}
            activeOpacity={0.85}
            accessibilityLabel="Evacúa ahora"
            accessibilityRole="button"
            accessibilityHint="Pregunta el tipo de emergencia y el punto de inicio; calcula automáticamente la ruta al refugio más seguro y cercano"
          >
            <View style={styles.ctaIconWrap}>
              <MaterialIcons name="directions-run" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Evacua</Text>
              <Text style={styles.ctaSubtitle}>
                Ruta al refugio más seguro y cercano
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
                accessibilityRole="button"
                accessibilityLabel={`${mod.title}. ${mod.subtitle}`}
              >
                <View
                  style={[
                    styles.gridIconWrap,
                    { backgroundColor: mod.bgColor },
                  ]}
                >
                  <MaterialIcons
                    name={mod.icon}
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

          {/* ── FOOTER ────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Basado en UNGRD y Defensa Civil Colombiana
            </Text>
            <Text style={styles.footerSub}>
              Ingeniería Catastral y Geodesia · Universidad Distrital Francisco José de Caldas
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ── BOTÓN 123 FLOTANTE ───────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.emergencyFab}
        onPress={handleCall123}
        activeOpacity={0.85}
        accessibilityLabel="Llamar a la línea de emergencia 123"
        accessibilityRole="button"
        accessibilityHint="Abre el marcador telefónico con el número 123"
      >
        <MaterialIcons name="phone" size={22} color="#fff" />
        <Text style={styles.emergencyFabText}>123</Text>
      </TouchableOpacity>

      <QuickEvacuateSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onConfirm={handleQuickEvacuate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  // paddingBottom reserva espacio para el 123 FAB (bottom: 24, alto ~50)
  // + margen holgado para que la última fila del grid nunca quede tapada,
  // ni siquiera en dispositivos con home-indicator grande.
  scrollContent: { paddingBottom: 140 },

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
  heroInfoHint: {
    position: "absolute",
    top: 12,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  heroInfoHintText: {
    color: "#ffd166",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

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

  // ─── CTA principal (panic button) ───
  // Rojo `#dc2626` = mismo tono que el 123 FAB para que el usuario
  // reconozca la paleta "acción crítica / emergencia" en un vistazo.
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#dc2626",
    padding: 16,
    borderRadius: 18,
    gap: 14,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
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
    // 2 cards por fila con gap: 12 en el contenedor. `flex: 1` + flexBasis
    // cerca del 48 % asegura que SIEMPRE entren 2 columnas sin desbordar
    // en pantallas angostas (<370 pt) donde "47.5 %" antes se pasaba.
    flexBasis: "47%",
    flexGrow: 1,
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
