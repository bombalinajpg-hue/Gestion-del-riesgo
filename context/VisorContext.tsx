/**
 * VisorContext — estado del Visor geográfico que persiste entre
 * navegaciones de tab.
 *
 * Expo Router desmonta el componente del Visor cuando el usuario cambia
 * a otra tab (Inicio, Cuenta). Si el estado viviera como `useState`
 * local de `MapVisorContainer`, volvería a su default (todas las capas
 * en `false`) cada vez que el usuario regresa — comportamiento malo
 * reportado por la usuaria: "si agrego capas al visor y me voy para
 * inicio o cuenta, cuando vuelvo, la selección que tenía se borró".
 *
 * Con este context el estado vive encima del árbol (en `_layout.tsx`) y
 * sobrevive cuando la pantalla se desmonta. Al cerrar la app el
 * estado se pierde; eso es intencional — la próxima sesión arranca
 * limpio.
 *
 * Solo incluye toggles de visibilidad. Cosas ephímeras (panel abierto,
 * modal locked) siguen siendo `useState` local del componente.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { EmergencyType } from "../src/types/types";

interface SavedRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface VisorContextValue {
  showElementosExpuestos: boolean;
  showPrediosRiesgo: boolean;
  showPendiente: boolean;
  showPuntosEncuentro: boolean;
  showInstituciones: boolean;
  emergencyType: EmergencyType;
  /** Última región visible del mapa del Visor. Se persiste aquí (no
   *  en `useRef` local) para que al volver al tab el mapa arranque
   *  donde el usuario lo dejó, sin zoom animado molesto. */
  savedRegion: SavedRegion | null;
  /** true una vez que se forzó el centrado inicial (para evitar que
   *  el Google Maps SDK de Android haga el salto automático al GPS).
   *  Persistir este flag evita que en cada re-mount se repita la
   *  animación "zoom in a Santa Rosa". */
  hasForcedInitialCenter: boolean;
  setShowElementosExpuestos: (v: boolean) => void;
  setShowPrediosRiesgo: (v: boolean) => void;
  setShowPendiente: (v: boolean) => void;
  setShowPuntosEncuentro: (v: boolean) => void;
  setShowInstituciones: (v: boolean) => void;
  setEmergencyType: (v: EmergencyType) => void;
  setSavedRegion: (r: SavedRegion | null) => void;
  markForcedInitialCenterDone: () => void;
  /** Apaga todas las capas y resetea emergencia. Lo usa el botón
   *  "Limpiar mapa" del Visor. No toca la región guardada — si el
   *  usuario quiere volver a centrarse, el reset anima aparte. */
  resetAll: () => void;
}

const VisorContext = createContext<VisorContextValue | undefined>(undefined);

export function VisorProvider({ children }: { children: ReactNode }) {
  const [showElementosExpuestos, setShowElementosExpuestos] = useState(false);
  const [showPrediosRiesgo, setShowPrediosRiesgo] = useState(false);
  const [showPendiente, setShowPendiente] = useState(false);
  const [showPuntosEncuentro, setShowPuntosEncuentro] = useState(false);
  const [showInstituciones, setShowInstituciones] = useState(false);
  const [emergencyType, setEmergencyType] = useState<EmergencyType>("ninguna");
  const [savedRegion, setSavedRegion] = useState<SavedRegion | null>(null);
  const [hasForcedInitialCenter, setHasForcedInitialCenter] = useState(false);

  const markForcedInitialCenterDone = () => setHasForcedInitialCenter(true);

  const resetAll = () => {
    setShowElementosExpuestos(false);
    setShowPrediosRiesgo(false);
    setShowPendiente(false);
    setShowPuntosEncuentro(false);
    setShowInstituciones(false);
    setEmergencyType("ninguna");
  };

  const value = useMemo<VisorContextValue>(
    () => ({
      showElementosExpuestos,
      showPrediosRiesgo,
      showPendiente,
      showPuntosEncuentro,
      showInstituciones,
      emergencyType,
      savedRegion,
      hasForcedInitialCenter,
      setShowElementosExpuestos,
      setShowPrediosRiesgo,
      setShowPendiente,
      setShowPuntosEncuentro,
      setShowInstituciones,
      setEmergencyType,
      setSavedRegion,
      markForcedInitialCenterDone,
      resetAll,
    }),
    [
      showElementosExpuestos,
      showPrediosRiesgo,
      showPendiente,
      showPuntosEncuentro,
      showInstituciones,
      emergencyType,
      savedRegion,
      hasForcedInitialCenter,
    ],
  );

  return <VisorContext.Provider value={value}>{children}</VisorContext.Provider>;
}

export function useVisorContext(): VisorContextValue {
  const ctx = useContext(VisorContext);
  if (!ctx) {
    throw new Error("useVisorContext debe usarse dentro de VisorProvider");
  }
  return ctx;
}
