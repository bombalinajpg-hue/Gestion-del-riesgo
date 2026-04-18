/**
 * Servicio de refugios detallados.
 *
 * Lee desde data/refugios_detallados.json una ficha extendida por
 * punto de encuentro. Se une con destinos.json por `nombre`.
 *
 * Este servicio NO tiene escritura — los refugios se actualizan
 * editando el JSON directamente. Para una app que permita reportar
 * capacidad en tiempo real por gestores (ej. Defensa Civil) se
 * necesitaría un backend + auth.
 */

import refugiosDetalladosRaw from '../../data/refugios_detallados.json';
import type { RefugeDetails, RefugeServiceTag } from '../types/v4';

const refugios = refugiosDetalladosRaw as RefugeDetails[];

export function getRefugeByName(nombre: string): RefugeDetails | null {
  return refugios.find((r) => r.nombre === nombre) ?? null;
}

export function getAllRefuges(): RefugeDetails[] {
  return refugios;
}

// ─── Labels y metadatos de UI para los tags de servicios ────────────────────

export const SERVICE_METADATA: Record<
  RefugeServiceTag,
  { label: string; icon: string }
> = {
  agua: { label: 'Agua potable', icon: '💧' },
  comida: { label: 'Alimentos', icon: '🍞' },
  primeros_auxilios: { label: 'Primeros auxilios', icon: '⚕️' },
  electricidad: { label: 'Electricidad', icon: '🔌' },
  ducha: { label: 'Duchas', icon: '🚿' },
  banos: { label: 'Baños', icon: '🚻' },
  abrigo: { label: 'Abrigo / techado', icon: '🏠' },
  mascota_permitida: { label: 'Mascotas permitidas', icon: '🐕' },
  accesibilidad_silla: { label: 'Accesibilidad silla', icon: '♿' },
};
