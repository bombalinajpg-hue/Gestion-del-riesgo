/**
 * Hook que maneja el pipeline "quick route" disparado desde HomeScreen
 * (y, por compat, desde cualquier caller que active `quickRouteMode`).
 *
 * Versión v4.5 — las TRES preguntas (emergencia, origen, destino) ya se
 * resolvieron en `QuickEvacuateSheet` antes de llegar al mapa. Acá ya
 * no hay Alerts: el flujo es determinístico según `pendingDestKind`.
 *
 * Dos efectos disjuntos, cada uno con su ref de un solo disparo para
 * que no se re-ejecuten al re-renderizar:
 *
 *  A. GPS (autoRoute=1 + startMode=gps): apenas hay location+graphReady:
 *     - pendingDestKind = "closest"  → dispara calcularRuta(true)
 *     - pendingDestKind = "heatmap"  → activa iso overlay + picking
 *     - pendingDestKind = "instituciones" → activa overlay instituciones
 *
 *     Para los dos últimos el usuario debe tocar el destino en el mapa,
 *     lo que aterriza en Case C.
 *
 *  C. Destino elegido en quickRouteMode (vía picker o auto-selección):
 *     dispara calcularRuta(true) inmediato — sin Alert intermedio.
 *
 * Nota: Case B (pickeo manual del origen) desapareció. La confirmación
 * del punto de inicio y el branching por destino viven en
 * MapViewContainer, en el onPress del botón CONFIRMAR PUNTO.
 */

import { useEffect, useRef } from "react";
import type { DestinoFinal, Destino, Institucion, StartMode } from "../types/types";
import type { EmergencyType } from "../types/graph";
import type { PendingDestKind } from "../../context/RouteContext";

type DestinationMode = "closest" | "manual";

export interface UseQuickRoutePipelineParams {
  quickRouteMode: boolean;
  setQuickRouteMode: (v: boolean) => void;
  autoRouteParam: string | undefined;
  graphReady: boolean;
  location: { latitude: number; longitude: number } | null;
  startMode: StartMode;
  startPoint: { lat: number; lng: number } | null;
  puntoConfirmado: boolean;
  emergencyType: EmergencyType;
  evacuando: boolean;
  destinoFinal: DestinoFinal | null;
  selectedDestination: Destino | null;
  selectedInstitucion: Institucion | null;
  destinationMode: DestinationMode;
  pickingFromIsochroneMap: boolean;
  showingInstitucionesOverlay: boolean;
  pendingDestKind: PendingDestKind;
  setPendingDestKind: (v: PendingDestKind) => void;
  setDestinationMode: (m: DestinationMode) => void;
  setPickingFromIsochroneMap: (v: boolean) => void;
  setShowingInstitucionesOverlay: (v: boolean) => void;
  setShowIsochroneOverlay: (v: boolean) => void;
  setPuntoConfirmado: (v: boolean) => void;
  setStreetViewVisible: (v: boolean) => void;
  calcularRuta: (markAsEvacuando: boolean) => Promise<void>;
  setCalculating: (fn: () => Promise<void>) => Promise<void>;
  openGoogleMaps: () => void;
}

export function useQuickRoutePipeline(params: UseQuickRoutePipelineParams) {
  const {
    quickRouteMode, setQuickRouteMode,
    autoRouteParam, graphReady, location,
    startMode, puntoConfirmado, emergencyType, evacuando,
    destinoFinal, selectedDestination, selectedInstitucion,
    pickingFromIsochroneMap, showingInstitucionesOverlay,
    pendingDestKind, setPendingDestKind,
    setPickingFromIsochroneMap,
    setShowingInstitucionesOverlay, setShowIsochroneOverlay,
    setPuntoConfirmado,
    calcularRuta, setCalculating,
  } = params;

  const autoRouteFiredRef = useRef(false);
  const actionFiredRef = useRef(false);
  // Dos formas de rearmar los refs de "un solo disparo":
  //   1. Transición OFF→ON de `quickRouteMode` — el caso normal.
  //   2. La función `arm()` devuelta abajo — la llaman los handlers
  //      que activan el flujo (Home.handleQuickEvacuate y
  //      MapView.handleLocalEvacuate) para cubrir el edge case en el
  //      que `quickRouteMode` ya está true pero el usuario pidió otra
  //      evacuación (por ejemplo, tras un error en la primera). Sin
  //      esto, los refs quedan marcados y el pipeline no vuelve a
  //      disparar.
  const prevQRMRef = useRef(false);
  useEffect(() => {
    if (!prevQRMRef.current && quickRouteMode) {
      autoRouteFiredRef.current = false;
      actionFiredRef.current = false;
    }
    prevQRMRef.current = quickRouteMode;
  }, [quickRouteMode]);

  // Refs para que el closure no capture calcularRuta viejo. Los handlers
  // se recrean cada render cuando sus inputs cambian; sin este truco el
  // efecto dispararía con una versión stale.
  const handlersRef = useRef({ calcularRuta, setCalculating });
  handlersRef.current = { calcularRuta, setCalculating };

  // Case A — GPS + autoRoute=1: el punto de inicio se toma del fix del
  // GPS sin pedir confirmación. El branching por destino se hace acá
  // porque no hay botón CONFIRMAR PUNTO intermedio (ese solo aparece
  // en modo manual).
  useEffect(() => {
    if (autoRouteFiredRef.current) return;
    if (!quickRouteMode) return;
    if (autoRouteParam !== "1") return;
    if (!graphReady || !location) return;
    if (startMode !== "gps") return;
    if (evacuando) return;
    autoRouteFiredRef.current = true;
    setPuntoConfirmado(true);

    if (pendingDestKind === "heatmap") {
      setPickingFromIsochroneMap(true);
      setShowIsochroneOverlay(true);
      setPendingDestKind(null);
      // quickRouteMode se conserva: lo apagaremos en Case C cuando
      // el usuario elija destino y dispare el cálculo.
      return;
    }
    if (pendingDestKind === "instituciones") {
      setShowingInstitucionesOverlay(true);
      setPendingDestKind(null);
      return;
    }

    // Default (closest o null): auto-calc inmediato. Pequeño delay para
    // dejar que el mapa termine su primer frame; sin esto, la ruta se
    // pinta antes de que la cámara termine de centrar al usuario.
    const t = setTimeout(() => {
      const h = handlersRef.current;
      h.setCalculating(() => h.calcularRuta(true));
      setQuickRouteMode(false);
      setPendingDestKind(null);
    }, 350);
    return () => clearTimeout(t);
    // setQuickRouteMode es estable (viene de setState del context); los
    // handlers van por ref. El resto son las dependencias reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRouteMode, autoRouteParam, graphReady, location, startMode, emergencyType, evacuando, pendingDestKind]);

  // Case C — destino elegido dentro de quickRouteMode: auto-calc.
  // Reemplaza el Alert "¿qué quieres hacer?" anterior porque en el nuevo
  // flujo la acción es siempre "iniciar ruta" — las demás (Google Maps,
  // 360°) ya están accesibles como botones flotantes junto al destino.
  //
  // Requiere graphReady+location porque calcularRuta retorna early sin
  // ellos — y si dejamos que el ref de un solo disparo se marque antes
  // de que el cálculo sea posible, el flujo queda bloqueado.
  //
  // En modo manual el usuario debe confirmar explícitamente su punto de
  // inicio antes de que Case C dispare: si arranca apenas hay
  // `destinoFinal`, el cálculo usa el GPS e ignora la elección manual
  // del origen (bug reportado al abrir /map desde el Visor con "Elegir
  // en el mapa": el GPS resolvía y la ruta salía sola antes del tap).
  // Por eso el guard bloquea Case C solo mientras `puntoConfirmado`
  // sigue en false — una vez el usuario toca "Confirmar punto de
  // inicio" (o Case A auto-confirma en GPS), Case C corre normal y
  // dispara el cálculo al elegir destino en heatmap/instituciones.
  useEffect(() => {
    if (actionFiredRef.current) return;
    if (!quickRouteMode) return;
    if (startMode === "manual" && !puntoConfirmado) return;
    if (!destinoFinal) return;
    if (evacuando) return;
    if (!graphReady || !location) return;
    if (!pickingFromIsochroneMap && !showingInstitucionesOverlay &&
        !selectedDestination && !selectedInstitucion) return;
    actionFiredRef.current = true;
    const t = setTimeout(() => {
      const h = handlersRef.current;
      h.setCalculating(() => h.calcularRuta(true));
      setQuickRouteMode(false);
      setPendingDestKind(null);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRouteMode, startMode, puntoConfirmado, destinoFinal, evacuando, graphReady, location, selectedDestination, selectedInstitucion]);

  /** Rearma explícitamente los refs de "un solo disparo". Los handlers
   *  que activan el flujo rápido deben llamarlo ANTES de
   *  `setQuickRouteMode(true)` para garantizar una activación limpia,
   *  incluso si el flag ya estaba en true por un intento anterior
   *  (caso típico: la primera evacuación falló y el usuario pide
   *  otra sin pasar por un reset intermedio).
   */
  const arm = () => {
    autoRouteFiredRef.current = false;
    actionFiredRef.current = false;
  };

  return { arm };
}
