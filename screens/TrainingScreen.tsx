/**
 * TrainingScreen — Capacitación del usuario.
 *
 * Módulos educativos basados en UNGRD y Defensa Civil:
 *   1. Tipos de emergencia (cómo identificarlas)
 *   2. Cómo reportar (qué información aportar)
 *   3. Niveles de gravedad (leve/moderada/grave)
 *   4. Antes/durante/después de una emergencia
 *   5. Puntos de encuentro vs Instituciones
 *
 * Cada tarjeta abre un detalle con contenido didáctico.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
  bgColor: string;
  content: LessonContent;
}

interface LessonContent {
  intro: string;
  sections: { title: string; text: string; emoji?: string }[];
  tip?: string;
}

const LESSONS: Lesson[] = [
  {
    id: "types",
    title: "Tipos de emergencia",
    subtitle: "Aprende a identificar cada situación",
    emoji: "🌊",
    color: "#0369a1",
    bgColor: "#e0f2fe",
    content: {
      intro:
        "Santa Rosa de Cabal enfrenta tres tipos principales de emergencia. Saber diferenciarlas te ayuda a tomar la decisión correcta.",
      sections: [
        {
          emoji: "🌊",
          title: "Inundación",
          text: "El agua desborda ríos o alcantarillas y cubre calles, casas o terrenos. Se manifiesta lentamente o por aguaceros intensos. Señales: lluvia prolongada, nivel de ríos subiendo, charcos que no escurren.",
        },
        {
          emoji: "⛰️",
          title: "Movimiento en masa",
          text: "La tierra, rocas o lodo se deslizan ladera abajo. Común en pendientes tras lluvias fuertes. Señales: grietas en el suelo o muros, árboles inclinados, ruidos de tierra que se mueve, agua turbia saliendo de laderas.",
        },
        {
          emoji: "🌪️",
          title: "Avenida torrencial",
          text: "Creciente súbita y violenta de quebradas arrastrando piedras, troncos y barro. Muy peligrosa por su velocidad. Señales: lluvia muy fuerte en zonas altas, cambio brusco del color del agua, ruido fuerte aguas arriba.",
        },
      ],
      tip: "Si ves cualquiera de estas señales, aléjate del río o ladera y busca zonas altas lejos de quebradas.",
    },
  },
  {
    id: "reports",
    title: "Cómo reportar",
    subtitle: "Qué información dar en un reporte",
    emoji: "📝",
    color: "#c2410c",
    bgColor: "#ffedd5",
    content: {
      intro:
        "Un buen reporte ayuda a otros ciudadanos a decidir rápido. Incluye información clara y una foto si puedes.",
      sections: [
        {
          emoji: "📸",
          title: "Toma una foto",
          text: "Una foto vale más que mil palabras. Captura el punto exacto del peligro desde una distancia segura. Evita fotos movidas o muy lejanas.",
        },
        {
          emoji: "📍",
          title: "Ubicación precisa",
          text: "La app toma tu ubicación automáticamente. Asegúrate de estar CERCA del incidente al reportar, no desde tu casa si el evento es en otra parte.",
        },
        {
          emoji: "🏷️",
          title: "Tipo correcto",
          text: "Elige el tipo que más se ajuste: bloqueo vial, sendero obstruido, inundación puntual, deslizamiento local, riesgo eléctrico, punto de encuentro saturado o cerrado.",
        },
        {
          emoji: "⚖️",
          title: "Gravedad honesta",
          text: "No exageres ni minimices. Reporta lo que realmente ves. Un reporte exagerado hace que otros no confíen en los reportes reales.",
        },
      ],
      tip: "Los reportes se confirman cuando 3 o más ciudadanos reportan algo similar cerca. Ayuda a tu comunidad reportando con precisión.",
    },
  },
  {
    id: "severity",
    title: "Niveles de gravedad",
    subtitle: "Leve, moderada o grave",
    emoji: "⚠️",
    color: "#dc2626",
    bgColor: "#fee2e2",
    content: {
      intro:
        "Clasificar bien la gravedad de un reporte ayuda a priorizar la respuesta. Estas son las tres categorías.",
      sections: [
        {
          emoji: "🟡",
          title: "Leve",
          text: "Molestia o riesgo bajo. Ejemplo: una rama caída sobre la acera que se puede sortear, o un poco de agua empozada. La situación es incómoda pero no pone en riesgo vidas.",
        },
        {
          emoji: "🟠",
          title: "Moderada",
          text: "Impacto claro, requiere atención pronto pero no de emergencia. Ejemplo: sendero parcialmente bloqueado, inundación de pocos centímetros en una vía, deslizamiento pequeño que se ve creciendo.",
        },
        {
          emoji: "🔴",
          title: "Grave",
          text: "Riesgo inminente para vidas o bienes. Requiere respuesta inmediata. Ejemplo: personas atrapadas, deslizamiento mayor activo, inundación que arrastra objetos, poste eléctrico caído con cables expuestos.",
        },
      ],
      tip: "Si marcas 'grave', llama también al 123. La app complementa pero no reemplaza la línea oficial de emergencias.",
    },
  },
  {
    id: "phases",
    title: "Antes, durante, después",
    subtitle: "Qué hacer en cada fase",
    emoji: "🛡️",
    color: "#7c2d12",
    bgColor: "#fef3c7",
    content: {
      intro:
        "La preparación salva vidas. Estos son los tres momentos clave de una emergencia.",
      sections: [
        {
          emoji: "🎒",
          title: "Antes",
          text: "Prepara tu kit 72h (agua, alimentos, linterna, documentos, medicamentos). Identifica los puntos de encuentro cerca de tu casa, trabajo y escuela. Acuerda un plan familiar.",
        },
        {
          emoji: "🏃",
          title: "Durante",
          text: "Mantén la calma. Si estás en zona de riesgo, evacúa SIGUIENDO LA RUTA sugerida. Llama al 123 si hay heridos. No regreses por objetos. Comparte tu estado con tu grupo familiar.",
        },
        {
          emoji: "✅",
          title: "Después",
          text: "Sigue en el punto de encuentro hasta recibir indicación de regreso. Reporta desaparecidos. Ayuda a vecinos si es seguro hacerlo. No consumas agua sin verificar que sea potable. Tomá fotos para reclamaciones.",
        },
      ],
      tip: "La UNGRD recomienda mantener el kit de 72h revisado cada 6 meses (vencimientos de agua, medicamentos, baterías).",
    },
  },
  {
    id: "places",
    title: "Puntos de encuentro e instituciones",
    subtitle: "¿Cuál es la diferencia?",
    emoji: "📍",
    color: "#065f46",
    bgColor: "#d1fae5",
    content: {
      intro:
        "No todos los destinos son iguales. Entender la diferencia te ayuda a elegir mejor.",
      sections: [
        {
          emoji: "🟢",
          title: "Punto de encuentro",
          text: "Espacios abiertos o cubiertos DESIGNADOS OFICIALMENTE para reunirse durante una emergencia. Son seguros, con capacidad y muchas veces con servicios básicos. Ejemplo: coliseos, parques principales, polideportivos.",
        },
        {
          emoji: "🟡",
          title: "Institución",
          text: "Hospitales, CAI, iglesias, colegios. Útiles para casos específicos (emergencia médica, seguridad, refugio temporal) pero NO son puntos oficiales de evacuación para emergencias naturales.",
        },
      ],
      tip: "En una emergencia grave, prioriza el punto de encuentro más cercano. Solo acude a instituciones si tienes una necesidad específica (médica, reporte policial, etc.).",
    },
  },
];

export default function TrainingScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<Lesson | null>(null);

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
          <Text style={styles.headerTitle}>Capacitación</Text>
          <Text style={styles.headerSubtitle}>
            Aprende sobre gestión del riesgo
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.introCard}>
          <Text style={styles.introEmoji}>📚</Text>
          <Text style={styles.introTitle}>5 lecciones esenciales</Text>
          <Text style={styles.introText}>
            Basadas en UNGRD y Defensa Civil Colombiana. Toma unos minutos
            para leer cada una — la preparación salva vidas.
          </Text>
        </View>

        {LESSONS.map((lesson, i) => (
          <TouchableOpacity
            key={lesson.id}
            style={styles.lessonCard}
            onPress={() => setSelected(lesson)}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.lessonNumber,
                { backgroundColor: lesson.bgColor },
              ]}
            >
              <Text style={[styles.lessonNumberText, { color: lesson.color }]}>
                {i + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lessonTitle}>
                {lesson.emoji} {lesson.title}
              </Text>
              <Text style={styles.lessonSubtitle}>{lesson.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Modal con el contenido de la lección */}
      <Modal
        visible={selected !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <SafeAreaView style={styles.lessonRoot} edges={["top", "bottom"]}>
            <View
              style={[
                styles.lessonHeader,
                { backgroundColor: selected.color },
              ]}
            >
              <TouchableOpacity
                onPress={() => setSelected(null)}
                style={styles.backBtn}
              >
                <MaterialIcons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>
                  {selected.emoji} {selected.title}
                </Text>
                <Text style={styles.headerSubtitle}>{selected.subtitle}</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.lessonContent}>
              <Text style={styles.lessonIntro}>{selected.content.intro}</Text>
              {selected.content.sections.map((s, i) => (
                <View key={i} style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>
                    {s.emoji} {s.title}
                  </Text>
                  <Text style={styles.sectionText}>{s.text}</Text>
                </View>
              ))}
              {selected.content.tip && (
                <View style={styles.tipBox}>
                  <MaterialIcons name="lightbulb" size={18} color="#b45309" />
                  <Text style={styles.tipText}>{selected.content.tip}</Text>
                </View>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff7ed" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#c2410c",
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
  headerSubtitle: { color: "#fed7aa", fontSize: 11, marginTop: 1 },
  content: { padding: 16, paddingBottom: 32 },
  introCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  introEmoji: { fontSize: 40, marginBottom: 4 },
  introTitle: { fontSize: 17, fontWeight: "800", color: "#9a3412" },
  introText: {
    fontSize: 12,
    color: "#57534e",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  lessonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  lessonNumber: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  lessonNumberText: { fontSize: 18, fontWeight: "800" },
  lessonTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  lessonSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },

  lessonRoot: { flex: 1, backgroundColor: "#fff" },
  lessonHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 10,
  },
  lessonContent: { padding: 20 },
  lessonIntro: {
    fontSize: 15,
    color: "#334155",
    lineHeight: 22,
    marginBottom: 20,
    fontWeight: "500",
  },
  sectionBlock: {
    marginBottom: 18,
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#e2e8f0",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  sectionText: { fontSize: 13, color: "#475569", lineHeight: 20 },
  tipBox: {
    flexDirection: "row",
    backgroundColor: "#fef3c7",
    padding: 14,
    borderRadius: 12,
    gap: 10,
    marginTop: 12,
  },
  tipText: { fontSize: 13, color: "#78350f", flex: 1, lineHeight: 18 },
});
