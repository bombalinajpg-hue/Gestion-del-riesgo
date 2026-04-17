// context/RouteContext.tsx
import { Feature, FeatureCollection, Geometry } from 'geojson';
import React, { createContext, useContext, useEffect, useState } from 'react';
import rawblockedRoutesJson from '../data/blockedRoutes.json';
import { EmergencyType, RouteProfile, StartMode, StartPoint } from '../src/types/types';

type DestinationMode = 'selected' | 'closest';

const rawblockedRoutes = rawblockedRoutesJson as FeatureCollection<Geometry, { [key: string]: any }>;

interface Destination {
  id: number;
  nombre: string;
  tipo: string;
  lat: number;
  lng: number;
}

interface Institucion {
  id: number;
  nombre: string;
  tipo: string;
  lat: number;
  lng: number;
}

interface RouteContextType {
  // ✅ FIX 6 y 7: RouteProfile y StartMode pueden ser null (sin preselección)
  routeProfile: RouteProfile;
  setRouteProfile: React.Dispatch<React.SetStateAction<RouteProfile>>;
  startMode: StartMode;
  setStartMode: React.Dispatch<React.SetStateAction<StartMode>>;
  startPoint: StartPoint | null;
  setStartPoint: React.Dispatch<React.SetStateAction<StartPoint | null>>;
  selectedDestination: Destination | null;
  setSelectedDestination: React.Dispatch<React.SetStateAction<Destination | null>>;
  selectedInstitucion: Institucion | null;
  setSelectedInstitucion: React.Dispatch<React.SetStateAction<Institucion | null>>;
  emergencyType: EmergencyType;
  setEmergencyType: React.Dispatch<React.SetStateAction<EmergencyType>>;
  blockedRoutes: FeatureCollection;
  setBlockedRoutes: React.Dispatch<React.SetStateAction<FeatureCollection>>;
  destinationMode: DestinationMode;
  setDestinationMode: React.Dispatch<React.SetStateAction<DestinationMode>>;
  shouldCenterOnUser: boolean;
  setShouldCenterOnUser: React.Dispatch<React.SetStateAction<boolean>>;
  // ✅ FIX 4: señal para que MainMenu haga scroll a la sección de destinos
  shouldScrollToDestinos: boolean;
  setShouldScrollToDestinos: React.Dispatch<React.SetStateAction<boolean>>;
  instructivoTrigger: number;
  requestShowInstructivo: () => void;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export const RouteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ✅ FIX 6 y 7: inician en null → sin preselección
  const [routeProfile, setRouteProfile] = useState<RouteProfile>('foot-walking');
  const [startMode, setStartMode] = useState<StartMode>('gps');
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [selectedInstitucion, setSelectedInstitucion] = useState<Institucion | null>(null);
  const [emergencyType, setEmergencyType] = useState<EmergencyType>('ninguna');
  const [startPoint, setStartPoint] = useState<StartPoint | null>(null);
  const [destinationMode, setDestinationMode] = useState<DestinationMode>('selected');
  const [shouldCenterOnUser, setShouldCenterOnUser] = useState(false);
  const [shouldScrollToDestinos, setShouldScrollToDestinos] = useState(false);
  const [instructivoTrigger, setInstructivoTrigger] = useState(0);
  const requestShowInstructivo = () => setInstructivoTrigger((n) => n + 1);
  const [blockedRoutes, setBlockedRoutes] = useState<FeatureCollection>({
    type: 'FeatureCollection',
    features: []
  });

  useEffect(() => {
    setBlockedRoutes(rawblockedRoutes as FeatureCollection);
  }, []);

  // ✅ FIX 1: cuando emergencyType cambia a 'ninguna', limpia blockedRoutes → limpia polígonos
  useEffect(() => {
    if (emergencyType === 'ninguna') {
      setBlockedRoutes({ type: 'FeatureCollection', features: [] });
      return;
    }
    const filteredFeatures = rawblockedRoutes.features.filter(
      (feature: Feature<Geometry>) => feature.properties?.reason === emergencyType
    );
    setBlockedRoutes({ type: 'FeatureCollection', features: filteredFeatures });
  }, [emergencyType]);

  return (
    <RouteContext.Provider
      value={{
        routeProfile, setRouteProfile,
        startMode, setStartMode,
        startPoint, setStartPoint,
        selectedDestination, setSelectedDestination,
        selectedInstitucion, setSelectedInstitucion,
        emergencyType, setEmergencyType,
        blockedRoutes, setBlockedRoutes,
        destinationMode, setDestinationMode,
        shouldCenterOnUser, setShouldCenterOnUser,
        shouldScrollToDestinos, setShouldScrollToDestinos,
        instructivoTrigger, requestShowInstructivo,
      }}
    >
      {children}
    </RouteContext.Provider>
  );
};

export const useRouteContext = () => {
  const context = useContext(RouteContext);
  if (!context) throw new Error('useRouteContext must be used within a RouteProvider');
  return context;
};
