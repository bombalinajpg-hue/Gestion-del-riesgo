/**
 * Tipos de dominio añadidos en v4.
 *
 * Se mantienen en archivo separado para no tocar `graph.ts` existente.
 * Importa desde aquí lo que necesites.
 */

// ─── Personas desaparecidas ─────────────────────────────────────────────────

export type MissingPersonStatus = 'desaparecida' | 'encontrada' | 'expirado';

export interface MissingPerson {
  id: string;
  name: string;
  approximateAge?: number;
  description: string; // ropa, señas particulares, etc.
  photoUri?: string;
  /** Última ubicación conocida */
  lastSeenLat: number;
  lastSeenLng: number;
  /** Descripción textual del lugar */
  lastSeenPlace?: string;
  /** Hora aproximada en que fue vista por última vez */
  lastSeenAt: string; // ISO
  reportedAt: string; // ISO
  /** Teléfono de contacto del reportante */
  contactPhone: string;
  /** Nombre del reportante (parentesco) */
  contactName: string;
  status: MissingPersonStatus;
  /** ID local del dispositivo que reportó (para poder marcar como encontrada) */
  reporterDeviceId: string;
}

// ─── Encuentro familiar ─────────────────────────────────────────────────────

export interface FamilyMember {
  /** ID local del dispositivo */
  deviceId: string;
  /** Nombre elegido por el usuario */
  name: string;
  /** Última ubicación compartida */
  lat?: number;
  lng?: number;
  /** Estado declarado (si lo compartió) */
  status?: 'safe' | 'evacuating' | 'need_help' | 'unknown';
  lastUpdatedAt?: string; // ISO
}

export interface FamilyGroup {
  /** Código corto para compartir (6 caracteres alfanuméricos) */
  code: string;
  /** Nombre del grupo */
  name: string;
  /** Cuándo se creó localmente */
  createdAt: string;
  /** Miembros conocidos */
  members: FamilyMember[];
  /** Si este dispositivo es el creador */
  isOwner: boolean;
  /** Mi nombre dentro del grupo */
  myName: string;
}

// ─── Refugios detallados ────────────────────────────────────────────────────

export type RefugeServiceTag =
  | 'agua'
  | 'comida'
  | 'primeros_auxilios'
  | 'electricidad'
  | 'ducha'
  | 'banos'
  | 'abrigo'
  | 'mascota_permitida'
  | 'accesibilidad_silla';

export interface RefugeDetails {
  /** Nombre del punto de encuentro — debe coincidir con destinos.json */
  nombre: string;
  /** Capacidad máxima estimada (personas) */
  capacidadMax?: number;
  /** Capacidad actual estimada (reportada por gestores) */
  capacidadActual?: number;
  /** Servicios disponibles */
  servicios: RefugeServiceTag[];
  /** Responsable/gestor (si aplica) */
  responsable?: string;
  /** Teléfono de contacto del refugio */
  telefonoContacto?: string;
  /** Horario de atención / 24-7 */
  horario?: string;
  /** Descripción extendida */
  descripcion?: string;
  /** Ruta relativa a foto empaquetada en assets (opcional) */
  foto?: string;
  /** Notas importantes (ej: "bajar por escalera lateral") */
  notas?: string;
}
