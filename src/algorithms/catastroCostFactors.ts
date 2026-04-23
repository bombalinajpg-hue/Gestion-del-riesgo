/**
 * Factores de costo adicionales derivados de datos catastrales para el
 * ruteo de evacuación. Se aplican multiplicativamente sobre el costo base
 * de cada arista (`edge.costSeconds[profile]`) durante la búsqueda de
 * ruta óptima.
 *
 * Dos dimensiones cubiertas:
 *
 *  4A · Vulnerabilidad de obras lineales  (`edge.obraLinealVul`)
 *       Proviene del estudio EDAVR — califica tramos viales según su
 *       fragilidad estructural ante fenómenos. Una vía colocada en una
 *       corona de deslizamiento no es una buena ruta, aunque sea corta.
 *
 *  4B · Riesgo predial adyacente  (`edge.nearbyRisk`)
 *       Conteo de predios en categoría Alta / Media / Baja dentro del
 *       buffer de la arista, para la emergencia activa. Una vía rodeada
 *       de predios en riesgo alto se penaliza para que la ruta prefiera
 *       entornos más seguros.
 *
 * Ambos factores se consumen desde `localRouter.ts` y se pasan a los 4
 * algoritmos del proyecto (Dijkstra / A* / MultiSource / TimeDependent).
 *
 * El multiplicador combinado tiene tope 4.0× para que el algoritmo nunca
 * descarte del todo una arista por motivos catastrales — lo que evita es
 * que la convierta en primera opción. Si el usuario no tiene alternativa,
 * la ruta aún pasa (emergencia > preferencia).
 *
 * Referencias:
 *  · Decreto 1807/2014 (Colombia) — estudios detallados de riesgo.
 *  · ALDESARROLLO (2025) — Estudio EDAVR del río San Eugenio.
 */

import type { EmergencyType, GraphEdge, RouteProfile } from '../types/graph';

export interface CatastroPenaltyOpts {
  /** Tipo de emergencia activa; si es 'ninguna' no se aplica penalty. */
  emergencyType: EmergencyType;
  /** Cuánto subir el costo por vulnerabilidad de obra lineal. */
  obraLinealFactor?: { Alta: number; Media: number; Baja: number };
  /** Cuánto subir el costo por predio en riesgo cercano, por categoría. */
  prediosRiesgoFactor?: { Alta: number; Media: number; Baja: number };
  /** Tope del multiplicador combinado. */
  maxMultiplier?: number;
}

type NivelFactor = { Alta: number; Media: number; Baja: number };

const DEFAULT_OBRA: NivelFactor = {
  Alta: 2.0,   // ×3 total con base 1
  Media: 0.6,  // ×1.6
  Baja: 0.15,  // ×1.15
};

const DEFAULT_PREDIOS: NivelFactor = {
  Alta: 0.25,   // cada predio Alta suma 0.25 al multiplicador
  Media: 0.08,
  Baja: 0.02,
};

const DEFAULT_MAX = 4.0;

/**
 * Devuelve el multiplicador a aplicar sobre `edge.costSeconds[profile]`
 * según los factores catastrales. Siempre ≥ 1.0.
 *
 * Se aplica SOLO al perfil `foot-walking` — el análisis de ruteo peatonal
 * es el más sensible al contexto catastral; en vehículo la dinámica es
 * distinta y la penalización por predios adyacentes no tiene sentido.
 */
export function catastroEdgeMultiplier(
  edge: GraphEdge & {
    obraLinealVul?: 'Alta' | 'Media' | 'Baja' | null;
    nearbyRisk?: Partial<Record<Exclude<EmergencyType, 'ninguna'>, Partial<Record<'Alta' | 'Media' | 'Baja', number>>>>;
  },
  profile: RouteProfile,
  opts: CatastroPenaltyOpts,
): number {
  if (opts.emergencyType === 'ninguna') return 1;
  if (profile !== 'foot-walking') return 1;

  const obraFactor = opts.obraLinealFactor ?? DEFAULT_OBRA;
  const predFactor = opts.prediosRiesgoFactor ?? DEFAULT_PREDIOS;
  const maxMult = opts.maxMultiplier ?? DEFAULT_MAX;

  let mult = 1;

  // 4A — obra lineal vulnerable
  if (edge.obraLinealVul && obraFactor[edge.obraLinealVul] != null) {
    mult += obraFactor[edge.obraLinealVul];
  }

  // 4B — predios en riesgo adyacentes, solo para la emergencia activa
  const risks = edge.nearbyRisk?.[opts.emergencyType];
  if (risks) {
    if (risks.Alta) mult += risks.Alta * predFactor.Alta;
    if (risks.Media) mult += risks.Media * predFactor.Media;
    if (risks.Baja) mult += risks.Baja * predFactor.Baja;
  }

  if (mult > maxMult) mult = maxMult;
  return mult;
}
