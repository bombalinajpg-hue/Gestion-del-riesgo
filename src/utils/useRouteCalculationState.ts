/**
 * Hook para gestionar estado de cálculo de ruta — v4.1.
 *
 * Cambio vs v4: el banner "Calculando ruta..." ahora tiene lógica
 * inteligente anti-flicker:
 *   - Si el cálculo termina en <250ms: NO se muestra (evita ruido visual)
 *   - Si el cálculo dura más: se muestra con mínimo 500ms de duración
 *     para que el usuario alcance a leerlo, incluso si el cálculo
 *     termina rápido después de que apareció
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const SHOW_DELAY_MS = 250;   // no mostrar si termina antes
const MIN_VISIBLE_MS = 500;  // una vez mostrado, mínimo tiempo visible

export function useRouteCalculationState() {
  const [isCalculating, setIsCalculating] = useState(false);
  const timers = useRef<Map<string, any>>(new Map());
  const showTimerRef = useRef<any>(null);
  const hideTimerRef = useRef<any>(null);
  const shownAtRef = useRef<number | null>(null);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const setCalculating = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      // Cancelar cualquier ocultamiento pendiente
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Iniciar timer de "mostrar" en SHOW_DELAY_MS
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      shownAtRef.current = null;
      showTimerRef.current = setTimeout(() => {
        setIsCalculating(true);
        shownAtRef.current = Date.now();
      }, SHOW_DELAY_MS);

      try {
        return await fn();
      } finally {
        // Si nunca se mostró, cancelar el timer
        if (showTimerRef.current) {
          clearTimeout(showTimerRef.current);
          showTimerRef.current = null;
        }
        if (shownAtRef.current !== null) {
          // Ya se mostró: respetar el tiempo mínimo visible
          const elapsed = Date.now() - shownAtRef.current;
          const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
          if (remaining > 0) {
            hideTimerRef.current = setTimeout(() => {
              setIsCalculating(false);
              hideTimerRef.current = null;
            }, remaining);
          } else {
            setIsCalculating(false);
          }
          shownAtRef.current = null;
        } else {
          // No se llegó a mostrar — asegurar false
          setIsCalculating(false);
        }
      }
    },
    [],
  );

  const scheduleCalculation = useCallback(
    (key: string, fn: () => Promise<void>, delay = 150) => {
      const prev = timers.current.get(key);
      if (prev) clearTimeout(prev);
      const t = setTimeout(async () => {
        timers.current.delete(key);
        await setCalculating(fn);
      }, delay);
      timers.current.set(key, t);
    },
    [setCalculating],
  );

  const cancelAll = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    shownAtRef.current = null;
    setIsCalculating(false);
  }, []);

  return { isCalculating, setCalculating, scheduleCalculation, cancelAll };
}