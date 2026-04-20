/**
 * PrepareScreen — Preparación preventiva.
 *
 * Agrupa lo que el ciudadano debe hacer ANTES de que pase algo:
 *   - Kit de emergencia 72h (existente)
 *   - Plan familiar (grupo + puntos de encuentro pactados)
 *   - Documentos importantes (contactos clave)
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FamilyGroupModal from "../components/FamilyGroupModal";
import PreparednessModal from "../components/PreparednessModal";
import { getAllGroups } from "../src/services/familyGroupsService";
import {
  getProgress as getPreparednessProgress,
  loadPreparedness,
} from "../src/services/preparednessService";

export default function PrepareScreen() {
  const router = useRouter();
  const [kitOpen, setKitOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [prepPct, setPrepPct] = useState(0);
  const [prepCount, setPrepCount] = useState({ checked: 0, total: 18 });
  const [groups, setGroups] = useState(0);

  const refresh = async () => {
    try {
      const prep = await loadPreparedness();
      const progress = getPreparednessProgress(prep);
      setPrepPct(progress.percent);
      setPrepCount({ checked: progress.checked, total: progress.total });
      setGroups((await getAllGroups()).length);
    } catch (e) {
      console.warn("[PrepareScreen] refresh:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, []),
  );

  const kitColor =
    prepPct >= 1 ? "#059669" : prepPct >= 0.5 ? "#eab308" : "#dc2626";

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
          <Text style={styles.headerTitle}>Prepárate</Text>
          <Text style={styles.headerSubtitle}>
            Lo que debes hacer ANTES de una emergencia
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Progreso general */}
        <View style={styles.progressHero}>
          <Text style={styles.progressLabel}>Tu nivel de preparación</Text>
          <Text style={[styles.progressValue, { color: kitColor }]}>
            {Math.round(prepPct * 100)}%
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${prepPct * 100}%`, backgroundColor: kitColor },
              ]}
            />
          </View>
          <Text style={styles.progressHint}>
            {prepPct >= 1
              ? "Kit listo ✓ · Revisa cada 6 meses"
              : "Completa tu kit de emergencia"}
          </Text>
        </View>

        {/* Kit 72h */}
        <TouchableOpacity
          style={styles.bigCard}
          onPress={() => setKitOpen(true)}
          activeOpacity={0.85}
        >
          <View style={[styles.bigCardIcon, { backgroundColor: "#0369a1" }]}>
            <MaterialIcons name="backpack" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigCardTitle}>Kit de emergencia 72h</Text>
            <Text style={styles.bigCardSub}>
              Agua, alimentos, documentos, linterna, medicamentos
            </Text>
            <View style={styles.miniBar}>
              <View
                style={[
                  styles.miniBarFill,
                  {
                    width: `${prepPct * 100}%`,
                    backgroundColor: kitColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.miniCount}>
              {prepCount.checked}/{prepCount.total} items
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
        </TouchableOpacity>

        {/* Plan familiar */}
        <TouchableOpacity
          style={styles.bigCard}
          onPress={() => setFamilyOpen(true)}
          activeOpacity={0.85}
        >
          <View style={[styles.bigCardIcon, { backgroundColor: "#7c3aed" }]}>
            <MaterialIcons name="family-restroom" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigCardTitle}>Plan familiar</Text>
            <Text style={styles.bigCardSub}>
              Grupo compartido · ubicaciones · protocolos de reunión
            </Text>
            <View style={styles.statusPill}>
              <MaterialIcons
                name={groups > 0 ? "check-circle" : "add-circle-outline"}
                size={14}
                color={groups > 0 ? "#059669" : "#dc2626"}
              />
              <Text
                style={[
                  styles.statusPillText,
                  { color: groups > 0 ? "#059669" : "#dc2626" },
                ]}
              >
                {groups > 0
                  ? `${groups} grupo${groups !== 1 ? "s" : ""} configurado${groups !== 1 ? "s" : ""}`
                  : "Sin plan familiar"}
              </Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
        </TouchableOpacity>

        {/* Checklist de preparación general */}
        <Text style={styles.sectionTitle}>Lista de verificación</Text>
        <View style={styles.checklistCard}>
          <ChecklistItem
            done={prepPct === 1}
            text="Kit de emergencia 72h completo"
          />
          <ChecklistItem
            done={groups > 0}
            text="Grupo familiar creado"
          />
          <ChecklistItem
            done={false}
            text="Puntos de encuentro identificados (en la app)"
          />
          <ChecklistItem
            done={false}
            text="Capacitación completada (revisa módulo Capacitación)"
          />
          <ChecklistItem
            done={false}
            text="Números de emergencia guardados en tu contacto"
          />
        </View>

        <View style={styles.infoBox}>
          <MaterialIcons name="info-outline" size={18} color="#0369a1" />
          <Text style={styles.infoText}>
            La preparación es la mejor prevención. Revisa tu kit cada 6
            meses para asegurar que agua, alimentos y medicamentos no estén
            vencidos.
          </Text>
        </View>
      </ScrollView>

      <PreparednessModal
        visible={kitOpen}
        onClose={() => {
          setKitOpen(false);
          refresh();
        }}
      />
      <FamilyGroupModal
        visible={familyOpen}
        onClose={() => {
          setFamilyOpen(false);
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

function ChecklistItem({ done, text }: { done: boolean; text: string }) {
  return (
    <View style={styles.checklistRow}>
      <MaterialIcons
        name={done ? "check-circle" : "radio-button-unchecked"}
        size={20}
        color={done ? "#059669" : "#cbd5e1"}
      />
      <Text
        style={[
          styles.checklistText,
          done && { textDecorationLine: "line-through", color: "#64748b" },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0f9ff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#0369a1",
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
  headerSubtitle: { color: "#bae6fd", fontSize: 11, marginTop: 1 },
  content: { padding: 16, paddingBottom: 32 },
  progressHero: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 18,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0f2fe",
  },
  progressLabel: { fontSize: 12, color: "#64748b", fontWeight: "600" },
  progressValue: {
    fontSize: 44,
    fontWeight: "900",
    marginVertical: 4,
    letterSpacing: -1,
  },
  progressBar: {
    width: "100%",
    height: 10,
    backgroundColor: "#e2e8f0",
    borderRadius: 5,
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: { height: "100%", borderRadius: 5 },
  progressHint: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 8,
    fontStyle: "italic",
  },
  bigCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  bigCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  bigCardTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  bigCardSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 16,
  },
  miniBar: {
    height: 5,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    marginTop: 8,
    overflow: "hidden",
  },
  miniBarFill: { height: "100%", borderRadius: 3 },
  miniCount: { fontSize: 10, color: "#64748b", marginTop: 3 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  statusPillText: { fontSize: 11, fontWeight: "600" },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 20,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  checklistCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  checklistText: { fontSize: 13, color: "#0f172a", flex: 1 },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#dbeafe",
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
    gap: 10,
  },
  infoText: { fontSize: 11, color: "#1e3a8a", flex: 1, lineHeight: 16 },
});
