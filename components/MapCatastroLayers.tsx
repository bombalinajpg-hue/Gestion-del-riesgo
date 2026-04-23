/**
 * Capas catastrales que se superponen al mapa.
 *
 * Fuente: Estudio Detallado de Amenaza, Vulnerabilidad y Riesgo del río
 * San Eugenio (ALDESARROLLO, 2025) — producto técnico oficial bajo el
 * Decreto 1807 de 2014 a escala 1:1000. Los GeoJSONs en data/catastro/
 * son la reproyección a EPSG:4326 (WGS84) de las feature classes de la
 * geodatabase original MAGNA-SIRGAS CTM12.
 *
 * Tres capas conmutables:
 *   · Elementos expuestos — inventario territorial calificado (AVT / INUND / MM)
 *   · Predios por riesgo   — clasificación de riesgo por predio según emergencia
 *   · Pendiente del terreno — rango en grados para análisis topográfico
 *
 * Cada capa se divide en sub-FeatureCollections por nivel / rango para
 * poder asignar color distinto con `<Geojson>` (que acepta un solo
 * fillColor por colección).
 */

import { useMemo } from "react";
import type { FeatureCollection } from "geojson";
import { Geojson } from "react-native-maps";
import type { EmergencyType } from "../src/types/graph";
import {
  NIVEL_COLORS,
  PENDIENTE_RANGOS,
  filterElementosExpuestosByNivel,
  filterPendienteByRango,
  filterPrediosByNivel,
  getPendienteColor,
  getRiesgoCollectionForEmergencia,
} from "../src/utils/catastroLayers";

interface Props {
  emergencyType: EmergencyType;
  showElementosExpuestos: boolean;
  showPrediosRiesgo: boolean;
  showPendiente: boolean;

  // Datos ya importados en el caller (una sola carga por mount).
  elementosExpuestos: FeatureCollection;
  riesgoInundacion: FeatureCollection;
  riesgoAvenidaTorrencial: FeatureCollection;
  riesgoMovimientoMasa: FeatureCollection;
  pendienteGrados: FeatureCollection;
}

export default function MapCatastroLayers({
  emergencyType,
  showElementosExpuestos,
  showPrediosRiesgo,
  showPendiente,
  elementosExpuestos,
  riesgoInundacion,
  riesgoAvenidaTorrencial,
  riesgoMovimientoMasa,
  pendienteGrados,
}: Props) {
  // Elementos expuestos — tres sub-colecciones por nivel.
  const elementosPorNivel = useMemo(() => {
    if (!showElementosExpuestos) return null;
    return {
      Alta: filterElementosExpuestosByNivel(elementosExpuestos, emergencyType, "Alta"),
      Media: filterElementosExpuestosByNivel(elementosExpuestos, emergencyType, "Media"),
      Baja: filterElementosExpuestosByNivel(elementosExpuestos, emergencyType, "Baja"),
    };
  }, [showElementosExpuestos, elementosExpuestos, emergencyType]);

  // Predios por nivel de riesgo — la capa base depende de la emergencia.
  const prediosPorNivel = useMemo(() => {
    if (!showPrediosRiesgo) return null;
    const base = getRiesgoCollectionForEmergencia(emergencyType, {
      inundacion: riesgoInundacion,
      avenida_torrencial: riesgoAvenidaTorrencial,
      movimiento_en_masa: riesgoMovimientoMasa,
    });
    if (!base) return null;
    return {
      Alta: filterPrediosByNivel(base, "Alta"),
      Media: filterPrediosByNivel(base, "Media"),
      Baja: filterPrediosByNivel(base, "Baja"),
    };
  }, [
    showPrediosRiesgo,
    emergencyType,
    riesgoInundacion,
    riesgoAvenidaTorrencial,
    riesgoMovimientoMasa,
  ]);

  // Pendiente — 5 rangos.
  const pendientePorRango = useMemo(() => {
    if (!showPendiente) return null;
    return PENDIENTE_RANGOS.map((rango) => ({
      rango,
      data: filterPendienteByRango(pendienteGrados, rango),
      color: getPendienteColor(rango),
    }));
  }, [showPendiente, pendienteGrados]);

  return (
    <>
      {/* Pendiente se pinta primero (más abajo) para que no tape el resto. */}
      {pendientePorRango?.map(({ rango, data, color }) =>
        data.features.length > 0 ? (
          <Geojson
            key={`pendiente-${rango}`}
            geojson={data}
            strokeColor={color.stroke}
            fillColor={color.fill}
            strokeWidth={1}
          />
        ) : null,
      )}

      {/* Predios por riesgo — capas por nivel Alta→Baja para que Alta
          quede visualmente arriba. */}
      {prediosPorNivel && (
        <>
          {prediosPorNivel.Baja.features.length > 0 && (
            <Geojson
              geojson={prediosPorNivel.Baja}
              strokeColor={NIVEL_COLORS.Baja.stroke}
              fillColor={NIVEL_COLORS.Baja.fill}
              strokeWidth={1}
            />
          )}
          {prediosPorNivel.Media.features.length > 0 && (
            <Geojson
              geojson={prediosPorNivel.Media}
              strokeColor={NIVEL_COLORS.Media.stroke}
              fillColor={NIVEL_COLORS.Media.fill}
              strokeWidth={1}
            />
          )}
          {prediosPorNivel.Alta.features.length > 0 && (
            <Geojson
              geojson={prediosPorNivel.Alta}
              strokeColor={NIVEL_COLORS.Alta.stroke}
              fillColor={NIVEL_COLORS.Alta.fill}
              strokeWidth={1.5}
            />
          )}
        </>
      )}

      {/* Elementos expuestos — encima para que quede visible.
          Borde más grueso para diferenciarlos de los predios. */}
      {elementosPorNivel && (
        <>
          {elementosPorNivel.Baja.features.length > 0 && (
            <Geojson
              geojson={elementosPorNivel.Baja}
              strokeColor={NIVEL_COLORS.Baja.stroke}
              fillColor="rgba(255,193,7,0.35)"
              strokeWidth={2}
            />
          )}
          {elementosPorNivel.Media.features.length > 0 && (
            <Geojson
              geojson={elementosPorNivel.Media}
              strokeColor={NIVEL_COLORS.Media.stroke}
              fillColor="rgba(239,108,0,0.4)"
              strokeWidth={2}
            />
          )}
          {elementosPorNivel.Alta.features.length > 0 && (
            <Geojson
              geojson={elementosPorNivel.Alta}
              strokeColor={NIVEL_COLORS.Alta.stroke}
              fillColor="rgba(211,47,47,0.45)"
              strokeWidth={2.5}
            />
          )}
        </>
      )}
    </>
  );
}
