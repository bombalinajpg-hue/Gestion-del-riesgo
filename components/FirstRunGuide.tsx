/**
 * Tour interactivo de primera ejecución.
 *
 * Al arrancar el Home por primera vez tras el login, muestra un stepper
 * modal con 5 slides que presentan las secciones clave de EvacuApp:
 * Inicio, Visor, Cuenta, flujo Evacua y líneas de emergencia. Se
 * persiste con AsyncStorage por user para que cada cuenta vea el tour
 * una sola vez.
 *
 * Implementado sin librerías externas (`react-native-copilot`,
 * `rn-tourguide`) para no tocar `package.json` antes del próximo build
 * EAS. Si más adelante se quiere spotlight real sobre elementos
 * específicos, la firma del componente se mantiene y se puede cambiar
 * internamente.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];

interface Step {
  icon: MaterialIconName;
  color: string;
  bg: string;
  title: string;
  body: string;
  hint: string;
}

const STEPS: Step[] = [
  {
    icon: "home",
    color: "#0f766e",
    bg: "#ccfbf1",
    title: "Inicio",
    body:
      "Es tu tablero principal. Aquí encuentras el botón rojo 'Evacua' para calcular una ruta, herramientas rápidas durante una emergencia (estado, familia, desaparecidos, reportar) y las líneas de emergencia.",
    hint: "Toca 'Evacua' cuando quieras iniciar el flujo de evacuación.",
  },
  {
    icon: "layers",
    color: "#4338ca",
    bg: "#e0e7ff",
    title: "Visor geográfico",
    body:
      "Explora libremente el mapa de Santa Rosa con capas de riesgo, vulnerabilidad y puntos de encuentro. Toca un pin para calcular ruta directa a ese destino.",
    hint: "Cambia al tab 'Visor' en el menú inferior para abrirlo.",
  },
  {
    icon: "person",
    color: "#b91c1c",
    bg: "#fee2e2",
    title: "Cuenta",
    body:
      "Aquí ves tus datos de sesión, información del estudio y puedes cerrar sesión. Entra desde el tab 'Cuenta' en el menú inferior.",
    hint: "Cerrar sesión borra el estado local; tendrás que iniciar de nuevo.",
  },
  {
    icon: "directions-run",
    color: "#dc2626",
    bg: "#fee2e2",
    title: "Flujo Evacua",
    body:
      "Tres preguntas cortas: qué emergencia, desde dónde sales y a qué destino. Los valores por defecto son GPS + punto de encuentro más cercano, así con un solo toque extra ya puedes empezar.",
    hint: "Dos taps y estás en camino.",
  },
  {
    icon: "phone",
    color: "#dc2626",
    bg: "#fee2e2",
    title: "Líneas de emergencia",
    body:
      "Al final del Home encuentras el 123, Bomberos, Defensa Civil y Cruz Roja. Toca cualquier tarjeta y se abre el marcador con el número.",
    hint: "Úsalas si necesitas apoyo humano inmediato.",
  },
];

const STORAGE_KEY = "firstRunGuideSeen";

function keyFor(uid: string | null | undefined) {
  return uid ? `${STORAGE_KEY}:${uid}` : STORAGE_KEY;
}

export async function hasSeenFirstRunGuide(uid: string | null | undefined): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(keyFor(uid));
    return v === "1";
  } catch {
    return false;
  }
}

export async function markFirstRunGuideSeen(uid: string | null | undefined): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(uid), "1");
  } catch {}
}

interface Props {
  /** UID del usuario logueado; si es null se usa key global (fallback). */
  userUid: string | null | undefined;
  /** Externo: si es false, no renderiza. Útil para demorar el check hasta
   *  que `hasSeenFirstRunGuide` resuelva. */
  visible: boolean;
  onClose: () => void;
}

export default function FirstRunGuide({ userUid, visible, onClose }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  if (!visible) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = async () => {
    await markFirstRunGuideSeen(userUid);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <Pressable style={styles.backdrop} onPress={finish}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={[styles.iconWrap, { backgroundColor: current.bg }]}>
            <MaterialIcons name={current.icon} size={36} color={current.color} />
          </View>
          <Text style={styles.badge}>
            Paso {step + 1} de {STEPS.length}
          </Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>
          <View style={styles.hintBox}>
            <MaterialIcons name="lightbulb-outline" size={16} color="#b45309" />
            <Text style={styles.hintText}>{current.hint}</Text>
          </View>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && styles.dotActive,
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={finish} style={styles.skipBtn}>
              <Text style={styles.skipText}>Saltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => (isLast ? finish() : setStep((s) => s + 1))}
              style={[styles.primaryBtn, { backgroundColor: current.color }]}
            >
              <Text style={styles.primaryText}>
                {isLast ? "Empezar" : "Siguiente"}
              </Text>
              <MaterialIcons
                name={isLast ? "check" : "arrow-forward"}
                size={18}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const { width: SW } = Dimensions.get("window");

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: Math.min(SW - 40, 420),
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  badge: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: "#334155",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
  hintBox: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: "#92400e",
    fontWeight: "600",
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
  },
  dotActive: {
    backgroundColor: "#0f766e",
    width: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    alignSelf: "stretch",
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  skipText: {
    color: "#64748b",
    fontWeight: "700",
    fontSize: 14,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
