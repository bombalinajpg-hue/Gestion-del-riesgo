/**
 * Servicio de preparación para emergencias.
 *
 * Mantiene el estado persistente del "Kit de emergencia" (mochila 72h)
 * según las recomendaciones oficiales de la UNGRD y Defensa Civil
 * para familias en zonas de riesgo. Los items están agrupados por
 * categoría para que la UI los muestre con estructura.
 *
 * Persistencia: AsyncStorage, schema v1. Key: 'preparedness_v1'.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'preparedness_v1';

export type ItemCategory =
  | 'documentos'
  | 'agua_alimento'
  | 'salud'
  | 'abrigo'
  | 'comunicacion'
  | 'otros';

export interface PreparednessItem {
  id: string;
  label: string;
  description?: string;
  category: ItemCategory;
  /** Si es un item que debe reemplazarse/revisarse periódicamente */
  expiresInDays?: number;
}

/** Catálogo oficial — alineado con recomendaciones UNGRD para 72 horas */
export const PREPAREDNESS_CATALOG: PreparednessItem[] = [
  // Documentos
  {
    id: 'doc_identificacion',
    label: 'Documento de identidad',
    description: 'Copias de cédulas, pasaportes, tarjetas de identidad',
    category: 'documentos',
  },
  {
    id: 'doc_contactos',
    label: 'Lista de contactos de emergencia',
    description: 'Familiares, médico, vecinos de confianza',
    category: 'documentos',
  },
  {
    id: 'doc_medicos',
    label: 'Historia clínica y fórmulas médicas',
    description: 'Alergias, enfermedades crónicas, medicamentos',
    category: 'documentos',
  },

  // Agua y alimento
  {
    id: 'agua',
    label: 'Agua potable (4 L por persona)',
    description: 'Mínimo para 3 días; en contenedores cerrados',
    category: 'agua_alimento',
    expiresInDays: 180,
  },
  {
    id: 'alimento',
    label: 'Alimentos no perecederos',
    description: 'Barras energéticas, enlatados, galletas, para 72 horas',
    category: 'agua_alimento',
    expiresInDays: 180,
  },
  {
    id: 'abrelatas',
    label: 'Abrelatas manual',
    category: 'agua_alimento',
  },

  // Salud
  {
    id: 'botiquin',
    label: 'Botiquín de primeros auxilios',
    description: 'Gasas, alcohol, vendas, tijeras, termómetro, analgésicos',
    category: 'salud',
  },
  {
    id: 'medicamentos',
    label: 'Medicamentos personales',
    description: 'Mínimo 7 días de tratamiento de base',
    category: 'salud',
  },
  {
    id: 'mascarillas',
    label: 'Mascarillas N95 o similares',
    description: 'Protección respiratoria en incendios, cenizas o polvo',
    category: 'salud',
  },

  // Abrigo
  {
    id: 'ropa',
    label: 'Muda de ropa y calzado resistente',
    description: 'Abrigo, impermeable, calzado cerrado',
    category: 'abrigo',
  },
  {
    id: 'manta',
    label: 'Manta térmica o sleeping',
    category: 'abrigo',
  },

  // Comunicación y herramientas
  {
    id: 'linterna',
    label: 'Linterna con pilas de repuesto',
    category: 'comunicacion',
  },
  {
    id: 'radio',
    label: 'Radio portátil a pilas',
    description: 'Para recibir alertas oficiales cuando no hay celular',
    category: 'comunicacion',
  },
  {
    id: 'silbato',
    label: 'Silbato',
    description: 'Para pedir ayuda si quedas atrapado',
    category: 'comunicacion',
  },
  {
    id: 'powerbank',
    label: 'Batería externa cargada',
    category: 'comunicacion',
  },

  // Otros
  {
    id: 'efectivo',
    label: 'Dinero en efectivo (monedas y billetes)',
    description: 'Los cajeros y datáfonos pueden no funcionar',
    category: 'otros',
  },
  {
    id: 'llaves',
    label: 'Copia de llaves (casa, vehículo)',
    category: 'otros',
  },
  {
    id: 'kit_higiene',
    label: 'Kit de higiene personal',
    description: 'Toallas húmedas, papel higiénico, cepillo, jabón',
    category: 'otros',
  },
];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  documentos: 'Documentos',
  agua_alimento: 'Agua y alimento',
  salud: 'Salud',
  abrigo: 'Abrigo',
  comunicacion: 'Comunicación',
  otros: 'Otros esenciales',
};

export const CATEGORY_ICONS: Record<ItemCategory, string> = {
  documentos: '📄',
  agua_alimento: '💧',
  salud: '⚕️',
  abrigo: '🧥',
  comunicacion: '📻',
  otros: '🧰',
};

/** Estado persistido — solo los IDs marcados */
export interface PreparednessState {
  checkedIds: string[];
  lastReviewAt?: string; // ISO
}

export async function loadPreparedness(): Promise<PreparednessState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { checkedIds: [] };
    return JSON.parse(raw) as PreparednessState;
  } catch {
    return { checkedIds: [] };
  }
}

export async function savePreparedness(state: PreparednessState): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      lastReviewAt: new Date().toISOString(),
    }),
  );
}

export async function toggleItem(itemId: string): Promise<PreparednessState> {
  const state = await loadPreparedness();
  const set = new Set(state.checkedIds);
  if (set.has(itemId)) set.delete(itemId);
  else set.add(itemId);
  const next = { ...state, checkedIds: Array.from(set) };
  await savePreparedness(next);
  return next;
}

export function getProgress(state: PreparednessState): {
  checked: number;
  total: number;
  percent: number;
} {
  const total = PREPAREDNESS_CATALOG.length;
  const checked = state.checkedIds.length;
  return { checked, total, percent: total > 0 ? checked / total : 0 };
}
