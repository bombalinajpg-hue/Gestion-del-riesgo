// context/RouteContext.tsx
import { Feature, FeatureCollection, Geometry } from "geojson";
import React, { createContext, useContext, useEffect, useState } from "react";
import rawblockedRoutesJson from "../data/blockedRoutes.json";
import {
  Destino,
  EmergencyType,
  Institucion,
  RouteProfile,
  StartMode,
  StartPoint,
} from "../src/types/types";

type DestinationMode = "manual" | "closest";
// ★ v4.5: elección de "destino preferido" que se hace en la encuesta
// de QuickEvacuate ANTES de llegar al mapa. Se aplica cuando el usuario
// confirma el punto de inicio manualmente (Case B del pipeline).
//   · closest       → ruta directa al refugio más cercano (auto-calc)
//   · heatmap       → activa isócronas y deja picking en el mapa
//   · instituciones → activa overlay de instituciones y deja picking
export type PendingDestKind = "closest" | "heatmap" | "instituciones" | null;

const rawblockedRoutes = rawblockedRoutesJson as FeatureCollection<
  Geometry,
  { [key: string]: any }
>;

interface RouteContextType {
  routeProfile: RouteProfile;
  setRouteProfile: React.Dispatch<React.SetStateAction<RouteProfile>>;
  startMode: StartMode;
  setStartMode: React.Dispatch<React.SetStateAction<StartMode>>;
  startPoint: StartPoint | null;
  setStartPoint: React.Dispatch<React.SetStateAction<StartPoint | null>>;
  selectedDestination: Destino | null;
  setSelectedDestination: React.Dispatch<
    React.SetStateAction<Destino | null>
  >;
  selectedInstitucion: Institucion | null;
  setSelectedInstitucion: React.Dispatch<
    React.SetStateAction<Institucion | null>
  >;
  emergencyType: EmergencyType;
  setEmergencyType: React.Dispatch<React.SetStateAction<EmergencyType>>;
  blockedRoutes: FeatureCollection;
  setBlockedRoutes: React.Dispatch<React.SetStateAction<FeatureCollection>>;
  destinationMode: DestinationMode;
  setDestinationMode: React.Dispatch<React.SetStateAction<DestinationMode>>;
  shouldCenterOnUser: boolean;
  setShouldCenterOnUser: React.Dispatch<React.SetStateAction<boolean>>;
  shouldScrollToDestinos: boolean;
  setShouldScrollToDestinos: React.Dispatch<React.SetStateAction<boolean>>;
  instructivoTrigger: number;
  requestShowInstructivo: () => void;
  // ★ v4.2: modo "elegir destino desde el mapa con isócronas"
  pickingFromIsochroneMap: boolean;
  setPickingFromIsochroneMap: React.Dispatch<React.SetStateAction<boolean>>;
  // ★ v4.2: mostrar instituciones como overlay en el mapa
  showingInstitucionesOverlay: boolean;
  setShowingInstitucionesOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  // ★ v4.4: flujo rápido desde EmergencyScreen — guía al usuario paso a
  // paso (tipo emergencia → origen → método de destino → ruta) con
  // prompts automáticos en /map. Se limpia al completar o cancelar.
  quickRouteMode: boolean;
  setQuickRouteMode: React.Dispatch<React.SetStateAction<boolean>>;
  // ★ v4.5: destino preelegido desde la encuesta QuickEvacuate. Se
  // lee en MapViewContainer al confirmar el punto de inicio manual
  // para decidir si auto-calcular ruta o abrir picker (heatmap /
  // instituciones).
  pendingDestKind: PendingDestKind;
  setPendingDestKind: React.Dispatch<React.SetStateAction<PendingDestKind>>;
  /** Limpia TODO el estado a valores por defecto. Se llama al hacer
   *  logout para que el siguiente usuario del mismo dispositivo no
   *  vea rastros (destino, emergencia, punto, etc.) del anterior. */
  resetAll: () => void;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export const RouteProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [routeProfile, setRouteProfile] =
    useState<RouteProfile>("foot-walking");
  const [startMode, setStartMode] = useState<StartMode>("gps");
  const [selectedDestination, setSelectedDestination] =
    useState<Destino | null>(null);
  const [selectedInstitucion, setSelectedInstitucion] =
    useState<Institucion | null>(null);
  const [emergencyType, setEmergencyType] = useState<EmergencyType>("ninguna");
  const [startPoint, setStartPoint] = useState<StartPoint | null>(null);
  const [destinationMode, setDestinationMode] =
    useState<DestinationMode>("closest");
  const [shouldCenterOnUser, setShouldCenterOnUser] = useState(false);
  const [shouldScrollToDestinos, setShouldScrollToDestinos] = useState(false);
  const [instructivoTrigger, setInstructivoTrigger] = useState(0);
  const requestShowInstructivo = () => setInstructivoTrigger((n) => n + 1);
  const [blockedRoutes, setBlockedRoutes] = useState<FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [pickingFromIsochroneMap, setPickingFromIsochroneMap] = useState(false);
  const [showingInstitucionesOverlay, setShowingInstitucionesOverlay] = useState(false);
  const [quickRouteMode, setQuickRouteMode] = useState(false);
  const [pendingDestKind, setPendingDestKind] = useState<PendingDestKind>(null);

  useEffect(() => {
    setBlockedRoutes(rawblockedRoutes as FeatureCollection);
  }, []);

  // Reset completo del contexto. Deliberadamente no borra la lista de
  // blockedRoutes inicial (es data estática del municipio, no depende
  // del usuario) — el useEffect de emergencyType la re-filtrará.
  const resetAll = () => {
    setRouteProfile("foot-walking");
    setStartMode("gps");
    setStartPoint(null);
    setSelectedDestination(null);
    setSelectedInstitucion(null);
    setEmergencyType("ninguna");
    setDestinationMode("closest");
    setShouldCenterOnUser(false);
    setShouldScrollToDestinos(false);
    setPickingFromIsochroneMap(false);
    setShowingInstitucionesOverlay(false);
    setQuickRouteMode(false);
    setPendingDestKind(null);
  };

  useEffect(() => {
    if (emergencyType === "ninguna") {
      setBlockedRoutes({ type: "FeatureCollection", features: [] });
      return;
    }
    const filteredFeatures = rawblockedRoutes.features.filter(
      (feature: Feature<Geometry>) =>
        feature.properties?.reason === emergencyType,
    );
    setBlockedRoutes({ type: "FeatureCollection", features: filteredFeatures });
  }, [emergencyType]);

  return (
    <RouteContext.Provider
      value={{
        routeProfile,
        setRouteProfile,
        startMode,
        setStartMode,
        startPoint,
        setStartPoint,
        selectedDestination,
        setSelectedDestination,
        selectedInstitucion,
        setSelectedInstitucion,
        emergencyType,
        setEmergencyType,
        blockedRoutes,
        setBlockedRoutes,
        destinationMode,
        setDestinationMode,
        shouldCenterOnUser,
        setShouldCenterOnUser,
        shouldScrollToDestinos,
        setShouldScrollToDestinos,
        instructivoTrigger,
        requestShowInstructivo,
        pickingFromIsochroneMap,
        setPickingFromIsochroneMap,
        showingInstitucionesOverlay,
        setShowingInstitucionesOverlay,
        quickRouteMode,
        setQuickRouteMode,
        pendingDestKind,
        setPendingDestKind,
        resetAll,
      }}
    >
      {children}
    </RouteContext.Provider>
  );
};

export const useRouteContext = () => {
  const context = useContext(RouteContext);
  if (!context)
    throw new Error("useRouteContext must be used within a RouteProvider");
  return context;
};