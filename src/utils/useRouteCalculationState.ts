/**
 * Hook para gestionar estado de cálculo de ruta.
 *
 * Proporciona:
 *   - `isCalculating`: booleano de estado visible para UI.
 *   - `setCalculating(fn)`: wrapping que activa/desactiva el estado
 *     alrededor de una promesa.
 *   - `scheduleCalculation(key, fn, delay)`: debounce — si se llama
 *     de nuevo con la misma `key` antes del delay, cancela la anterior.
 *     Evita recalcular múltiples veces cuando el usuario toquetea el
 *     selector de emergencia/perfil.
 */

import { useCallback, useRef, useState } from 'react';

export function useRouteCalculationState() {
  const [isCalculating, setIsCalculating] = useState(false);
  const timers = useRef<Map<string, any>>(new Map());
  const activeKey = useRef<string | null>(null);

  const setCalculating = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setIsCalculating(true);
      try {
        return await fn();
      } finally {
        setIsCalculating(false);
      }
    },
    [],
  );

  /** Debounce por key. Cancela ejecuciones previas con la misma key. */
  const scheduleCalculation = useCallback(
    (key: string, fn: () => Promise<void>, delay = 200) => {
      const prev = timers.current.get(key);
      if (prev) clearTimeout(prev);
      const t = setTimeout(async () => {
        timers.current.delete(key);
        activeKey.current = key;
        await setCalculating(fn);
        if (activeKey.current === key) activeKey.current = null;
      }, delay);
      timers.current.set(key, t);
    },
    [setCalculating],
  );

  const cancelAll = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
  }, []);

  return { isCalculating, setCalculating, scheduleCalculation, cancelAll };
}
