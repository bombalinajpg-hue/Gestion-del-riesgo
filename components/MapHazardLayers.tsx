/**
 * Capas Geojson de amenaza que se superponen al mapa según el tipo de
 * emergencia. Están aisladas del MapViewContainer porque solo dependen
 * del `emergencyType` y las FeatureCollections pre-filtradas — moverlas
 * acá reduce ruido visual en el contenedor y deja explícita la regla
 * de qué se pinta en cada caso.
 *
 * Colores vienen de `src/theme/hazardColors.ts` (fuente única — la misma
 * paleta alimenta la leyenda del drawer).
 */

import type { FeatureCollection, Geometry } from "geojson";
import { Geojson } from "react-native-maps";
import type { HazardFeatureProperties } from "../src/types/types";
import type { EmergencyType } from "../src/types/graph";
import { hazardFillColor, hazardStrokeColor } from "../src/theme/hazardColors";

type HazardCollection = FeatureCollection<Geometry, HazardFeatureProperties>;

interface Props {
  emergencyType: EmergencyType;
  mmBaja: HazardCollection;
  mmMedia: HazardCollection;
  mmAlta: HazardCollection;
  InundMedia: HazardCollection;
  InundAlta: HazardCollection;
  avMedia: HazardCollection;
  avAlta: HazardCollection;
}

export default function MapHazardLayers({
  emergencyType,
  mmBaja, mmMedia, mmAlta,
  InundMedia, InundAlta,
  avMedia, avAlta,
}: Props) {
  if (emergencyType === "inundacion") {
    return (
      <>
        <Geojson
          geojson={InundMedia}
          strokeColor={hazardStrokeColor("inundacion", "Media")}
          fillColor={hazardFillColor("inundacion", "Media")}
          strokeWidth={1}
        />
        <Geojson
          geojson={InundAlta}
          strokeColor={hazardStrokeColor("inundacion", "Alta")}
          fillColor={hazardFillColor("inundacion", "Alta")}
          strokeWidth={1}
        />
      </>
    );
  }
  if (emergencyType === "movimiento_en_masa") {
    return (
      <>
        <Geojson
          geojson={mmBaja}
          strokeColor={hazardStrokeColor("movimiento_en_masa", "Baja")}
          fillColor={hazardFillColor("movimiento_en_masa", "Baja")}
          strokeWidth={1}
        />
        <Geojson
          geojson={mmMedia}
          strokeColor={hazardStrokeColor("movimiento_en_masa", "Media")}
          fillColor={hazardFillColor("movimiento_en_masa", "Media")}
          strokeWidth={1}
        />
        <Geojson
          geojson={mmAlta}
          strokeColor={hazardStrokeColor("movimiento_en_masa", "Alta")}
          fillColor={hazardFillColor("movimiento_en_masa", "Alta")}
          strokeWidth={1}
        />
      </>
    );
  }
  if (emergencyType === "avenida_torrencial") {
    return (
      <>
        <Geojson
          geojson={avMedia}
          strokeColor={hazardStrokeColor("avenida_torrencial", "Media")}
          fillColor={hazardFillColor("avenida_torrencial", "Media")}
          strokeWidth={1}
        />
        <Geojson
          geojson={avAlta}
          strokeColor={hazardStrokeColor("avenida_torrencial", "Alta")}
          fillColor={hazardFillColor("avenida_torrencial", "Alta")}
          strokeWidth={1}
        />
      </>
    );
  }
  return null;
}
