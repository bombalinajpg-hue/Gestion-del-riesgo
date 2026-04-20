/**
 * Grupo de controles flotantes superior-derecho del mapa:
 *   · Cambiar tipo de mapa (abre picker)
 *   · WeatherBadge (auto-contenido)
 *   · Toggle de isócronas (con spinner mientras calcula)
 *   · Toggle "ver lugares" (refugios + instituciones)
 *   · Flecha de norte que rota según el heading del GPS
 *
 * Se movió acá desde MapViewContainer para aislar la botonera del resto
 * del contenedor, que ya era demasiado grande. La flecha de norte vive
 * también acá porque no se usa en ningún otro lado.
 */

import { MaterialIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import WeatherBadge from "./WeatherBadge";

function NorthArrow({ heading }: { heading: number }) {
  return (
    <View style={{ transform: [{ rotate: `-${heading}deg` }], alignItems: "center" }}>
      <Text style={{ fontSize: 9, fontWeight: "900", color: "#ef476f", marginBottom: 1 }}>N</Text>
      <View style={{ width: 0, height: 0, alignItems: "center" }}>
        <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 0, borderBottomWidth: 13, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#073b4c", position: "absolute", left: -7, top: 0 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 0, borderRightWidth: 7, borderBottomWidth: 13, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#ef476f", position: "absolute", left: 0, top: 0 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 0, borderTopWidth: 13, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#ffffff", position: "absolute", left: -7, top: 13 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 0, borderRightWidth: 7, borderTopWidth: 13, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#e0e0e0", position: "absolute", left: 0, top: 13 }} />
      </View>
      <View style={{ height: 26 }} />
    </View>
  );
}

interface Props {
  heading: number;
  showIsochroneOverlay: boolean;
  isoComputing: boolean;
  showLugares: boolean;
  onOpenMapTypePicker: () => void;
  onToggleIsochrones: () => void;
  onToggleLugares: () => void;
}

export default function MapTopControls({
  heading,
  showIsochroneOverlay,
  isoComputing,
  showLugares,
  onOpenMapTypePicker,
  onToggleIsochrones,
  onToggleLugares,
}: Props) {
  return (
    <View style={styles.group} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.squareButton}
        onPress={onOpenMapTypePicker}
        accessibilityLabel="Cambiar tipo de mapa"
      >
        <MaterialIcons name="layers" size={24} color="#073b4c" />
      </TouchableOpacity>
      <WeatherBadge />
      <TouchableOpacity
        style={[
          styles.squareButton,
          showIsochroneOverlay && { backgroundColor: "#10b981" },
          isoComputing && { backgroundColor: "#fef3c7" },
        ]}
        onPress={onToggleIsochrones}
        accessibilityLabel="Mostrar mapa de tiempo a seguridad"
      >
        {isoComputing ? (
          <ActivityIndicator size="small" color="#d97706" />
        ) : (
          <MaterialIcons name="timer" size={24} color={showIsochroneOverlay ? "#ffffff" : "#073b4c"} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.squareButton,
          showLugares && { backgroundColor: "#f59e0b" },
        ]}
        onPress={onToggleLugares}
        accessibilityLabel="Ver refugios e instituciones"
      >
        <MaterialIcons name="place" size={24} color={showLugares ? "#ffffff" : "#073b4c"} />
      </TouchableOpacity>
      <View style={styles.roundButton}>
        <NorthArrow heading={heading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { position: "absolute", top: 120, right: 20, zIndex: 10, gap: 8 },
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
