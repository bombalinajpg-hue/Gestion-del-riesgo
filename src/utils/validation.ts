/**
 * Validadores compartidos entre servicios.
 */

/**
 * Valida que (lat, lng) sea un par geográficamente legítimo.
 *
 * Rechaza:
 *  - valores no numéricos / NaN / Infinity
 *  - lat fuera de [-90, 90], lng fuera de [-180, 180]
 *  - (0, 0) "Null Island" — es la coordenada por defecto cuando el GPS
 *    no tiene fix o la variable no se inicializó. En zona poblada es
 *    extremadamente raro que coincida con un punto real, así que
 *    rechazarla evita un montón de basura en los reportes.
 */
export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // Null Island — rechazar con tolerancia pequeña.
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return false;
  return true;
}

/**
 * Valida un teléfono: permite dígitos, espacios, guiones, paréntesis y
 * un "+" inicial opcional. Mínimo 7 dígitos "reales". Rechaza letras.
 */
export function isValidPhone(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (trimmed.length < 7) return false;
  // Formato permitido globalmente: +, dígitos, espacios, guiones, paréntesis.
  if (!/^[+\d][\d\s()-]+$/.test(trimmed)) return false;
  // Exigir que al menos 7 caracteres sean dígitos reales.
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7;
}
