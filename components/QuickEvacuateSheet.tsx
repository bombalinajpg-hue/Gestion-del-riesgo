/**
 * Sheet de evacuación rápida — reemplaza la cadena de dos Alert.alert
 * (¿qué emergencia? → ¿desde dónde?) por un solo modal con ambas
 * preguntas visibles.
 *
 * Ventajas sobre los Alerts encadenados:
 *   · Sin latencia de dismissal/open entre pasos (~300-500 ms en iOS).
 *   · El usuario ve los 5 controles a la vez y puede cambiar de opinión
 *     en una decisión sin reiniciar (ej: cambiar emergencia tras elegir
 *     inicio).
 *   · Mayor accesibilidad: los labels viven en el mismo árbol, el
 *     screen reader lee todas las opciones en orden.
 *
 * Flujo de selección: el usuario toca una tarjeta de emergencia, luego
 * una tarjeta de inicio; cuando ambas están seleccionadas se habilita
 * el botón "Empezar". Si toca "Cancelar" o el backdrop, cierra sin
 * disparar nada.
 *
 * Las acciones concretas (navegar a /map con los params correctos) las
 * decide el caller — este componente solo reporta qué eligió el usuario.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { EmergencyType } from "../src/types/graph";

type HazardKey = Exclude<EmergencyType, "ninguna">;
export type StartSource = "gps" | "manual";

interface EmergencyOption {
  value: HazardKey;
  label: string;
  emoji: string;
  color: string;
  bg: string;
}

const EMERGENCIES: EmergencyOption[] = [
  { value: "inundacion", label: "Inundación", emoji: "🌊", color: "#1d4ed8", bg: "#dbeafe" },
  { value: "movimiento_en_masa", label: "Movimiento en masa", emoji: "⛰️", color: "#b45309", bg: "#fef3c7" },
  { value: "avenida_torrencial", label: "Avenida torrencial", emoji: "🌪️", color: "#b91c1c", bg: "#fee2e2" },
];

interface StartOption {
  value: StartSource;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  description: string;
}

const STARTS: StartOption[] = [
  { value: "gps", label: "Mi ubicación", icon: "my-location", description: "Usa el GPS ahora mismo" },
  { value: "manual", label: "Elegir en el mapa", icon: "touch-app", description: "Toca un punto tú" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (emergency: HazardKey, start: StartSource) => void;
}

export default function QuickEvacuateSheet({ visible, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [emergency, setEmergency] = useState<HazardKey | null>(null);
  const [start, setStart] = useState<StartSource | null>(null);

  // Al cerrar y reabrir, queremos estado limpio — si el usuario vio la
  // hoja a medio llenar y cerró, no debería encontrarla igual al volver.
  useEffect(() => {
    if (!visible) {
      setEmergency(null);
      setStart(null);
    }
  }, [visible]);

  const canConfirm = emergency !== null && start !== null;

  const handleConfirm = () => {
    if (emergency && start) {
      onConfirm(emergency, start);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* View con su propio responder: al tocar dentro, React Native
            asigna el responder a esta View y el Pressable del backdrop
            no recibe el touch — así no cierra al tocar dentro. */}
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <MaterialIcons name="directions-run" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Evacuación rápida</Text>
              <Text style={styles.subtitle}>
                Te llevamos al refugio más seguro y cercano
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>1. ¿Qué emergencia?</Text>
          <View style={styles.row}>
            {EMERGENCIES.map((opt) => {
              const selected = emergency === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.card,
                    { backgroundColor: opt.bg, borderColor: selected ? opt.color : "transparent" },
                  ]}
                  onPress={() => setEmergency(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                >
                  <Text style={styles.cardEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.cardLabel, { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>2. ¿Desde dónde sales?</Text>
          <View style={styles.row}>
            {STARTS.map((opt) => {
              const selected = start === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.startCard,
                    { borderColor: selected ? "#dc2626" : "#e5e7eb" },
                    selected && styles.startCardSelected,
                  ]}
                  onPress={() => setStart(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                >
                  <MaterialIcons
                    name={opt.icon}
                    size={24}
                    color={selected ? "#dc2626" : "#475569"}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.startLabel,
                        selected && { color: "#dc2626" },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.startDescription}>{opt.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.primary, !canConfirm && styles.primaryDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityLabel="Empezar evacuación"
            accessibilityState={{ disabled: !canConfirm }}
          >
            <MaterialIcons
              name="directions-run"
              size={20}
              color={canConfirm ? "#fff" : "#9ca3af"}
            />
            <Text
              style={[
                styles.primaryText,
                !canConfirm && { color: "#9ca3af" },
              ]}
            >
              Empezar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancel}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 18,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  card: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    gap: 6,
    minHeight: 80,
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 28 },
  cardLabel: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  startCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: "#fff",
  },
  startCardSelected: { backgroundColor: "#fef2f2" },
  startLabel: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  startDescription: { fontSize: 11, color: "#64748b", marginTop: 1 },
  primary: {
    marginTop: 20,
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryDisabled: {
    backgroundColor: "#e5e7eb",
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.3 },
  cancel: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
});
