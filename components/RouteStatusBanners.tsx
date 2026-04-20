/**
 * Stack de banners superiores del mapa: estado de la ruta (calculando,
 * sugerida, evacuando, riesgosa) + resumen distancia/tiempo + indicador
 * de "toca un refugio" en modo picking.
 *
 * Todos comparten la misma columna (`topBannersStack`) y se apilan con
 * gap vertical en vez de competir por el mismo `top`.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { DestinoFinal } from "../src/types/types";

interface RouteSummary {
  distancia: string;
  tiempo: string;
}

interface Props {
  pickingFromIsochroneMap: boolean;
  evacuando: boolean;
  hasRouteCoords: boolean;
  rutaSugerida: boolean;
  rutaRiesgosa: boolean;
  isCalculating: boolean;
  resumenRuta: RouteSummary | null;
  destinoFinal: DestinoFinal | null;
  iconoModo: string;
}

export default function RouteStatusBanners({
  pickingFromIsochroneMap,
  evacuando, hasRouteCoords,
  rutaSugerida, rutaRiesgosa, isCalculating,
  resumenRuta, destinoFinal, iconoModo,
}: Props) {
  return (
    <View style={styles.topBannersStack} pointerEvents="box-none">
      {pickingFromIsochroneMap && (
        <View style={styles.pickingBanner}>
          <MaterialIcons name="touch-app" size={18} color="#fff" />
          <Text style={styles.pickingBannerText}>
            Toca un refugio en el mapa para elegirlo
          </Text>
        </View>
      )}
      {evacuando && hasRouteCoords && (
        <View style={styles.evacuandoBanner}>
          <Text style={styles.evacuandoText}>🚨 Evacuando</Text>
        </View>
      )}
      {rutaRiesgosa && (evacuando || rutaSugerida) && (
        <View style={styles.riskyBanner}>
          <MaterialIcons name="warning" size={18} color="#fff" />
          <Text style={styles.riskyBannerText}>
            Ruta no garantizada · el frente podría cortarla
          </Text>
        </View>
      )}
      {rutaSugerida && !evacuando && (
        <View style={[styles.evacuandoBanner, { backgroundColor: "#118ab2" }]}>
          <Text style={styles.evacuandoText}>🧭 Ruta sugerida</Text>
        </View>
      )}
      {isCalculating && !evacuando && (
        <View style={[styles.evacuandoBanner, { backgroundColor: "#6366f1" }]}>
          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.evacuandoText}>Calculando ruta...</Text>
        </View>
      )}
      {(evacuando || rutaSugerida) && resumenRuta && destinoFinal && (
        <View style={styles.resumenBanner}>
          <Text style={styles.resumenText}>
            {iconoModo} {resumenRuta.distancia} · ⏱️ {resumenRuta.tiempo}
          </Text>
          <Text style={styles.resumenSub} numberOfLines={1}>→ {destinoFinal.nombre}</Text>
        </View>
      )}
    </View>
  );
}

// Estilos idénticos a los que tenía MapViewContainer antes del split —
// las posiciones (top, sombras, etc.) se mantienen 1:1 para no alterar UI.
const styles = StyleSheet.create({
  topBannersStack: {
    position: "absolute", top: 170, left: 0, right: 0, zIndex: 10,
    alignItems: "center", gap: 8,
  },
  pickingBanner: {
    backgroundColor: "#10b981",
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    flexDirection: "row", alignItems: "center", gap: 8,
    elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8,
  },
  pickingBannerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  evacuandoBanner: {
    backgroundColor: "#073b4c", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  evacuandoText: { color: "#ffffff", fontWeight: "700", fontSize: 14, includeFontPadding: false },
  riskyBanner: {
    backgroundColor: "#b91c1c", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "85%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
  },
  riskyBannerText: { color: "#fff", fontWeight: "700", fontSize: 12, flexShrink: 1 },
  resumenBanner: {
    backgroundColor: "#ffffffee", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
    elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    alignItems: "center", maxWidth: "70%",
  },
  resumenText: { color: "#073b4c", fontWeight: "700", fontSize: 13, includeFontPadding: false },
  resumenSub: { color: "#6b7280", fontSize: 11, marginTop: 2 },
});
