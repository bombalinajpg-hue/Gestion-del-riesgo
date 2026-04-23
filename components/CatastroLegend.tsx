/**
 * Leyenda flotante que se muestra cuando alguna capa catastral está activa.
 * Se posiciona en la esquina inferior-izquierda del mapa y solo muestra
 * las secciones correspondientes a las capas visibles (evita saturar UI).
 *
 * Incluye:
 *  · Leyenda por nivel de riesgo (Alta / Media / Baja) cuando hay elementos
 *    expuestos o predios visibles.
 *  · Leyenda de rangos de pendiente (5 colores) cuando esa capa está activa.
 *
 * Los colores coinciden con los de `src/utils/catastroLayers.ts`.
 */

import { StyleSheet, Text, View } from "react-native";

interface Props {
  showElementos: boolean;
  showPredios: boolean;
  showPendiente: boolean;
}

// Colores sincronizados con src/utils/catastroLayers.ts (fill color base).
const NIVEL_COLORES = {
  Alta: "#d32f2f",
  Media: "#ef6c00",
  Baja: "#f9a825",
};

const PENDIENTE_ITEMS: { label: string; color: string }[] = [
  { label: "0° – 8.5°", color: "#4caf50" },
  { label: "8.5° – 16.5°", color: "#ffeb3b" },
  { label: "16.5° – 26.6°", color: "#ff9800" },
  { label: "26.6° – 45°", color: "#f44336" },
  { label: "Más de 45°", color: "#7b1fa2" },
];

export default function CatastroLegend({
  showElementos,
  showPredios,
  showPendiente,
}: Props) {
  const mostrarNivel = showElementos || showPredios;
  if (!mostrarNivel && !showPendiente) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {mostrarNivel && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {showElementos && showPredios
              ? "Nivel de amenaza / riesgo"
              : showElementos
                ? "Nivel de amenaza"
                : "Nivel de riesgo"}
          </Text>
          <LegendRow color={NIVEL_COLORES.Alta} label="Alta" />
          <LegendRow color={NIVEL_COLORES.Media} label="Media" />
          <LegendRow color={NIVEL_COLORES.Baja} label="Baja" />
        </View>
      )}

      {showPendiente && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pendiente del terreno</Text>
          {PENDIENTE_ITEMS.map((it) => (
            <LegendRow key={it.label} color={it.color} label={it.label} />
          ))}
        </View>
      )}
    </View>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    bottom: 100,
    zIndex: 15,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    maxWidth: 220,
    minWidth: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 6,
  },
  section: {
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 10,
    color: "#475569",
    fontWeight: "600",
    marginBottom: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 1.5,
  },
  swatch: {
    width: 14,
    height: 10,
    borderRadius: 2,
    marginRight: 6,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.2)",
  },
  label: {
    fontSize: 10,
    color: "#334155",
    flexShrink: 1,
    flex: 1,
  },
});
