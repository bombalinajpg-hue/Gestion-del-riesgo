/**
 * Onboarding — 3 slides que el usuario ve la primera vez que abre la
 * app, antes de llegar al Home. Explica qué es EvacuApp, cómo se usa
 * y el rol de los reportes ciudadanos.
 *
 * Persistencia **por-usuario**: el flag guarda la forma
 * `onboarding_done_v1:<firebase_uid>`. Así, si una persona hace logout
 * y otra se loguea en el mismo dispositivo (típico en una demo con el
 * director), el nuevo usuario sí ve el onboarding porque su uid no ha
 * sido marcado. Antes usábamos una key global y el segundo usuario se
 * saltaba el onboarding.
 */

import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";

const ONBOARDING_KEY_PREFIX = "onboarding_done_v1:";

/** Key en AsyncStorage para marcar que el usuario `uid` ya vio el
 *  onboarding. Un usuario sin uid (pre-login) no debería llegar a
 *  onboarding — el AuthGate lo redirige a /login primero. */
export function onboardingKey(uid: string): string {
  return `${ONBOARDING_KEY_PREFIX}${uid}`;
}

export async function hasSeenOnboarding(uid: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(onboardingKey(uid));
    return v === "1";
  } catch (e) {
    // Logueamos en vez de tragar silencioso (bug #2 del audit): si
    // AsyncStorage falla durante la lectura, el comportamiento
    // conservador es NO mostrar el onboarding de nuevo, pero quiero
    // saber cuándo pasa para diagnosticar.
    console.warn("[onboarding] read falló, asumimos visto:", e);
    return true;
  }
}

export async function markOnboardingSeen(uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(onboardingKey(uid), "1");
  } catch (e) {
    // No bloqueamos el flujo si falla — el usuario verá onboarding
    // de nuevo la próxima vez, molesto pero no fatal.
    console.warn("[onboarding] write falló:", e);
  }
}

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

interface Slide {
  icon: MaterialIconName;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
}

// Los 3 slides en orden. Cada uno responde a una pregunta del usuario
// nuevo:
//   1) ¿Qué es esto?        — propósito de la app.
//   2) ¿Cómo me ayuda?      — features core en una frase.
//   3) ¿Qué tengo que hacer?— llamado a la acción + primera tarea.
const SLIDES: Slide[] = [
  {
    icon: "shield",
    iconBg: "#fee2e2",
    iconColor: "#dc2626",
    title: "Tu app de evacuación",
    body:
      "EvacuApp te guía al punto de encuentro más seguro y cercano cuando pasa una emergencia en Santa Rosa de Cabal: inundación, deslizamiento, avenida torrencial.",
  },
  {
    icon: "directions-run",
    iconBg: "#dcfce7",
    iconColor: "#059669",
    title: "Calcula tu ruta en segundos",
    body:
      "Un solo botón te pregunta qué está pasando, desde dónde sales y a dónde quieres ir. Calcula la ruta más segura esquivando zonas de riesgo y reportes recientes.",
  },
  {
    icon: "groups",
    iconBg: "#e0e7ff",
    iconColor: "#4338ca",
    title: "En comunidad",
    body:
      "Reporta bloqueos y alertas para avisar a tus vecinos. Forma un grupo con tu familia para que todos vean dónde están durante una emergencia.",
  },
];

const { width: SCREEN_W } = Dimensions.get("window");

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  // Fade entre slides: más calmado que un swipe horizontal para el
  // contexto de "app de emergencia". El usuario asimila el mensaje
  // sin sentir que está en un carrusel comercial.
  const fade = useRef(new Animated.Value(1)).current;

  const goTo = (next: number) => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      setIndex(next);
      Animated.timing(fade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = async () => {
    if (index < SLIDES.length - 1) {
      goTo(index + 1);
    } else {
      // Último slide: marcamos done por-usuario y navegamos a Home.
      if (user?.uid) await markOnboardingSeen(user.uid);
      router.replace("/");
    }
  };

  const handleSkip = async () => {
    if (user?.uid) await markOnboardingSeen(user.uid);
    router.replace("/");
  };

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }} />
        {!isLast && (
          <TouchableOpacity
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel="Saltar introducción"
          >
            <Text style={styles.skip}>Saltar</Text>
          </TouchableOpacity>
        )}
      </View>

      <Animated.View style={[styles.body, { opacity: fade }]}>
        <View style={[styles.iconCircle, { backgroundColor: slide.iconBg }]}>
          <MaterialIcons name={slide.icon} size={48} color={slide.iconColor} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.bodyText}>{slide.body}</Text>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === index && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.cta}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Empezar a usar la app" : "Siguiente"}
        >
          <Text style={styles.ctaText}>
            {isLast ? "Empezar" : "Siguiente"}
          </Text>
          <MaterialIcons
            name={isLast ? "check" : "arrow-forward"}
            size={20}
            color="#ffffff"
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  topRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  skip: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
    padding: 8,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  bodyText: {
    fontSize: 15,
    color: "#475569",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: SCREEN_W * 0.85,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
  },
  dotActive: {
    width: 24,
    backgroundColor: "#dc2626",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  ctaText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
