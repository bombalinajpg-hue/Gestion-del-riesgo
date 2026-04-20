/**
 * AboutScreen — Acerca de EvacuApp + manual de usuario.
 *
 * Se abre desde el banner del Home. Explica qué hace la app, los 6
 * módulos y el flujo rápido para calcular ruta.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Nombre válido del set MaterialIcons — garantiza que un typo en la
// cadena "icon" explote en TS y no en runtime (ícono fantasma).
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

interface Section {
  icon: MaterialIconName;
  title: string;
  body: string;
}

const UTILIDAD: Section[] = [
  {
    icon: "shield",
    title: "Rutas seguras bajo amenaza",
    body:
      "EvacuApp calcula el camino más rápido y seguro a un punto de encuentro usando un modelo que considera el frente de inundación, deslizamiento o avenida torrencial. No es una ruta ingenua: si un tramo del camino podría quedar cortado antes de que llegues, el algoritmo lo evita.",
  },
  {
    icon: "explore",
    title: "Funciona sin internet",
    body:
      "El grafo vial de Santa Rosa de Cabal y los mapas de amenaza vienen en la app. Todo el cálculo ocurre en tu teléfono, así que funciona aunque las antenas caigan durante una emergencia.",
  },
  {
    icon: "groups",
    title: "Basado en la comunidad",
    body:
      "Los reportes ciudadanos de bloqueos o refugios saturados se suman al ruteo: si tres o más vecinos reportan un problema cerca, el algoritmo ajusta la ruta para evitarlo.",
  },
];

const MODULOS: Section[] = [
  {
    icon: "directions-run",
    title: "Rutas de Evacuación",
    body:
      "El corazón de la app. Eliges emergencia, desplazamiento, punto de partida y destino; la app calcula la ruta y te guía en tiempo real.",
  },
  {
    icon: "warning",
    title: "Durante la Emergencia",
    body:
      "Acceso rápido al 123 y a los servicios de emergencia. El botón 'Calcular ruta inmediata' arma la evacuación en 3 a 5 toques.",
  },
  {
    icon: "group",
    title: "Participación Ciudadana",
    body:
      "Reporta bloqueos, sucesos y personas desaparecidas. Administra tu grupo familiar para compartir ubicación en emergencia.",
  },
  {
    icon: "school",
    title: "Capacitación",
    body:
      "Guías simples de qué hacer antes, durante y después de una emergencia. Basado en UNGRD y Defensa Civil.",
  },
  {
    icon: "backpack",
    title: "Prepárate",
    body:
      "Kit 72 horas, plan familiar y checklist de preparación. Sigue recomendaciones de la UNGRD.",
  },
  {
    icon: "map",
    title: "Datos y Visor",
    body:
      "Mapa vivo del municipio: mapa de calor de tiempos a refugio, instituciones, reportes ciudadanos activos y estadísticas agregadas.",
  },
];

const MANUAL: { step: string; text: string }[] = [
  {
    step: "1",
    text: "Desde el Home, toca 'Calcular ruta de evacuación' o un módulo específico.",
  },
  {
    step: "2",
    text: "Abre el menú lateral del mapa (botón ☰ o el botón verde 'Elegir parámetros') para elegir emergencia, modo de desplazamiento y punto de partida.",
  },
  {
    step: "3",
    text: "Elige el destino: punto más cercano (automático), elegirlo en el mapa de calor o pedir una institución específica (hospital, CAI, parroquia).",
  },
  {
    step: "4",
    text: "Toca 'Iniciar ruta de evacuación'. La app dibuja el camino seguro y te avisa si hay zonas con riesgo alto.",
  },
  {
    step: "5",
    text: "Durante la evacuación puedes ver Street View del destino, abrir Google Maps externo o cancelar para elegir otra ruta.",
  },
];

export default function AboutScreen() {
  const router = useRouter();

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
          <Text style={styles.headerTitle}>Acerca de EvacuApp</Text>
          <Text style={styles.headerSubtitle}>Qué hace y cómo usarla</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            Evacu<Text style={styles.heroTitleAccent}>App</Text>
          </Text>
          <Text style={styles.heroLead}>
            Rutas de evacuación inteligentes para Santa Rosa de Cabal.
          </Text>
        </View>

        {/* Qué hace */}
        <Text style={styles.sectionLabel}>¿Para qué sirve?</Text>
        {UTILIDAD.map((s) => (
          <Card key={s.title} {...s} color="#0f766e" bg="#ccfbf1" />
        ))}

        {/* Módulos */}
        <Text style={styles.sectionLabel}>Módulos de la app</Text>
        {MODULOS.map((s) => (
          <Card key={s.title} {...s} color="#4338ca" bg="#e0e7ff" />
        ))}

        {/* Manual */}
        <Text style={styles.sectionLabel}>Manual de uso rápido</Text>
        {MANUAL.map((m) => (
          <View key={m.step} style={styles.stepRow}>
            <View style={styles.stepCircle}>
              <Text style={styles.stepNum}>{m.step}</Text>
            </View>
            <Text style={styles.stepText}>{m.text}</Text>
          </View>
        ))}

        {/* Créditos */}
        <View style={styles.credits}>
          <Text style={styles.creditsTitle}>Proyecto académico</Text>
          <Text style={styles.creditsBody}>
            Ingeniería Catastral y Geodesia · Universidad Distrital Francisco
            José de Caldas.
          </Text>
          <Text style={styles.creditsBody}>
            Datos de amenaza basados en cartografía municipal y, cuando están
            disponibles, simulaciones hidráulicas con iRIC-Nays2DH.
          </Text>
          <Text style={styles.creditsBody}>
            Recomendaciones de preparación basadas en UNGRD y Defensa Civil
            Colombiana.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({
  icon,
  title,
  body,
  color,
  bg,
}: Section & { color: string; bg: string }) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardIconWrap, { backgroundColor: bg }]}>
        <MaterialIcons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#073b4c",
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
  headerSubtitle: { color: "#cbd5e1", fontSize: 11, marginTop: 2 },

  content: { padding: 16, paddingBottom: 40 },

  hero: {
    backgroundColor: "#073b4c",
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroTitleAccent: { color: "#ffd166" },
  heroLead: {
    color: "#cbd5e1",
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 18,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 10,
  },

  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  cardBody: { fontSize: 12, color: "#475569", marginTop: 3, lineHeight: 16 },

  stepRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    paddingHorizontal: 2,
    alignItems: "flex-start",
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0f766e",
    justifyContent: "center",
    alignItems: "center",
  },
  stepNum: { color: "#fff", fontWeight: "800", fontSize: 13 },
  stepText: { flex: 1, fontSize: 13, color: "#334155", lineHeight: 18 },

  credits: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  creditsTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  creditsBody: { fontSize: 11, color: "#64748b", lineHeight: 16 },
});
