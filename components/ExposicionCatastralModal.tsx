/**
 * Modal que muestra la exposición catastral por tipo de emergencia.
 *
 * Cifras pre-calculadas offline (ver scripts/calc-exposicion-catastral.js)
 * a partir del cruce espacial entre las capas de Riesgo del EDAVR
 * ALDESARROLLO (2025) y VulnerabilidadEdificaciones. Los valores vienen
 * directo del avalúo catastral oficial, sin simulación.
 *
 * Implementa el objetivo 1 (análisis de condiciones territoriales) y
 * aporta la materia de Avalúos Masivos del perfil de Ingeniería Catastral
 * y Geodesia.
 */

import { MaterialIcons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import type { EmergencyType } from "../src/types/graph";

interface NivelStats {
  numEdificaciones: number;
  valorCatastralCOP: number;
  valorMercadoCOP: number;
  valorPorM2PromCOP: number;
  areaConstruidaM2: number;
  areaTerrenoM2: number;
  poblacionOcupacionMax: number;
  niños: number;
  adultosMayores: number;
  personasConDiscapacidad: number;
  poblacionVulnerable: number;
}

interface EmergenciaStats {
  matchedFeatures: number;
  totalFeaturesRiesgo: number;
  porNivel: { Alta: NivelStats; Media: NivelStats; Baja: NivelStats };
  total: NivelStats;
}

interface ExposicionData {
  generadoEn: string;
  fuente: string;
  escala: string;
  datumOriginal: string;
  porEmergencia: Record<string, EmergenciaStats>;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  data: ExposicionData;
  emergencyType: EmergencyType;
}

function formatCOP(n: number): string {
  if (n >= 1_000_000_000) return `COP ${(n / 1_000_000_000).toFixed(2)} mil M`;
  if (n >= 1_000_000) return `COP ${(n / 1_000_000).toFixed(1)} M`;
  return `COP ${n.toLocaleString("es-CO")}`;
}

const EMERGENCIA_LABELS: Record<string, string> = {
  inundacion: "Inundación",
  avenida_torrencial: "Avenida torrencial",
  movimiento_en_masa: "Movimiento en masa",
};

export default function ExposicionCatastralModal({
  visible,
  onClose,
  data,
  emergencyType,
}: Props) {
  // Si hay emergencia activa, mostrar esa; si no, mostrar las 3.
  const emergenciasAMostrar: string[] =
    emergencyType !== "ninguna" && data.porEmergencia[emergencyType]
      ? [emergencyType]
      : ["avenida_torrencial", "movimiento_en_masa", "inundacion"];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <View style={styles.header}>
                <Text style={styles.title}>Cuantificación del riesgo</Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <MaterialIcons name="close" size={22} color="#475569" />
                </Pressable>
              </View>
              <Text style={styles.fuenteLine}>
                Fuente: {data.fuente}
              </Text>
              <Text style={styles.metaLine}>
                Escala {data.escala} · Datum original: {data.datumOriginal}
              </Text>

              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {emergenciasAMostrar.map((key) => {
                  const stats = data.porEmergencia[key];
                  if (!stats) return null;
                  return (
                    <EmergenciaCard
                      key={key}
                      nombre={EMERGENCIA_LABELS[key] || key}
                      stats={stats}
                    />
                  );
                })}

                <Text style={styles.footerNote}>
                  Cifras derivadas del cruce espacial entre capas de Riesgo y
                  Vulnerabilidad de Edificaciones del EDAVR (Decreto 1807/2014).
                  Los valores catastrales y de mercado corresponden al inventario
                  predial oficial levantado por ALDESARROLLO.
                </Text>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function EmergenciaCard({
  nombre,
  stats,
}: {
  nombre: string;
  stats: EmergenciaStats;
}) {
  const t = stats.total;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{nombre}</Text>

      <View style={styles.bigRow}>
        <Metric label="Edificaciones" value={String(t.numEdificaciones)} />
        <Metric label="Personas" value={String(t.poblacionOcupacionMax)} />
        <Metric
          label="Vulnerables"
          value={String(t.poblacionVulnerable)}
          hint={`${t.niños} niños · ${t.adultosMayores} mayores · ${t.personasConDiscapacidad} discap.`}
        />
      </View>

      <View style={styles.valoresBox}>
        <ValorLine label="Valor catastral" value={formatCOP(t.valorCatastralCOP)} />
        <ValorLine label="Valor de mercado" value={formatCOP(t.valorMercadoCOP)} />
        <ValorLine
          label="Valor promedio por m²"
          value={formatCOP(t.valorPorM2PromCOP)}
        />
        <ValorLine
          label="Área construida total"
          value={`${t.areaConstruidaM2.toLocaleString("es-CO")} m²`}
        />
      </View>

      <Text style={styles.nivelHeader}>Desglose por nivel de riesgo</Text>
      <NivelRow label="Alta" stats={stats.porNivel.Alta} color="#dc2626" />
      <NivelRow label="Media" stats={stats.porNivel.Media} color="#ea580c" />
      <NivelRow label="Baja" stats={stats.porNivel.Baja} color="#ca8a04" />

      <Text style={styles.matchNote}>
        {stats.matchedFeatures} / {stats.totalFeaturesRiesgo} unidades de riesgo
        con inventario predial asociado
      </Text>
    </View>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.metricLabel} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      {hint && (
        <Text style={styles.metricHint} numberOfLines={2}>
          {hint}
        </Text>
      )}
    </View>
  );
}

function ValorLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.valorLine}>
      <Text style={styles.valorLabel}>{label}</Text>
      <Text style={styles.valorValue}>{value}</Text>
    </View>
  );
}

function NivelRow({
  label,
  stats,
  color,
}: {
  label: string;
  stats: NivelStats;
  color: string;
}) {
  if (stats.numEdificaciones === 0) {
    return (
      <View style={styles.nivelRow}>
        <View style={[styles.nivelDot, { backgroundColor: color + "33" }]} />
        <Text style={styles.nivelLabel}>{label}</Text>
        <Text style={styles.nivelEmpty}>sin exposición</Text>
      </View>
    );
  }
  return (
    <View style={styles.nivelRow}>
      <View style={[styles.nivelDot, { backgroundColor: color }]} />
      <Text style={styles.nivelLabel}>{label}</Text>
      <Text style={styles.nivelValue}>
        {stats.numEdificaciones} edif · {formatCOP(stats.valorCatastralCOP)} ·{" "}
        {stats.poblacionOcupacionMax} pers
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 20,
    maxHeight: "88%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#cbd5e1",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  fuenteLine: { fontSize: 11, color: "#475569", marginTop: 4 },
  metaLine: { fontSize: 10, color: "#64748b", marginTop: 1, marginBottom: 10 },
  // `flexShrink: 1` en vez de `flex: 1` porque el sheet padre solo tiene
  // `maxHeight`, no una altura fija. Con `flex: 1`, el ScrollView
  // intentaba ocupar "todo el espacio restante" de un padre que se
  // dimensiona al contenido → quedaba en altura 0 y las EmergenciaCard
  // desaparecían. Con `flexShrink: 1`, el ScrollView se encoge si el
  // contenido excede el maxHeight y activa scroll correctamente.
  scroll: { flexShrink: 1 },
  card: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  bigRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  metric: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  metricValue: { fontSize: 22, fontWeight: "800", color: "#0f766e" },
  metricLabel: {
    fontSize: 11,
    color: "#475569",
    marginTop: 2,
    textAlign: "center",
  },
  metricHint: {
    fontSize: 9,
    color: "#94a3b8",
    marginTop: 2,
    textAlign: "center",
    lineHeight: 12,
  },
  valoresBox: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  valorLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  valorLabel: { fontSize: 12, color: "#475569" },
  valorValue: { fontSize: 13, color: "#0f172a", fontWeight: "600" },
  nivelHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 4,
  },
  nivelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  nivelDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  nivelLabel: { fontSize: 12, fontWeight: "600", color: "#0f172a", width: 55 },
  nivelValue: { fontSize: 11, color: "#475569", flex: 1 },
  nivelEmpty: { fontSize: 11, color: "#94a3b8", fontStyle: "italic", flex: 1 },
  matchNote: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 8,
    fontStyle: "italic",
  },
  footerNote: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 8,
    marginBottom: 8,
    lineHeight: 16,
  },
});
