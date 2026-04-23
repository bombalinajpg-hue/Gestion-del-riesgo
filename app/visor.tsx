/**
 * Ruta /visor — Visor geográfico.
 *
 * Segunda pestaña del bottom nav. Expone las capas catastrales del
 * Estudio Detallado ALDESARROLLO (2025) para consulta libre, sin
 * forzar al usuario al flujo de cálculo de ruta.
 */

import MapVisorContainer from "../components/MapVisorContainer";

export default function VisorScreen() {
  return <MapVisorContainer />;
}
