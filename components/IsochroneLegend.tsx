/**
 * Leyenda de isócronas — rediseñada como pill compacto horizontal.
 *
 * Versión anterior (tarjeta vertical blanca 5-filas) ocupaba casi un
 * cuadrante del mapa y competía visualmente con el heatmap. Esta pasa
 * a una barra delgada con una franja de gradiente + etiquetas de
 * tiempo, que comunica el mismo rango con mucho menos espacio.
 *
 * Colores coinciden con las BANDS de IsochroneOverlay.tsx.
 */

import { StyleSheet, Text, View } from "react-native";

const BANDS = [
  { label: "3", color: "#10b981" },   // verde
  { label: "6", color: "#84cc16" },   // lima
  { label: "10", color: "#eab308" },  // amarillo
  { label: "15", color: "#f97316" },  // naranja
  { label: "+", color: "#dc2626" },   // rojo (más de 15)
] as const;

export default function IsochroneLegend() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>min al punto de encuentro</Text>
      <View style={styles.row}>
        {BANDS.map((b) => (
          <View key={b.label} style={styles.item}>
            <View style={[styles.swatch, { backgroundColor: b.color }]} />
            <Text style={styles.label}>{b.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Transparente para que el mapa respire debajo de la leyenda —
    // antes era casi opaca y tapaba los polígonos de amenaza junto al
    // borde izquierdo. Mantenemos el texto legible con contraste
    // fuerte + shadow.
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
    alignItems: "center",
  },
  title: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-end",
  },
  item: { alignItems: "center" },
  swatch: {
    width: 16,
    height: 10,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
  },
  label: {
    fontSize: 10,
    color: "#0f172a",
    fontWeight: "700",
    marginTop: 2,
    minWidth: 14,
    textAlign: "center",
  },
});
