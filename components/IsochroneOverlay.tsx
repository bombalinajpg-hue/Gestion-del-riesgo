/**
 * IsochroneOverlay — heatmap de tiempo-a-seguridad basado en Circles.
 *
 * Por qué no usamos <Heatmap> nativo: en iOS (Apple Maps, que es lo que
 * usa Expo Go) el componente Heatmap de react-native-maps no está
 * implementado — solo funciona con PROVIDER_GOOGLE, lo cual requiere
 * un dev client con API key de Google Maps.
 *
 * La alternativa es renderizar un Circle semitransparente por nodo, con
 * color según banda de tiempo. Al solaparse, generan un degradado continuo
 * visualmente indistinguible de un heatmap real.
 */

import { useMemo } from "react";
import { Circle } from "react-native-maps";
import type { Graph, IsochroneTable } from "../src/types/graph";

// Bandas de tiempo en segundos + color por banda
const BANDS: { maxSec: number; color: string }[] = [
  { maxSec: 180, color: "#10b981" }, // ≤3 min — verde
  { maxSec: 360, color: "#84cc16" }, // ≤6 min — lima
  { maxSec: 600, color: "#eab308" }, // ≤10 min — amarillo
  { maxSec: 900, color: "#f97316" }, // ≤15 min — naranja
  { maxSec: Infinity, color: "#dc2626" }, // >15 min — rojo
];

function bandColorForTime(seconds: number): string {
  for (const b of BANDS) if (seconds <= b.maxSec) return b.color;
  return BANDS[BANDS.length - 1].color;
}

interface Props {
  graph: Graph;
  table: IsochroneTable;
  userLocation?: { latitude: number; longitude: number } | null;
  /**
   * Densidad: 1 dibuja un círculo por nodo, 2 dibuja la mitad, 3 un tercio,
   * etc. Más alto = mejor rendimiento, menos detalle. Default 2.
   */
  stride?: number;
  /** Radio en metros por círculo. Mayor = más solapamiento/suavidad. */
  radiusMeters?: number;
  /** Alpha (0–255) para el fill; se añade como hex al color. */
  alphaHex?: string;
}

export default function IsochroneOverlay({
  graph,
  table,
  stride = 2,
  radiusMeters = 45,
  alphaHex = "38", // 0x38 = 56/255 ≈ 22% opacidad
}: Props) {
  const circles = useMemo(() => {
    const out: {
      key: string;
      latitude: number;
      longitude: number;
      color: string;
    }[] = [];
    for (let i = 0; i < table.entries.length; i += stride) {
      const e = table.entries[i];
      if (!isFinite(e.timeSeconds)) continue;
      const node = graph.nodes[i];
      if (!node) continue;
      out.push({
        key: `iso-${i}`,
        latitude: node.lat,
        longitude: node.lng,
        color: bandColorForTime(e.timeSeconds),
      });
    }
    return out;
  }, [graph, table, stride]);

  if (circles.length === 0) return null;

  return (
    <>
      {circles.map((c) => (
        <Circle
          key={c.key}
          center={{ latitude: c.latitude, longitude: c.longitude }}
          radius={radiusMeters}
          fillColor={`${c.color}${alphaHex}`}
          strokeColor="transparent"
          strokeWidth={0}
        />
      ))}
    </>
  );
}
