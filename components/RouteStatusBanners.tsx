/**
 * Stack de banners superiores del mapa.
 *
 * Invariante de diseño: **como máximo 2 banners visibles a la vez**.
 * Antes podían convivir hasta 4-5 (picking + evacuando + sugerida +
 * riesgosa + resumen + calculando), tapando la mitad del mapa.
 *
 * Regla de prioridad (solo una del primer bloque, opcionalmente el
 * warning riesgoso como segundo):
 *
 *   1. pickingFromIsochroneMap   ← modo de selección, prioritario
 *   2. evacuando (con resumen inline)
 *   3. isCalculating             ← transitorio
 *   4. rutaSugerida (con resumen inline)
 *
 *   + (opcional) rutaRiesgosa    ← solo si hay ruta calculada (sugerida
 *                                   o evacuando), como warning secundario.
 *
 * El resumen (distancia · tiempo · destino) se mergió dentro del banner
 * de evacuando/sugerida en vez de vivir en su propio banner — así una
 * ruta activa ocupa una sola fila en vez de dos.
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
  // Primer banner (exclusivo): el de mayor prioridad según el estado.
  let primaryBanner: React.ReactNode = null;
  if (pickingFromIsochroneMap) {
    primaryBanner = (
      <View style={styles.pickingBanner}>
        <MaterialIcons name="touch-app" size={18} color="#fff" />
        <Text style={styles.pickingBannerText}>
          Toca un refugio en el mapa para elegirlo
        </Text>
      </View>
    );
  } else if (evacuando && hasRouteCoords) {
    primaryBanner = (
      <View style={styles.statusBanner}>
        <Text style={styles.statusBannerTitle}>🚨 Evacuando</Text>
        {resumenRuta && destinoFinal && (
          <Text style={styles.statusBannerMeta} numberOfLines={1}>
            {iconoModo} {resumenRuta.distancia} · ⏱️ {resumenRuta.tiempo} · {destinoFinal.nombre}
          </Text>
        )}
      </View>
    );
  } else if (isCalculating) {
    primaryBanner = (
      <View style={[styles.statusBanner, { backgroundColor: "#6366f1" }]}>
        <View style={styles.inlineRow}>
          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.statusBannerTitle}>Calculando ruta...</Text>
        </View>
      </View>
    );
  } else if (rutaSugerida) {
    primaryBanner = (
      <View style={[styles.statusBanner, { backgroundColor: "#118ab2" }]}>
        <Text style={styles.statusBannerTitle}>🧭 Ruta sugerida</Text>
        {resumenRuta && destinoFinal && (
          <Text style={styles.statusBannerMeta} numberOfLines={1}>
            {iconoModo} {resumenRuta.distancia} · ⏱️ {resumenRuta.tiempo} · {destinoFinal.nombre}
          </Text>
        )}
      </View>
    );
  }

  // Segundo banner (warning): solo si hay ruta calculada y es riesgosa.
  // Nunca se muestra junto con `picking` (ahí no hay ruta).
  const riskyBanner =
    rutaRiesgosa && (evacuando || rutaSugerida) ? (
      <View style={styles.riskyBanner}>
        <MaterialIcons name="warning" size={18} color="#fff" />
        <Text style={styles.riskyBannerText}>
          Ruta no garantizada · el frente podría cortarla
        </Text>
      </View>
    ) : null;

  if (!primaryBanner && !riskyBanner) return null;

  return (
    <View style={styles.topBannersStack} pointerEvents="box-none">
      {primaryBanner}
      {riskyBanner}
    </View>
  );
}

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
  statusBanner: {
    backgroundColor: "#073b4c",
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
    alignItems: "center",
    maxWidth: "88%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  statusBannerTitle: { color: "#fff", fontWeight: "800", fontSize: 14, includeFontPadding: false },
  statusBannerMeta: { color: "rgba(255,255,255,0.88)", fontSize: 12, marginTop: 2, textAlign: "center" },
  inlineRow: { flexDirection: "row", alignItems: "center" },
  riskyBanner: {
    backgroundColor: "#b91c1c", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "85%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
  },
  riskyBannerText: { color: "#fff", fontWeight: "700", fontSize: 12, flexShrink: 1 },
});
