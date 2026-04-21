/**
 * Hook que maneja el pipeline "quick route" disparado desde EmergencyScreen.
 *
 * Tres casos disjuntos, cada uno con un ref de un solo disparo para que el
 * Alert/cálculo no se re-dispare al re-renderizar:
 *
 *  A. Desde mi ubicación (autoRoute=1 + startMode=gps + destinationMode=closest):
 *     en cuanto location+graphReady están listos y la emergencia elegida,
 *     dispara calcularRuta(true) y sale del modo.
 *
 *  B. Elegir en el mapa (startMode=manual, tras tocar el mapa): auto-confirma
 *     puntoConfirmado y abre un Alert con los 3 métodos de destino (cercano /
 *     heatmap / instituciones).
 *
 *  C. Destino elegido en quickRouteMode (por cualquier vía): abre un Alert
 *     con acciones (Iniciar / Google Maps / Vista 360°).
 *
 * Cancelar en cualquier Alert debe SIEMPRE salir de quickRouteMode (sin esto
 * el flag se pegaba y bloqueaba flujos posteriores).
 */

import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import type { DestinoFinal, Destino, Institucion, StartMode } from "../types/types";
import type { EmergencyType } from "../types/graph";

type DestinationMode = "closest" | "manual";

export interface UseQuickRoutePipelineParams {
  quickRouteMode: boolean;
  setQuickRouteMode: (v: boolean) => void;
  autoRouteParam: string | undefined;
  graphReady: boolean;
  location: { latitude: number; longitude: number } | null;
  startMode: StartMode;
  startPoint: { lat: number; lng: number } | null;
  emergencyType: EmergencyType;
  evacuando: boolean;
  destinoFinal: DestinoFinal | null;
  selectedDestination: Destino | null;
  selectedInstitucion: Institucion | null;
  destinationMode: DestinationMode;
  pickingFromIsochroneMap: boolean;
  showingInstitucionesOverlay: boolean;
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
    startMode, startPoint, emergencyType, evacuando,
    destinoFinal, selectedDestination, selectedInstitucion,
    destinationMode,
    pickingFromIsochroneMap, showingInstitucionesOverlay,
    setDestinationMode, setPickingFromIsochroneMap,
    setShowingInstitucionesOverlay, setShowIsochroneOverlay,
    setPuntoConfirmado, setStreetViewVisible,
    calcularRuta, setCalculating, openGoogleMaps,
  } = params;

  const autoRouteFiredRef = useRef(false);
  const destMethodAskedRef = useRef(false);
  const actionAskedRef = useRef(false);

  // Refs para inputs que las closures del Alert leen — así evitamos que el
  // Alert capture valores viejos de `calcularRuta` / `openGoogleMaps` (que
  // se re-crean cada render).
  const handlersRef = useRef({ calcularRuta, setCalculating, openGoogleMaps });
  handlersRef.current = { calcularRuta, setCalculating, openGoogleMaps };

  // Caso A — autoRoute desde GPS. Permite `emergencyType === "ninguna"`
  // para el flujo panic (aún no lanzado desde acá, pero por consistencia
  // con Case B y para no sorprender si HomeScreen agrega un path GPS sin
  // elegir emergencia).
  useEffect(() => {
    if (autoRouteFiredRef.current) return;
    if (!quickRouteMode) return;
    if (autoRouteParam !== "1") return;
    if (!graphReady || !location) return;
    if (startMode !== "gps") return;
    if (evacuando) return;
    autoRouteFiredRef.current = true;
    const t = setTimeout(() => {
      const h = handlersRef.current;
      h.setCalculating(() => h.calcularRuta(true));
      setQuickRouteMode(false);
    }, 350);
    return () => clearTimeout(t);
    // setQuickRouteMode es estable (viene de setState del context); los
    // handlers van por ref. El resto son las dependencias reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRouteMode, autoRouteParam, graphReady, location, startMode, emergencyType, evacuando]);

  // Caso B — pickeo manual: auto-confirma el punto de inicio y:
  //   · Si el caller ya fijó `destinationMode === "closest"` (flujo panic
  //     desde el FAB EVACUAR del Home), calcula inmediato sin preguntar
  //     método de destino — "más cercano" ya fue la elección implícita.
  //   · Si `destinationMode === "manual"` (flujo clásico desde
  //     EmergencyScreen), muestra el Alert con los 3 métodos para que
  //     el usuario decida.
  //
  // `emergencyType === "ninguna"` ya no bloquea: el nuevo flujo panic
  // permite disparar sin amenaza (ruta más corta sin penalización).
  useEffect(() => {
    if (destMethodAskedRef.current) return;
    if (!quickRouteMode) return;
    if (startMode !== "manual") return;
    if (!startPoint) return;
    destMethodAskedRef.current = true;
    setPuntoConfirmado(true);

    if (destinationMode === "closest") {
      // Sin delay: el delay existía para dejar terminar la animación del
      // Alert de método, pero este branch no abre Alert — va directo a
      // calcular. Cualquier delay aquí produce un parpadeo donde
      // CONFIRMAR PUNTO o CALCULAR RUTA asoman un instante.
      const h = handlersRef.current;
      h.setCalculating(() => h.calcularRuta(true));
      setQuickRouteMode(false);
      return;
    }

    const t = setTimeout(() => {
      Alert.alert(
        "¿Cómo eliges el destino?",
        "Selecciona el método para llegar al lugar seguro.",
        [
          {
            text: "🏁 Punto más cercano",
            onPress: () => {
              const h = handlersRef.current;
              setDestinationMode("closest");
              h.setCalculating(() => h.calcularRuta(true));
              setQuickRouteMode(false);
            },
          },
          {
            text: "🔥 Mapa de calor",
            onPress: () => {
              setDestinationMode("manual");
              setPickingFromIsochroneMap(true);
              setShowIsochroneOverlay(true);
            },
          },
          {
            text: "🏥 Instituciones",
            onPress: () => {
              setDestinationMode("manual");
              setShowingInstitucionesOverlay(true);
            },
          },
          {
            text: "Cancelar",
            style: "cancel",
            onPress: () => setQuickRouteMode(false),
          },
        ],
      );
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRouteMode, startMode, startPoint, emergencyType, destinationMode]);

  // Caso C — destino elegido: ofrece acciones
  useEffect(() => {
    if (actionAskedRef.current) return;
    if (!quickRouteMode) return;
    if (!destinoFinal) return;
    if (evacuando) return;
    if (!pickingFromIsochroneMap && !showingInstitucionesOverlay &&
        !selectedDestination && !selectedInstitucion) return;
    actionAskedRef.current = true;
    const t = setTimeout(() => {
      Alert.alert(
        `→ ${destinoFinal.nombre}`,
        "¿Qué quieres hacer?",
        [
          {
            text: "🏃 Iniciar ruta de evacuación",
            onPress: () => {
              const h = handlersRef.current;
              h.setCalculating(() => h.calcularRuta(true));
              setQuickRouteMode(false);
            },
          },
          {
            text: "🗺️ Calcular con Google Maps",
            onPress: () => {
              handlersRef.current.openGoogleMaps();
              setQuickRouteMode(false);
            },
          },
          {
            text: "📷 Vista 360°",
            onPress: () => {
              setStreetViewVisible(true);
              setQuickRouteMode(false);
            },
          },
          {
            text: "Cancelar",
            style: "cancel",
            // Sin este onPress el flag `quickRouteMode` se queda true y
            // bloquea silenciosamente "Confirmar punto de inicio" en
            // flujos posteriores.
            onPress: () => setQuickRouteMode(false),
          },
        ],
      );
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRouteMode, destinoFinal, evacuando, selectedDestination, selectedInstitucion]);
}
