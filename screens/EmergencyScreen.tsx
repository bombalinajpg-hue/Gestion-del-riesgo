/**
 * EmergencyScreen — Pantalla de coordinación durante/después de una
 * emergencia activa.
 *
 * El cálculo de ruta de evacuación vive en el CTA "Evacua" del Home
 * (HomeScreen.tsx) — no se duplica acá. Esta pantalla está pensada para
 * lo que viene inmediatamente después: llamar servicios, compartir mi
 * estado, coordinar con familia, reportar desaparecidos. Todos los
 * botones son grandes para uso en pánico sin profundidad.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
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
import MissingPersonsModal from "../components/MissingPersonsModal";
import SafetyStatusModal from "../components/SafetyStatusModal";

export default function EmergencyScreen() {
  const router = useRouter();
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);

  const call = (num: string, label: string) =>
    Alert.alert(`Llamar a ${label}`, `¿Deseas llamar al ${num}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Llamar", onPress: () => Linking.openURL(`tel:${num}`) },
    ]);

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
          <Text style={styles.headerTitle}>Durante la Emergencia</Text>
          <Text style={styles.headerSubtitle}>Acciones rápidas</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Llamar 123 destacado */}
        <TouchableOpacity
          style={styles.bigCallCard}
          onPress={() => call("123", "línea de emergencias 123")}
          activeOpacity={0.85}
          accessibilityLabel="Llamar a la línea de emergencia 123"
          accessibilityRole="button"
          accessibilityHint="Abre el marcador telefónico con el número 123"
        >
          <MaterialIcons name="phone" size={40} color="#fff" />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.bigCallTitle}>Llamar 123</Text>
            <Text style={styles.bigCallSubtitle}>
              Línea única de emergencias
            </Text>
          </View>
        </TouchableOpacity>

        {/* Atajo al CTA "Evacua" del Home — referencia visible para que
            el usuario que entre acá por equivocación sepa dónde vive el
            cálculo de ruta sin tener que volver y buscarlo. */}
        <TouchableOpacity
          style={[styles.actionCard, { borderLeftColor: "#dc2626" }]}
          onPress={() => router.push("/" as const)}
          activeOpacity={0.8}
          accessibilityRole="link"
          accessibilityLabel="Ir al botón Evacua en la pantalla de inicio"
        >
          <View style={[styles.actionIcon, { backgroundColor: "#fee2e2" }]}>
            <MaterialIcons name="directions-run" size={26} color="#dc2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>¿Necesitas evacuar?</Text>
            <Text style={styles.actionSubtitle}>
              Usa el botón "Evacua" en el inicio
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
        </TouchableOpacity>

        {/* Compartir mi estado */}
        <TouchableOpacity
          style={[styles.actionCard, { borderLeftColor: "#10b981" }]}
          onPress={() => setSafetyOpen(true)}
          activeOpacity={0.8}
        >
          <View
            style={[styles.actionIcon, { backgroundColor: "#d1fae5" }]}
          >
            <MaterialIcons name="shield" size={26} color="#10b981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Compartir mi estado</Text>
            <Text style={styles.actionSubtitle}>
              A salvo · Evacuando · Necesito ayuda
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
        </TouchableOpacity>

        {/* Ver grupo familiar */}
        <TouchableOpacity
          style={[styles.actionCard, { borderLeftColor: "#7c3aed" }]}
          onPress={() => setFamilyOpen(true)}
          activeOpacity={0.8}
        >
          <View
            style={[styles.actionIcon, { backgroundColor: "#ede9fe" }]}
          >
            <MaterialIcons name="group" size={26} color="#7c3aed" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Ver ubicación de familia</Text>
            <Text style={styles.actionSubtitle}>
              Coordina con tu grupo familiar
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
        </TouchableOpacity>

        {/* Reportar desaparecido */}
        <TouchableOpacity
          style={[styles.actionCard, { borderLeftColor: "#db2777" }]}
          onPress={() => setMissingOpen(true)}
          activeOpacity={0.8}
        >
          <View
            style={[styles.actionIcon, { backgroundColor: "#fce7f3" }]}
          >
            <MaterialIcons name="person-search" size={26} color="#db2777" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Reportar desaparición</Text>
            <Text style={styles.actionSubtitle}>
              Si alguien falta tras la emergencia
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
        </TouchableOpacity>

        {/* Sección de números útiles */}
        <Text style={styles.sectionTitle}>Otros números útiles</Text>

        <View style={styles.phoneGrid}>
          <TouchableOpacity
            style={styles.phoneCard}
            onPress={() => call("132", "Cruz Roja")}
          >
            <Text style={styles.phoneEmoji}>🚑</Text>
            <Text style={styles.phoneLabel}>Cruz Roja</Text>
            <Text style={styles.phoneNum}>132</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.phoneCard}
            onPress={() => call("119", "Bomberos")}
          >
            <Text style={styles.phoneEmoji}>🚒</Text>
            <Text style={styles.phoneLabel}>Bomberos</Text>
            <Text style={styles.phoneNum}>119</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.phoneCard}
            onPress={() => call("144", "Defensa Civil")}
          >
            <Text style={styles.phoneEmoji}>🛡️</Text>
            <Text style={styles.phoneLabel}>Defensa Civil</Text>
            <Text style={styles.phoneNum}>144</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.phoneCard}
            onPress={() => call("112", "Policía")}
          >
            <Text style={styles.phoneEmoji}>👮</Text>
            <Text style={styles.phoneLabel}>Policía</Text>
            <Text style={styles.phoneNum}>112</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <MaterialIcons name="info-outline" size={16} color="#b45309" />
          <Text style={styles.infoText}>
            Si estás en peligro inmediato, llama al 123. Los otros números
            son específicos pero el 123 conecta con todos los servicios.
          </Text>
        </View>
      </ScrollView>

      {/* Modales */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fef2f2" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#b91c1c",
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
  headerSubtitle: { color: "#fecaca", fontSize: 11, marginTop: 1 },
  content: { padding: 16, paddingBottom: 32 },
  bigCallCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dc2626",
    padding: 20,
    borderRadius: 20,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  bigCallTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  bigCallSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    marginTop: 3,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginTop: 10,
    borderLeftWidth: 4,
    gap: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  actionTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  actionSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  phoneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  phoneCard: {
    width: "48%",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  phoneEmoji: { fontSize: 28 },
  phoneLabel: { fontSize: 12, color: "#64748b", marginTop: 4 },
  phoneNum: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 2,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#fef3c7",
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  infoText: { fontSize: 11, color: "#78350f", flex: 1, lineHeight: 16 },
});
