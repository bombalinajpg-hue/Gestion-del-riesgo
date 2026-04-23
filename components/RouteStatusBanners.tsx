/**
 * Stack de banners superiores del mapa.
 *
 * Banners posibles (orden vertical de arriba hacia abajo):
 *   1. "Toca un refugio" (picking mode) — exclusivo, no convive con otros
 *   2. Status principal:
 *        · 🚨 Evacuando
 *        · 🧭 Ruta sugerida
 *        · Calculando ruta…
 *   3. Resumen (iconoModo · distancia · tiempo · destino) — barra aparte,
 *      solo para evacuando/sugerida. El usuario pidió explícitamente
 *      que status y resumen sean DOS barras distintas, no un banner
 *      compuesto — así el status queda claro de un vistazo y el detalle
 *      técnico vive debajo sin saturar la línea principal.
 *   4. Warning ⚠️ ruta no garantizada — solo si rutaRiesgosa.
 *
 * `picking` sigue siendo exclusivo (no hay ruta para mostrar resumen).
 * `calculating` no tiene resumen (aún no hay datos).
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
  // Picking mode es exclusivo.
  if (pickingFromIsochroneMap) {
    return (
      <View style={styles.topBannersStack} pointerEvents="box-none">
        <View style={styles.pickingBanner}>
          <MaterialIcons name="touch-app" size={18} color="#fff" />
          <Text style={styles.pickingBannerText}>
            Toca un punto de encuentro en el mapa para elegirlo
          </Text>
        </View>
      </View>
    );
  }

  // Status banner: evacuando / sugerida / calculando (uno solo, el activo).
  let statusBanner: React.ReactNode = null;
  let showResumen = false;

  if (evacuando && hasRouteCoords) {
    statusBanner = (
      <View style={styles.statusBanner}>
        <Text style={styles.statusBannerTitle}>🚨 Evacuando</Text>
      </View>
    );
    showResumen = true;
  } else if (isCalculating) {
    statusBanner = (
      <View style={[styles.statusBanner, { backgroundColor: "#6366f1" }]}>
        <View style={styles.inlineRow}>
          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.statusBannerTitle}>Calculando ruta...</Text>
        </View>
      </View>
    );
  } else if (rutaSugerida) {
    statusBanner = (
      <View style={[styles.statusBanner, { backgroundColor: "#118ab2" }]}>
        <Text style={styles.statusBannerTitle}>🧭 Ruta sugerida</Text>
      </View>
    );
    showResumen = true;
  }

  const resumenBanner =
    showResumen && resumenRuta && destinoFinal ? (
      <View style={styles.resumenBanner}>
        <Text style={styles.resumenText} numberOfLines={1}>
          {iconoModo} {resumenRuta.distancia} · ⏱️ {resumenRuta.tiempo}
        </Text>
        <Text style={styles.resumenDest} numberOfLines={1}>
          → {destinoFinal.nombre}
        </Text>
      </View>
    ) : null;

  const riskyBanner =
    rutaRiesgosa && (evacuando || rutaSugerida) ? (
      <View style={styles.riskyBanner}>
        <MaterialIcons name="warning" size={18} color="#fff" />
        <Text style={styles.riskyBannerText}>
          Ruta no garantizada · el frente podría cortarla
        </Text>
      </View>
    ) : null;

  if (!statusBanner && !resumenBanner && !riskyBanner) return null;

  return (
    <View style={styles.topBannersStack} pointerEvents="box-none">
      {statusBanner}
      {resumenBanner}
      {riskyBanner}
    </View>
  );
}

const styles = StyleSheet.create({
  // `top: 190` da más aire respecto al chip "EvacuApp" que vive en top: 60
  // (~45 de alto → termina en 105). Antes era 170, casi pegado. Ahora hay
  // ~80 px de respiro vertical para que no se sienta apelmazado.
  topBannersStack: {
    position: "absolute", top: 190, left: 0, right: 0, zIndex: 10,
    alignItems: "center", gap: 8,
  },
  pickingBanner: {
    backgroundColor: "#10b981",
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    flexDirection: "row", alignItems: "center", gap: 8,
    maxWidth: "90%",
    elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8,
  },
  pickingBannerText: { color: "#fff", fontWeight: "700", fontSize: 13, flexShrink: 1 },
  statusBanner: {
    backgroundColor: "#073b4c",
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
    alignItems: "center",
    maxWidth: "88%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  statusBannerTitle: { color: "#fff", fontWeight: "800", fontSize: 15, includeFontPadding: false },
  inlineRow: { flexDirection: "row", alignItems: "center" },
  // Resumen ahora es banner propio (blanco translúcido, contraste con el
  // fondo oscuro del status banner que queda arriba).
  resumenBanner: {
    backgroundColor: "#ffffffee",
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18,
    alignItems: "center", maxWidth: "88%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  resumenText: { color: "#073b4c", fontWeight: "700", fontSize: 13, includeFontPadding: false },
  resumenDest: { color: "#64748b", fontSize: 11, marginTop: 1 },
  riskyBanner: {
    backgroundColor: "#b91c1c", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "85%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
  },
  riskyBannerText: { color: "#fff", fontWeight: "700", fontSize: 12, flexShrink: 1 },
});
