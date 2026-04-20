/**
 * Capas Geojson de amenaza que se superponen al mapa según el tipo de
 * emergencia. Están aisladas del MapViewContainer porque solo dependen
 * del `emergencyType` y las FeatureCollections pre-filtradas — moverlas
 * acá reduce ruido visual en el contenedor y deja explícita la regla
 * de qué se pinta en cada caso.
 */

import type { FeatureCollection, Geometry } from "geojson";
import { Geojson } from "react-native-maps";
import type { HazardFeatureProperties } from "../src/types/types";
import type { EmergencyType } from "../src/types/graph";

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
        <Geojson geojson={InundMedia} strokeColor="rgba(30,144,255,0.5)" fillColor="rgba(30,144,255,0.12)" strokeWidth={1} />
        <Geojson geojson={InundAlta} strokeColor="rgba(0,0,205,0.6)" fillColor="rgba(0,0,205,0.18)" strokeWidth={1} />
      </>
    );
  }
  if (emergencyType === "movimiento_en_masa") {
    return (
      <>
        <Geojson geojson={mmBaja} strokeColor="rgba(255,215,0,0.5)" fillColor="rgba(255,215,0,0.12)" strokeWidth={1} />
        <Geojson geojson={mmMedia} strokeColor="rgba(255,140,0,0.5)" fillColor="rgba(255,140,0,0.12)" strokeWidth={1} />
        <Geojson geojson={mmAlta} strokeColor="rgba(139,0,0,0.6)" fillColor="rgba(139,0,0,0.18)" strokeWidth={1} />
      </>
    );
  }
  if (emergencyType === "avenida_torrencial") {
    return (
      <>
        <Geojson geojson={avMedia} strokeColor="rgba(255,100,0,0.5)" fillColor="rgba(255,100,0,0.12)" strokeWidth={1} />
        <Geojson geojson={avAlta} strokeColor="rgba(180,0,0,0.6)" fillColor="rgba(180,0,0,0.18)" strokeWidth={1} />
      </>
    );
  }
  return null;
}
