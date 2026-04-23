/**
 * Panel compacto de toggles para activar/desactivar las capas catastrales.
 * Se ancla en la parte inferior-izquierda del mapa, encima del botón 123.
 *
 * Tres switches:
 *   · Elementos expuestos (inventario ALDESARROLLO)
 *   · Predios por riesgo (cambia según emergencia activa)
 *   · Pendiente del terreno
 *
 * Diseño intencionalmente minimalista — no abrir un sheet ni un drawer
 * adicional; los toggles son de estado y se ven apenas el usuario abre
 * el panel con el FAB "🏛️" del mapa.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

interface Props {
  visible: boolean;
  showElementos: boolean;
  showPredios: boolean;
  showPendiente: boolean;
  showPuntosEncuentro?: boolean;
  showInstituciones?: boolean;
  onToggleElementos: (v: boolean) => void;
  onTogglePredios: (v: boolean) => void;
  onTogglePendiente: (v: boolean) => void;
  onTogglePuntosEncuentro?: (v: boolean) => void;
  onToggleInstituciones?: (v: boolean) => void;
  onOpenExposicion: () => void;
  onClose: () => void;
  /** Indica si hay emergencia activa (solo entonces Predios tiene contenido). */
  hasEmergencia: boolean;
}

export default function CatastroTogglesPanel({
  visible,
  showElementos,
  showPredios,
  showPendiente,
  showPuntosEncuentro,
  showInstituciones,
  onToggleElementos,
  onTogglePredios,
  onTogglePendiente,
  onTogglePuntosEncuentro,
  onToggleInstituciones,
  onOpenExposicion,
  onClose,
  hasEmergencia,
}: Props) {
  if (!visible) return null;
  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>Visor geográfico</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <MaterialIcons name="close" size={18} color="#475569" />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Fuente: Estudio detallado ALDESARROLLO (2025)
        </Text>

        <Row
          label="Elementos expuestos"
          hint="Edificaciones y lotes calificados por tipo de amenaza"
          value={showElementos}
          onChange={onToggleElementos}
        />
        <Row
          label="Predios por nivel de riesgo"
          hint={
            hasEmergencia
              ? "Clasificación por nivel según emergencia activa"
              : "Activa una emergencia para visualizar esta capa"
          }
          value={showPredios}
          onChange={onTogglePredios}
          disabled={!hasEmergencia}
        />
        <Row
          label="Pendiente del terreno"
          hint="Rangos de inclinación del modelo topográfico"
          value={showPendiente}
          onChange={onTogglePendiente}
        />
        {onTogglePuntosEncuentro && typeof showPuntosEncuentro === "boolean" && (
          <Row
            label="Puntos de encuentro"
            hint="Pines verdes — toca uno para calcular ruta"
            value={showPuntosEncuentro}
            onChange={onTogglePuntosEncuentro}
          />
        )}
        {onToggleInstituciones && typeof showInstituciones === "boolean" && (
          <Row
            label="Instituciones"
            hint="Hospitales, policía, bomberos, defensa civil"
            value={showInstituciones}
            onChange={onToggleInstituciones}
          />
        )}

        <Pressable style={styles.exposicionBtn} onPress={onOpenExposicion}>
          <MaterialIcons name="assessment" size={18} color="#0f766e" />
          <Text style={styles.exposicionBtnText}>
            Cuantificación del riesgo
          </Text>
          <MaterialIcons name="chevron-right" size={18} color="#0f766e" />
        </Pressable>
      </View>
    </View>
  );
}

function Row({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: "#cbd5e1", true: "#3b82f6" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 170,
    left: 16,
    right: 16,
    zIndex: 25,
    alignItems: "flex-start",
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: "100%",
    maxWidth: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#0f172a", fontSize: 15, fontWeight: "700" },
  subtitle: { color: "#64748b", fontSize: 11, marginTop: 2, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  rowText: { flex: 1, paddingRight: 10 },
  rowLabel: { color: "#0f172a", fontSize: 13, fontWeight: "600" },
  rowHint: { color: "#64748b", fontSize: 11, marginTop: 1 },
  exposicionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ccfbf1",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    gap: 8,
  },
  exposicionBtnText: {
    flex: 1,
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "600",
  },
});
