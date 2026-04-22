/**
 * Capa visual de "mapa de calor de reportes" — reemplaza al
 * `<Heatmap>` nativo de react-native-maps, que crasheaba en iOS con
 * ciertos datasets (weight=0, muy pocos puntos, etc.).
 *
 * En lugar del heatmap real, pintamos `<Circle>` por cada cluster con:
 *   · radio proporcional a `supportCount` (más reportes → círculo
 *     más grande, hasta un máximo razonable).
 *   · color escalonado según bandas de intensidad — mismo lenguaje
 *     visual que las isócronas del mapa de tiempo: azul (poco) →
 *     verde → amarillo → naranja → rojo (muy intenso).
 *   · opacidad del fill moderada para que el polígono de riesgo
 *     debajo siga visible.
 *
 * El resultado se lee como "zonas calientes de reportes" y es estable
 * en ambas plataformas. No hay interpolación bilineal real como en un
 * heatmap genuino, pero para el propósito (lectura territorial de
 * densidad) comunica la misma información.
 */

import { Circle } from "react-native-maps";
import type { PublicAlert } from "../src/types/graph";

// Bandas de color ordenadas de menor a mayor intensidad. El conteo
// `supportCount` determina qué banda aplica. Paleta equivalente a la
// de IsochroneOverlay para que el usuario reconozca el código.
const BANDS: { min: number; fill: string; stroke: string; radius: number }[] = [
  { min: 1, fill: "#3b82f640", stroke: "#3b82f6", radius: 120 },   // azul
  { min: 3, fill: "#10b98140", stroke: "#10b981", radius: 160 },   // verde
  { min: 5, fill: "#eab30855", stroke: "#eab308", radius: 200 },   // amarillo
  { min: 10, fill: "#f9731655", stroke: "#f97316", radius: 240 },  // naranja
  { min: 20, fill: "#dc262666", stroke: "#dc2626", radius: 280 },  // rojo
];

function bandFor(supportCount: number) {
  // Buscamos la banda más alta cuyo umbral mínimo se cumple.
  for (let i = BANDS.length - 1; i >= 0; i--) {
    if (supportCount >= BANDS[i].min) return BANDS[i];
  }
  return BANDS[0];
}

interface Props {
  alerts: PublicAlert[];
}

export default function AlertsHeatLayer({ alerts }: Props) {
  if (alerts.length === 0) return null;
  return (
    <>
      {alerts.map((a) => {
        const band = bandFor(a.supportCount);
        return (
          <Circle
            key={`alert-heat-${a.id}`}
            center={{ latitude: a.lat, longitude: a.lng }}
            radius={band.radius}
            strokeColor={band.stroke}
            fillColor={band.fill}
            strokeWidth={1.5}
          />
        );
      })}
    </>
  );
}

/** Bandas de la leyenda — útil para pintar la misma escala en pills. */
export const ALERTS_HEAT_BANDS = BANDS;
