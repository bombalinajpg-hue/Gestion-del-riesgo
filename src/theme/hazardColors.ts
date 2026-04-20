/**
 * Colores de amenaza por tipo de emergencia y nivel (Baja/Media/Alta).
 *
 * Centralizamos acá para que la leyenda del drawer (MainMenu) y las
 * capas pintadas sobre el mapa (MapHazardLayers) usen la misma paleta.
 * Antes vivían duplicadas: cambiar un color en un archivo olvidaba el
 * otro y la leyenda dejaba de coincidir con lo que pinta el mapa.
 *
 * La "base" es `rgb(r,g,b)` sin alfa. Cada consumidor aplica su propio
 * alfa según contexto (chip en leyenda, stroke del polígono, fill
 * translúcido). Los alfas se eligieron empíricamente para legibilidad
 * sobre el mapa satélite/híbrido y son los mismos que el código tenía
 * inline antes del refactor.
 */

import type { EmergencyType } from "../types/graph";

type Nivel = "Baja" | "Media" | "Alta";

type HazardKey = Exclude<EmergencyType, "ninguna">;

const BASE: Record<HazardKey, Partial<Record<Nivel, [number, number, number]>>> = {
  inundacion: {
    Media: [30, 144, 255],
    Alta: [0, 0, 205],
  },
  movimiento_en_masa: {
    Baja: [255, 215, 0],
    Media: [255, 140, 0],
    Alta: [139, 0, 0],
  },
  avenida_torrencial: {
    Media: [255, 100, 0],
    Alta: [180, 0, 0],
  },
};

// Alfas por consumidor × nivel × tipo. Son los valores literales que
// tenía el código antes — preservar 1:1 es lo importante para no romper UI.
const LEGEND_ALPHA: Record<HazardKey, Partial<Record<Nivel, number>>> = {
  inundacion: { Media: 0.4, Alta: 0.5 },
  movimiento_en_masa: { Baja: 0.6, Media: 0.6, Alta: 0.7 },
  avenida_torrencial: { Media: 0.5, Alta: 0.6 },
};

const STROKE_ALPHA: Record<Nivel, number> = { Baja: 0.5, Media: 0.5, Alta: 0.6 };
const FILL_ALPHA: Record<Nivel, number> = { Baja: 0.12, Media: 0.12, Alta: 0.18 };

function rgba(base: [number, number, number], alpha: number): string {
  const [r, g, b] = base;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Color para el chip de la leyenda del drawer. */
export function hazardLegendColor(type: HazardKey, nivel: Nivel): string | undefined {
  const b = BASE[type][nivel];
  const a = LEGEND_ALPHA[type][nivel];
  if (!b || a === undefined) return undefined;
  return rgba(b, a);
}

/** Color de línea del polígono geojson sobre el mapa. */
export function hazardStrokeColor(type: HazardKey, nivel: Nivel): string | undefined {
  const b = BASE[type][nivel];
  if (!b) return undefined;
  return rgba(b, STROKE_ALPHA[nivel]);
}

/** Color de relleno translúcido del polígono geojson. */
export function hazardFillColor(type: HazardKey, nivel: Nivel): string | undefined {
  const b = BASE[type][nivel];
  if (!b) return undefined;
  return rgba(b, FILL_ALPHA[nivel]);
}

/** Estructura declarativa para iterar niveles en orden en la leyenda. */
export const HAZARD_LEVELS: Record<HazardKey, Nivel[]> = {
  inundacion: ["Media", "Alta"],
  movimiento_en_masa: ["Baja", "Media", "Alta"],
  avenida_torrencial: ["Media", "Alta"],
};
