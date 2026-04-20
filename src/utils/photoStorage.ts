/**
 * Persistencia de fotos en el directorio de documentos de la app.
 *
 * Problema: `expo-image-picker` devuelve URIs a archivos en la cache
 * temporal del OS. El sistema puede limpiar esa cache en cualquier
 * momento (especialmente bajo presión de almacenamiento), dejando
 * reportes con fotos que apuntan a archivos inexistentes.
 *
 * Solución: copiar la foto elegida a `documentDirectory/evacuapp-photos/`
 * antes de guardar el URI en el storage. El directorio de documentos
 * es persistente entre sesiones y no se limpia automáticamente.
 */

// expo-file-system v19 movió la API clásica a /legacy. La API nueva
// (File/Directory) requiere más boilerplate; con legacy conservamos una
// sola llamada `copyAsync` y es totalmente soportada.
import * as FileSystem from "expo-file-system/legacy";

const PHOTO_DIR = `${FileSystem.documentDirectory}evacuapp-photos/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

/**
 * Copia la foto del URI temporal a una ubicación persistente y devuelve
 * el nuevo URI. Si falla (p. ej. permisos, espacio), devuelve el URI
 * original — peor caso: la foto eventualmente desaparece, pero el
 * reporte sigue funcionando.
 */
export async function persistPhoto(sourceUri: string | undefined): Promise<string | undefined> {
  if (!sourceUri) return undefined;
  try {
    await ensureDir();
    // Extraer extensión del URI original (jpg/png/heic).
    const match = sourceUri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const ext = match ? match[1].toLowerCase() : "jpg";
    const targetUri = `${PHOTO_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
    return targetUri;
  } catch (e) {
    console.warn("[photoStorage] persistPhoto fallback:", e);
    return sourceUri;
  }
}
