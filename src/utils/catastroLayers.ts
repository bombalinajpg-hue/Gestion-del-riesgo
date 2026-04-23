/**
 * Utilidades para filtrar las capas catastrales del Estudio Detallado
 * ALDESARROLLO (2025) que se renderizan sobre el mapa.
 *
 * Cada capa viene como GeoJSON FeatureCollection pre-generado en QGIS
 * desde la geodatabase oficial (MAGNA-SIRGAS CTM12, reproyectado a
 * EPSG:4326 al exportar). Estos helpers:
 *   1) filtran por emergencia / nivel / rango pertinente,
 *   2) derivan el color por clase,
 * dejando listas sub-colecciones que se pasan directo a `<Geojson>` de
 * react-native-maps (que usa un mismo fillColor por colección).
 */
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { EmergencyType } from "../types/graph";

// ─── ElementosExpuestos ────────────────────────────────────────────────────
// Campos relevantes (según tabla de atributos):
//   TIPO:        "Edificación" | "Lote" | ...
//   AVT:         "Alta" | "Media" | "Baja" | " "  (avenida torrencial)
//   INUND:       idem
//   MM:          idem (movimiento en masa)
//   AMEN_TOTAL:  combinación textual ej. "AVT + INUND"

type Nivel = "Alta" | "Media" | "Baja";

interface ElementoExpuestoProps {
  TIPO: string;
  AVT?: string;
  INUND?: string;
  MM?: string;
  AMEN_TOTAL?: string;
}

const EMPTY_VALUES = new Set(["", " ", null, undefined]);

/** Devuelve el nivel pertinente al tipo de emergencia (o null si no aplica). */
function nivelForEmergencia(
  props: ElementoExpuestoProps,
  emergencyType: EmergencyType,
): Nivel | null {
  const field =
    emergencyType === "inundacion" ? props.INUND
      : emergencyType === "movimiento_en_masa" ? props.MM
      : emergencyType === "avenida_torrencial" ? props.AVT
      : null;
  if (!field || EMPTY_VALUES.has(field)) return null;
  const v = field.trim();
  if (v === "Alta" || v === "Media" || v === "Baja") return v;
  return null;
}

export function filterElementosExpuestosByNivel(
  data: FeatureCollection,
  emergencyType: EmergencyType,
  nivel: Nivel,
): FeatureCollection {
  if (emergencyType === "ninguna") {
    // Sin emergencia activa, mostramos los que tienen AMEN_TOTAL con cualquier
    // nivel en el campo correspondiente al `nivel` pedido (agrupación visual).
    const features = data.features.filter((f) => {
      const p = f.properties as ElementoExpuestoProps;
      return p.AVT === nivel || p.INUND === nivel || p.MM === nivel;
    });
    return { type: "FeatureCollection", features };
  }
  const features = data.features.filter(
    (f) => nivelForEmergencia(f.properties as ElementoExpuestoProps, emergencyType) === nivel,
  );
  return { type: "FeatureCollection", features };
}

// ─── Predios por riesgo ────────────────────────────────────────────────────
// Las 3 capas de riesgo tienen schema similar con el nivel en distintos
// campos según la capa:
//   riesgo_inundacion              → CATEGORIA: Alta | Media | Baja
//   riesgo_avenidas_torrenciales   → CATEGORIA idem
//   riesgo_movimientos_masa        → C_riesgo:  Alta | Media | Baja

interface RiesgoProps {
  CATEGORIA?: string;
  C_riesgo?: string;
  Riesgo?: number;
  TIPO?: string;
}

function extractNivelRiesgo(props: RiesgoProps): Nivel | null {
  const v = (props.CATEGORIA ?? props.C_riesgo ?? "").trim();
  if (v === "Alta" || v === "Media" || v === "Baja") return v;
  return null;
}

export function filterPrediosByNivel(
  data: FeatureCollection,
  nivel: Nivel,
): FeatureCollection {
  const features = data.features.filter(
    (f) => extractNivelRiesgo(f.properties as RiesgoProps) === nivel,
  );
  return { type: "FeatureCollection", features };
}

/** Devuelve la capa de riesgo que corresponde al tipo de emergencia. */
export function getRiesgoCollectionForEmergencia(
  emergencyType: EmergencyType,
  colecciones: {
    inundacion: FeatureCollection;
    avenida_torrencial: FeatureCollection;
    movimiento_en_masa: FeatureCollection;
  },
): FeatureCollection | null {
  if (emergencyType === "inundacion") return colecciones.inundacion;
  if (emergencyType === "avenida_torrencial") return colecciones.avenida_torrencial;
  if (emergencyType === "movimiento_en_masa") return colecciones.movimiento_en_masa;
  return null;
}

// ─── Pendiente ─────────────────────────────────────────────────────────────
// PendienteGrados viene con el campo INCLINA como texto ej. "0º-8.5º".
// Mapeamos cada rango a un color tipo mapa topográfico estándar.

interface PendienteProps {
  INCLINA?: string;
}

// Paleta tipo mapa de pendientes (verde plano → rojo empinado).
const PENDIENTE_COLOR: Record<string, { stroke: string; fill: string }> = {
  "0-8.5": { stroke: "rgba(76,175,80,0.6)", fill: "rgba(76,175,80,0.18)" },     // verde — plano a suave
  "8.5-15": { stroke: "rgba(255,235,59,0.6)", fill: "rgba(255,235,59,0.22)" },  // amarillo — moderado
  "15-25": { stroke: "rgba(255,152,0,0.6)", fill: "rgba(255,152,0,0.25)" },     // naranja — fuerte
  "25-45": { stroke: "rgba(244,67,54,0.6)", fill: "rgba(244,67,54,0.25)" },     // rojo — escarpado
  "45+": { stroke: "rgba(123,31,162,0.7)", fill: "rgba(123,31,162,0.28)" },      // morado — muy escarpado
};

/** Normaliza el texto "0º-8.5º" → "0-8.5". */
function normalizeRango(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/[º°\s]/g, "");
}

export function filterPendienteByRango(
  data: FeatureCollection,
  rango: keyof typeof PENDIENTE_COLOR,
): FeatureCollection {
  const target = rango.replace(/[^\d.-]/g, "");
  const features = data.features.filter((f) => {
    const raw = (f.properties as PendienteProps).INCLINA;
    const norm = normalizeRango(raw);
    if (!norm) return false;
    // Matching flexible: "0-8.5" match "0-8.5" y también valores con signos
    // ligeramente diferentes en el export.
    return norm.replace(/[^\d.-]/g, "").startsWith(target) ||
           norm.includes(rango);
  });
  return { type: "FeatureCollection", features };
}

export function getPendienteColor(rango: keyof typeof PENDIENTE_COLOR) {
  return PENDIENTE_COLOR[rango];
}

export const PENDIENTE_RANGOS: (keyof typeof PENDIENTE_COLOR)[] = [
  "0-8.5",
  "8.5-15",
  "15-25",
  "25-45",
  "45+",
];

// ─── Colores por nivel (uniformes para Elementos/Predios) ──────────────────
export const NIVEL_COLORS: Record<Nivel, { stroke: string; fill: string }> = {
  Alta: { stroke: "rgba(198,40,40,0.75)", fill: "rgba(211,47,47,0.28)" },       // rojo oscuro
  Media: { stroke: "rgba(230,81,0,0.7)", fill: "rgba(239,108,0,0.25)" },        // naranja
  Baja: { stroke: "rgba(249,168,37,0.65)", fill: "rgba(255,193,7,0.22)" },      // amarillo
};

/** Utilidad auxiliar: extrae los atributos legibles de un feature de
 * vulnerabilidad / elementos expuestos, para mostrar en popups de la app. */
export function describeFeatureProps(p: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const add = (label: string, val: unknown) => {
    if (val != null && val !== "" && val !== " ") lines.push(`${label}: ${val}`);
  };
  add("Tipo", p.TIPO);
  add("Dirección", p.direccion);
  add("Barrio", p.barrio);
  add("Estrato", p.estratific);
  add("Área terreno (m²)", p.area_terr);
  add("Área construida (m²)", p.area_cons);
  add("Valor catastral", p.valor_cat ? `COP ${Number(p.valor_cat).toLocaleString("es-CO")}` : null);
  add("Valor estimado", p.valor_esti ? `COP ${Number(p.valor_esti).toLocaleString("es-CO")}` : null);
  add("Valor por m²", p.valorm2 ? `COP ${Number(p.valorm2).toLocaleString("es-CO")}` : null);
  add("Vulnerabilidad edificación", p.VUL_edif);
  add("Vulnerabilidad personas", p.VUL_pers);
  add("AVT", p.AVT);
  add("Inundación", p.INUND);
  add("Movimiento en masa", p.MM);
  add("Amenaza total", p.AMEN_TOTAL);
  add("Categoría riesgo", p.CATEGORIA ?? p.C_riesgo);
  return lines;
}
