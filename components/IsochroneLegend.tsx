    /**
 * Leyenda de isócronas — explica qué significa cada color del overlay.
 *
 * Aparece como una tarjeta flotante cuando el overlay está activo.
 * Los colores coinciden exactamente con las BANDS definidas en
 * IsochroneOverlay.tsx.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface BandDef {
  label: string;
  color: string;
}

// Estos valores corresponden a los BANDS usados en IsochroneOverlay
const BANDS: BandDef[] = [
  { label: '≤ 3 min', color: '#10b981' },   // verde
  { label: '≤ 6 min', color: '#84cc16' },   // lima
  { label: '≤ 10 min', color: '#eab308' },  // amarillo
  { label: '≤ 15 min', color: '#f97316' },  // naranja
  { label: '> 15 min', color: '#dc2626' },  // rojo
];

export default function IsochroneLegend() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tiempo a refugio</Text>
      {BANDS.map((b) => (
        <View key={b.label} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: b.color }]} />
          <Text style={styles.label}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  label: {
    fontSize: 11,
    color: '#4b5563',
    fontWeight: '500',
  },
});