/**
 * IsochroneOverlay — dibuja bandas de tiempo hasta el refugio más
 * cercano como círculos de colores sobre el mapa.
 *
 * Recibe el grafo + la tabla de isócronas precomputada. Para cada
 * nodo, elige el color según el tiempo estimado a seguridad.
 *
 * Decisión de diseño: usamos <Circle> en vez de <Heatmap> porque
 * react-native-maps Heatmap requiere PROVIDER_GOOGLE + dev client,
 * no funciona en Expo Go en iOS.
 */

import React from 'react';
import { Circle } from 'react-native-maps';
import type { Graph, IsochroneTable } from '../src/types/graph';

interface Props {
  graph: Graph;
  table: IsochroneTable;
}

interface Band {
  maxSeconds: number;
  color: string;
}

const BANDS: Band[] = [
  { maxSeconds: 180,   color: '#10b981' }, // ≤3 min  verde
  { maxSeconds: 360,   color: '#84cc16' }, // ≤6 min  lima
  { maxSeconds: 600,   color: '#eab308' }, // ≤10 min amarillo
  { maxSeconds: 900,   color: '#f97316' }, // ≤15 min naranja
  { maxSeconds: Infinity, color: '#dc2626' }, // >15 min rojo
];

// Para no saturar el mapa renderizamos uno de cada N nodos
const STRIDE = 2;
const RADIUS_METERS = 45;
const ALPHA_HEX = '38'; // ~22% opacidad

function colorForSeconds(sec: number): string {
  for (const b of BANDS) {
    if (sec <= b.maxSeconds) return b.color;
  }
  return BANDS[BANDS.length - 1].color;
}

export default function IsochroneOverlay({ graph, table }: Props) {
  const circles: React.ReactElement[] = [];

  // Extraer valores de la tabla. Soporta ambas estructuras posibles:
  //   - table.entries[idx] = { timeSeconds, destinationName, ... } (actual)
  //   - table.bestTime[idx] = seconds (formato antiguo, archivos cacheados
  //     de versiones previas que aún pueden estar en AsyncStorage).
  type LegacyEntry = number;
  type LegacyTable = { bestTime?: number[] };
  const getSeconds = (i: number): number | null => {
    const t = table as IsochroneTable & LegacyTable;
    const entry = t.entries?.[i] as undefined | LegacyEntry | { timeSeconds?: number };
    if (typeof entry === 'number') return isFinite(entry) ? entry : null;
    if (entry && typeof entry === 'object' && typeof entry.timeSeconds === 'number') {
      return isFinite(entry.timeSeconds) ? entry.timeSeconds : null;
    }
    if (t.bestTime && typeof t.bestTime[i] === 'number') {
      const v = t.bestTime[i];
      return isFinite(v) ? v : null;
    }
    return null;
  };

  for (let i = 0; i < graph.nodes.length; i += STRIDE) {
    const sec = getSeconds(i);
    if (sec === null) continue;
    const node = graph.nodes[i];
    const color = colorForSeconds(sec) + ALPHA_HEX;
    circles.push(
      <Circle
        key={`iso-${i}`}
        center={{ latitude: node.lat, longitude: node.lng }}
        radius={RADIUS_METERS}
        fillColor={color}
        strokeColor="transparent"
        strokeWidth={0}
      />,
    );
  }

  return <>{circles}</>;
}