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
import { useCallback, useEffect, useState } from "react";
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
import FamilyGroupModal from "../components/FamilyGroupModal";
import FirstRunGuide, { hasSeenFirstRunGuide } from "../components/FirstRunGuide";
import MissingPersonsModal from "../components/MissingPersonsModal";
import BottomNavBar from "../components/BottomNavBar";
import QuickEvacuateSheet, { type ConfirmPayload } from "../components/QuickEvacuateSheet";
import ReportModal from "../components/ReportModal";
import SafetyStatusModal from "../components/SafetyStatusModal";
import { useAuth } from "../context/AuthContext";
import { useRouteContext } from "../context/RouteContext";
import { useCommunityStatus } from "../src/hooks/useCommunityStatus";
import destinosRaw from "../data/destinos.json";
import institucionesRaw from "../data/instituciones.json";
import type { Destino, Institucion } from "../src/types/types";

const destinos = destinosRaw as Destino[];
const instituciones = institucionesRaw as Institucion[];
const puntosEncuentro = destinos.filter((d) => d.tipo === "punto_encuentro");

// Helper de pluralización en español. Usamos "reporte" (no "alerta")
// porque el usuario se confundía pensando que era una alerta oficial
// de evacuación. "Reporte" comunica mejor que es información enviada
// por ciudadanos.
function pluralizeAlerts(count: number): string {
  return count === 1 ? "1 reporte cerca" : `${count} reportes cerca`;
}

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

// Bloque inferior de líneas de emergencia. Reemplaza al antiguo FAB 123
// flotante con un listado estético, para que el usuario tenga a mano
// todos los números clave (no solo 123).
const EMERGENCY_NUMBERS: {
  label: string;
  number: string;
  icon: MaterialIconName;
  color: string;
  bg: string;
}[] = [
  { label: "Línea 123",       number: "123", icon: "phone",             color: "#dc2626", bg: "#fee2e2" },
  { label: "Bomberos",        number: "119", icon: "local-fire-department", color: "#ea580c", bg: "#ffedd5" },
  { label: "Defensa Civil",   number: "144", icon: "shield",            color: "#0f766e", bg: "#ccfbf1" },
  { label: "Cruz Roja",       number: "132", icon: "medical-services",  color: "#b91c1c", bg: "#fee2e2" },
];

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
  // `community` se quitó: todas sus herramientas (Reportar, Familia,
  // Desaparecidos, Estado) están en la fila "Durante la emergencia"
  // arriba. Mantener el módulo duplicaba la UI sin agregar valor.
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
  const { alerts, alertCount: activeAlerts, refresh } = useCommunityStatus();
  const {
    setEmergencyType,
    setStartMode,
    setStartPoint,
    setDestinationMode,
    setSelectedDestination,
    setSelectedInstitucion,
    setRouteProfile,
    setQuickRouteMode,
    setPendingDestKind,
    setPickingFromIsochroneMap,
    setShowingInstitucionesOverlay,
  } = useRouteContext();
  const [sheetVisible, setSheetVisible] = useState(false);
  // Modales de "Durante la emergencia" levantados hasta Home para que
  // el usuario no tenga que navegar a EmergencyScreen → minimizamos taps
  // en el camino crítico (compartir estado, ver familia, reportar).
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { user } = useAuth();
  const [guideOpen, setGuideOpen] = useState(false);

  // Tour de primera ejecución: se muestra una vez por cuenta. El flag
  // vive en AsyncStorage con la key `firstRunGuideSeen:<uid>` (por eso
  // un nuevo usuario en el mismo teléfono sí lo ve de nuevo).
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    hasSeenFirstRunGuide(user.uid).then((seen) => {
      if (!cancelled && !seen) setGuideOpen(true);
    });
    return () => { cancelled = true; };
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      refresh({ maxAgeMs: 15_000 });
    }, [refresh]),
  );

  // El sheet devuelve las 3 decisiones en un único payload. Según el
  // destChoice:
  //
  //  · closest  → destinationMode=closest, auto-calc al confirmar origen.
  //  · heatmap  → activa picker de isócronas en /map (vía pendingDestKind).
  //  · instituciones → el sheet ya trae el item específico
  //    (shelter/institucion) en el payload. Seteamos selectedDestination
  //    o selectedInstitucion y destinationMode=manual para que Case A
  //    (GPS) / CONFIRMAR PUNTO (manual) auto-calculen a ese destino.
  //
  // `pendingDestKind` sirve como memoria: MapViewContainer la lee al
  // confirmar el punto de inicio manual para decidir qué hacer.
  const handleQuickEvacuate = (p: ConfirmPayload) => {
    setSheetVisible(false);
    setSelectedDestination(p.shelter ?? null);
    setSelectedInstitucion(p.institucion ?? null);
    setEmergencyType(p.emergency);
    setRouteProfile("foot-walking");
    setQuickRouteMode(true);
    setStartPoint(null);

    // Si el usuario escogió un item específico desde el selector de
    // instituciones, el destino ya está resuelto — no hace falta
    // disparar pickers en el mapa. Tratamos el pendingDestKind como
    // "closest" para que Case A / CONFIRMAR dispare auto-calc directo
    // contra el selected*.
    const hasSpecific = p.shelter || p.institucion;
    const effectiveKind = hasSpecific ? "closest" : p.destChoice === "locked" ? "closest" : p.destChoice;
    setPendingDestKind(effectiveKind);
    setDestinationMode(effectiveKind === "closest" ? (hasSpecific ? "manual" : "closest") : "manual");
    // Los overlays de picker (isócronas / instituciones) se activan
    // DESPUÉS, al confirmar el punto de inicio — no acá. Si los
    // prendíamos aquí, el onPress del mapa manual quedaba bloqueado.
    setPickingFromIsochroneMap(false);
    setShowingInstitucionesOverlay(false);

    if (p.start === "gps") {
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
              <Text style={styles.heroBadgeText}>Santa Rosa de Cabal</Text>
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
              onPress={() => {
                // Tomamos la alerta "más caliente" (mayor supportCount)
                // para centrar el mapa — si hay varias, el usuario casi
                // siempre quiere ver la más crítica primero. Pasamos lat/lng
                // + flag `showReports=1` al Visor para que active el
                // heatmap y haga zoom al punto.
                const hottest = [...alerts].sort(
                  (a, b) => b.supportCount - a.supportCount,
                )[0];
                router.push({
                  pathname: "/statistics",
                  params: hottest
                    ? {
                        focusLat: String(hottest.lat),
                        focusLng: String(hottest.lng),
                        showReports: "1",
                      }
                    : {},
                });
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="error" size={18} color="#fff" />
              <Text style={styles.alertBarText}>{pluralizeAlerts(activeAlerts)}</Text>
              <MaterialIcons name="chevron-right" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {/* ── CTA PRINCIPAL — Panic button ───────────────────────────
              Un solo tap lanza el flujo de emergencia y auto-calcula la
              ruta al punto de encuentro más cercano con pesos de amenaza.
              Rojo saturado + sombra encendida para que sea identificable
              como "acción crítica" sin aprendizaje previo. */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => setSheetVisible(true)}
            activeOpacity={0.85}
            accessibilityLabel="Evacúa ahora"
            accessibilityRole="button"
            accessibilityHint="Pregunta el tipo de emergencia y el punto de inicio; calcula automáticamente la ruta al punto de encuentro más seguro y cercano"
          >
            <View style={styles.ctaIconWrap}>
              <MaterialIcons name="directions-run" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Evacua</Text>
              <Text style={styles.ctaSubtitle}>
                Ruta al punto de encuentro más seguro y cercano
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={22} color="#fff" />
          </TouchableOpacity>

          {/* ── DURANTE LA EMERGENCIA — acciones rápidas en un tap ────
              Levantamos los modales de EmergencyScreen (estado, familia,
              desaparecidos) directo al Home. Evita navegar a otra
              pantalla cuando el usuario ya está en pánico. */}
          <Text style={styles.sectionTitle}>Durante la emergencia</Text>
          <View style={styles.emergencyRow}>
            <TouchableOpacity
              style={styles.emergencyTool}
              onPress={() => setSafetyOpen(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Compartir mi estado: a salvo, evacuando o necesito ayuda"
            >
              <View style={[styles.emergencyToolIcon, { backgroundColor: "#d1fae5" }]}>
                <MaterialIcons name="shield" size={22} color="#10b981" />
              </View>
              <Text
                style={styles.emergencyToolLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >Mi estado</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emergencyTool}
              onPress={() => setFamilyOpen(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Ver ubicación de familia"
            >
              <View style={[styles.emergencyToolIcon, { backgroundColor: "#ede9fe" }]}>
                <MaterialIcons name="group" size={22} color="#7c3aed" />
              </View>
              <Text
                style={styles.emergencyToolLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >Familia</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emergencyTool}
              onPress={() => setMissingOpen(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Reportar desaparecido"
            >
              <View style={[styles.emergencyToolIcon, { backgroundColor: "#fce7f3" }]}>
                <MaterialIcons name="person-search" size={22} color="#db2777" />
              </View>
              <Text
                style={styles.emergencyToolLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >Desaparecido</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emergencyTool}
              onPress={() => setReportOpen(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Reportar un incidente ciudadano"
            >
              <View style={[styles.emergencyToolIcon, { backgroundColor: "#ffedd5" }]}>
                <MaterialIcons name="report" size={22} color="#c2410c" />
              </View>
              <Text
                style={styles.emergencyToolLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >Reportar</Text>
            </TouchableOpacity>
          </View>

          {/* ── BLOQUE LÍNEAS DE EMERGENCIA ───────────────────────────
              Orden pedido por la usuaria: Emergencia → Líneas → Otras.
              Las líneas quedan justo después de "Durante la emergencia"
              porque son la acción ciudadana más primitiva (marcar 123
              cuando algo ya pasó). */}
          <Text style={styles.sectionTitle}>Líneas de emergencia</Text>
          <View style={styles.emergencyRow}>
            {EMERGENCY_NUMBERS.map((num) => (
              <TouchableOpacity
                key={num.label}
                style={styles.emergencyTool}
                onPress={() => {
                  Alert.alert(
                    `Llamar a ${num.label}`,
                    `¿Deseas llamar al ${num.number}?`,
                    [
                      { text: "Cancelar", style: "cancel" },
                      { text: "Llamar", onPress: () => Linking.openURL(`tel:${num.number}`) },
                    ],
                  );
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Llamar a ${num.label} ${num.number}`}
              >
                <View style={[styles.emergencyToolIcon, { backgroundColor: num.bg }]}>
                  <MaterialIcons name={num.icon} size={22} color={num.color} />
                </View>
                <Text
                  style={styles.emergencyToolLabel}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >{num.label}</Text>
                <Text style={styles.emergencyNumber}>{num.number}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── OTRAS HERRAMIENTAS (grid 2×n) ──────────────────────────
              Renombrado de "Todas las herramientas" → "Otras" porque
              Evacúa, Durante la emergencia y Líneas ya están arriba. */}
          <Text style={styles.sectionTitle}>Otras herramientas</Text>
          <View style={styles.grid}>
            {MODULES.filter((m) =>
              m.id !== "routes" && m.id !== "emergency" && m.id !== "statistics"
            ).map((mod) => (
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
            <Text style={styles.footerAlliance}>
              En alianza con CTGlobal
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <QuickEvacuateSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onConfirm={handleQuickEvacuate}
        puntosEncuentro={puntosEncuentro}
        instituciones={instituciones}
      />
      <SafetyStatusModal
        visible={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        location={null}
      />
      <FamilyGroupModal
        visible={familyOpen}
        onClose={() => setFamilyOpen(false)}
      />
      <MissingPersonsModal
        visible={missingOpen}
        onClose={() => setMissingOpen(false)}
      />
      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={() => {
          setReportOpen(false);
          refresh({ recompute: true });
        }}
      />

      <FirstRunGuide
        userUid={user?.uid ?? null}
        visible={guideOpen}
        onClose={() => setGuideOpen(false)}
      />

      <BottomNavBar active="inicio" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  // Reserva espacio para el bottom nav (alto ~64) + safe-area inferior
  // + bloque "Líneas de emergencia" (~140) + footer (~90). El valor
  // previo de 110 cortaba la última fila cuando se agregó el bloque.
  scrollContent: { paddingBottom: 170 },

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

  // ─── Grid 2×2 de "Durante la emergencia" y "Líneas de emergencia" ───
  // Antes era 1 fila × 4 columnas — en pantallas de 360–380 px las
  // palabras largas (Desaparecido, Bomberos + número) hacían word-break
  // feo (p.ej. "Desapar\necido"). Con 2×2 cada card gana ~2× de ancho
  // y los labels caben en una sola línea.
  emergencyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginHorizontal: 16,
  },
  emergencyTool: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  emergencyToolIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyToolLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  emergencyNumber: {
    fontSize: 11,
    color: "#dc2626",
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ─── Título de sección ───
  // Sentence-case + bold + color acento + línea separadora arriba.
  // Reemplaza el antiguo estilo all-caps que el usuario consideró feo.
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f766e",
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 10,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: "#e0f2f1",
    letterSpacing: -0.2,
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
  footerText: {
    fontSize: 11, color: "#94a3b8", fontStyle: "italic",
    textAlign: "center",
  },
  footerSub: {
    fontSize: 10, color: "#64748b", marginTop: 2,
    textAlign: "center",
  },
  footerAlliance: {
    fontSize: 10, color: "#0f766e", marginTop: 4,
    textAlign: "center", fontWeight: "700",
  },
});
