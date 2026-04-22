/**
 * Grupo de controles flotantes superior-derecho del mapa — versión
 * simplificada (v4.6). Ahora SOLO expone los 3 controles que tienen
 * sentido durante una evacuación en curso:
 *
 *   · Cambiar tipo de mapa (híbrido/satélite/estándar)
 *   · WeatherBadge (clima actual)
 *   · Flecha de norte (rota según heading del GPS)
 *
 * Los toggles que antes vivían acá (isócronas, "ver lugares") se
 * movieron al MapSettingsSheet, accesible por FAB cuando NO se está
 * evacuando. Mantener este stack mínimo durante una emergencia evita
 * que el usuario modifique accidentalmente capas mientras camina.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NorthArrow from "./NorthArrow";
import WeatherBadge from "./WeatherBadge";

interface Props {
  heading: number;
  onOpenMapTypePicker: () => void;
}

export default function MapTopControls({ heading, onOpenMapTypePicker }: Props) {
  const insets = useSafeAreaInsets();
  // Posición dinámica: insets.top + margen fijo. Antes era `top: 120`
  // estático, lo que en dispositivos con notch grande chocaba con la
  // barra de estado y en dispositivos sin notch dejaba hueco.
  return (
    <View
      style={[styles.group, { top: insets.top + 64 }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.squareButton}
        onPress={onOpenMapTypePicker}
        accessibilityLabel="Cambiar tipo de mapa"
      >
        <MaterialIcons name="layers" size={24} color="#073b4c" />
      </TouchableOpacity>
      <WeatherBadge />
      <View style={styles.roundButton}>
        <NorthArrow heading={heading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { position: "absolute", right: 20, zIndex: 10, gap: 8 },
  squareButton: {
    backgroundColor: "#ffffffee", width: 46, height: 46, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  roundButton: {
    backgroundColor: "#ffffffee", width: 46, height: 46, borderRadius: 23,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
});
