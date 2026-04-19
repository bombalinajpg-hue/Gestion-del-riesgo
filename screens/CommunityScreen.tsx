/**
 * CommunityScreen — Participación ciudadana.
 *
 * Agrupa las 3 funcionalidades donde el usuario aporta/pide
 * información a su comunidad: reportes, desaparecidos, grupo familiar.
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
import FamilyGroupModal from "../components/FamilyGroupModal";
import MissingPersonsModal from "../components/MissingPersonsModal";
import ReportModal from "../components/ReportModal";
import { getAllGroups } from "../src/services/familyGroupsService";
import { getActiveMissing } from "../src/services/missingPersonsService";
import {
  getActiveBlockingAlerts,
  recomputePublicAlerts,
} from "../src/services/reportsService";

export default function CommunityScreen() {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [missingCount, setMissingCount] = useState(0);
  const [groupCount, setGroupCount] = useState(0);

  const refresh = async () => {
    try {
      await recomputePublicAlerts();
      setAlertCount((await getActiveBlockingAlerts()).length);
      setMissingCount((await getActiveMissing()).length);
      setGroupCount((await getAllGroups()).length);
    } catch {}
  };

  useEffect(() => {
    refresh();
    // Re-carga al enfocar la pantalla
    return () => {};
  }, [navigation]);

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
          <Text style={styles.headerTitle}>Participación Ciudadana</Text>
          <Text style={styles.headerSubtitle}>
            Tu comunidad te ayuda · ayudas a tu comunidad
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Reportes */}
        <TouchableOpacity
          style={[styles.bigCard, { backgroundColor: "#fff7ed" }]}
          onPress={() => setReportOpen(true)}
          activeOpacity={0.85}
        >
          <View
            style={[styles.bigCardIcon, { backgroundColor: "#f97316" }]}
          >
            <MaterialIcons name="report" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigCardTitle}>Reportar una situación</Text>
            <Text style={styles.bigCardSub}>
              Bloqueos viales, inundación, deslizamientos, riesgos
            </Text>
            {alertCount > 0 && (
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.statPillText}>
                    {alertCount} alerta{alertCount !== 1 ? "s" : ""} activa
                    {alertCount !== 1 ? "s" : ""} cerca
                  </Text>
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Desaparecidos */}
        <TouchableOpacity
          style={[styles.bigCard, { backgroundColor: "#fdf2f8" }]}
          onPress={() => setMissingOpen(true)}
          activeOpacity={0.85}
        >
          <View
            style={[styles.bigCardIcon, { backgroundColor: "#db2777" }]}
          >
            <MaterialIcons name="person-search" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigCardTitle}>Personas desaparecidas</Text>
            <Text style={styles.bigCardSub}>
              Reporta y ayuda a encontrar familiares perdidos
            </Text>
            {missingCount > 0 && (
              <View style={styles.statsRow}>
                <View
                  style={[styles.statPill, { backgroundColor: "#fce7f3" }]}
                >
                  <Text
                    style={[styles.statPillText, { color: "#9d174d" }]}
                  >
                    {missingCount} reporte{missingCount !== 1 ? "s" : ""} activo
                    {missingCount !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Grupo familiar */}
        <TouchableOpacity
          style={[styles.bigCard, { backgroundColor: "#f5f3ff" }]}
          onPress={() => setFamilyOpen(true)}
          activeOpacity={0.85}
        >
          <View
            style={[styles.bigCardIcon, { backgroundColor: "#7c3aed" }]}
          >
            <MaterialIcons name="group" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigCardTitle}>Mi grupo familiar</Text>
            <Text style={styles.bigCardSub}>
              Código compartido para coordinar en emergencias
            </Text>
            <View style={styles.statsRow}>
              <View
                style={[
                  styles.statPill,
                  {
                    backgroundColor: groupCount > 0 ? "#d1fae5" : "#f3f4f6",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statPillText,
                    { color: groupCount > 0 ? "#065f46" : "#6b7280" },
                  ]}
                >
                  {groupCount > 0
                    ? `${groupCount} grupo${groupCount !== 1 ? "s" : ""} activo${groupCount !== 1 ? "s" : ""}`
                    : "Sin grupo · crea uno"}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Ver en el mapa */}
        <TouchableOpacity
          style={styles.mapShortcut}
          onPress={() => router.push("/map")}
          activeOpacity={0.8}
        >
          <MaterialIcons name="map" size={20} color="#0f766e" />
          <Text style={styles.mapShortcutText}>Ver todo en el mapa</Text>
          <MaterialIcons name="arrow-forward" size={18} color="#0f766e" />
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <MaterialIcons name="groups" size={18} color="#6b7280" />
          <Text style={styles.infoText}>
            La información que compartes aquí ayuda a otros ciudadanos a
            tomar mejores decisiones. Tus reportes son anónimos pero se
            vinculan a tu dispositivo para que puedas actualizarlos.
          </Text>
        </View>
      </ScrollView>

      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={refresh}
      />
      <FamilyGroupModal
        visible={familyOpen}
        onClose={() => {
          setFamilyOpen(false);
          refresh();
        }}
      />
      <MissingPersonsModal
        visible={missingOpen}
        onClose={() => {
          setMissingOpen(false);
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#faf5ff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#7c3aed",
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
  headerSubtitle: { color: "#ddd6fe", fontSize: 11, marginTop: 1 },
  content: { padding: 16, paddingBottom: 32 },
  bigCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  bigCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  bigCardTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  bigCardSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 16,
  },
  statsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fed7aa",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 5,
  },
  statPillText: { fontSize: 11, fontWeight: "600", color: "#7c2d12" },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#dc2626",
  },
  mapShortcut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "#ccfbf1",
    borderRadius: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#99f6e4",
  },
  mapShortcutText: { color: "#0f766e", fontWeight: "700", fontSize: 14 },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  infoText: { fontSize: 12, color: "#475569", flex: 1, lineHeight: 17 },
});
