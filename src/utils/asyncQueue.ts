/**
 * Serializa operaciones async por clave.
 *
 * Por qué: los servicios hacen patrones `load → modify → save` sobre
 * AsyncStorage. Si dos operaciones corren en paralelo (ej. dos taps
 * rápidos del usuario, o un submit que se cruza con un refresh), cada
 * una lee la misma versión, muta, escribe — el segundo `save` gana y
 * el cambio del primero se pierde.
 *
 * Esta cola encadena las operaciones que comparten `key`: si ya hay una
 * en vuelo, la siguiente espera a que termine antes de empezar. Las
 * claves independientes siguen corriendo en paralelo.
 *
 * Limitaciones conocidas:
 *  - Funciona solo dentro de un proceso JS. Si dos dispositivos con el
 *    mismo storage backend concurrente compitieran, habría que un lock
 *    a nivel storage (fuera de scope).
 *  - Si la función pasada lanza, la excepción se propaga al caller
 *    pero la cola se mantiene sana para próximas operaciones.
 */

const chains = new Map<string, Promise<unknown>>();

export function serializeByKey<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Ambos ramales (resolve/reject) continúan con `fn` — una falla previa
  // no debe bloquear la cola.
  const next = prev.then(fn, fn);
  chains.set(
    key,
    next.catch(() => {
      /* swallow para la cadena; el caller ya recibió el rechazo */
    }),
  );
  return next;
}
