/**
 * Flecha de norte rotatoria — gira según el `heading` del GPS (grados
 * desde el norte verdadero, 0 = norte, 90 = este, etc.).
 *
 * Antes vivía anidada dentro de MapTopControls. Se extrajo para que
 * el Visor la reuse sin duplicar el markup (paridad con Evacua).
 */

import { StyleSheet, Text, View } from "react-native";

export default function NorthArrow({ heading }: { heading: number }) {
  return (
    <View
      style={{
        transform: [{ rotate: `-${heading}deg` }],
        alignItems: "center",
      }}
    >
      <Text style={styles.letterN}>N</Text>
      <View style={styles.arrowContainer}>
        <View style={styles.triBottomLeft} />
        <View style={styles.triBottomRight} />
        <View style={styles.triTopLeft} />
        <View style={styles.triTopRight} />
      </View>
      <View style={{ height: 26 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  letterN: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ef476f",
    marginBottom: 1,
  },
  arrowContainer: { width: 0, height: 0, alignItems: "center" },
  triBottomLeft: {
    width: 0, height: 0,
    borderLeftWidth: 7, borderRightWidth: 0, borderBottomWidth: 13,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "#073b4c",
    position: "absolute", left: -7, top: 0,
  },
  triBottomRight: {
    width: 0, height: 0,
    borderLeftWidth: 0, borderRightWidth: 7, borderBottomWidth: 13,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "#ef476f",
    position: "absolute", left: 0, top: 0,
  },
  triTopLeft: {
    width: 0, height: 0,
    borderLeftWidth: 7, borderRightWidth: 0, borderTopWidth: 13,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderTopColor: "#ffffff",
    position: "absolute", left: -7, top: 13,
  },
  triTopRight: {
    width: 0, height: 0,
    borderLeftWidth: 0, borderRightWidth: 7, borderTopWidth: 13,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderTopColor: "#e0e0e0",
    position: "absolute", left: 0, top: 13,
  },
});
