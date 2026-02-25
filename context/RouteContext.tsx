// context/RouteContext.tsx
/**
 * Context para manejo global del estado de rutas y navegación
 * Gestiona configuración de rutas, puntos de inicio/destino, tipo de emergencia
 * y zonas bloqueadas cargadas desde archivo JSON
 */

import { Feature, FeatureCollection, Geometry } from 'geojson';
import React, { createContext, useContext, useEffect, useState } from 'react';
import rawblockedRoutesJson from '../data/blockedRoutes.json';
import { EmergencyType, RouteProfile, StartMode, StartPoint } from '../src/types/types';

/** Modo de selección de destino: específico o más cercano */
type DestinationMode = 'selected' | 'closest';

/** Carga inicial de rutas bloqueadas desde JSON */
const rawblockedRoutes = rawblockedRoutesJson as FeatureCollection<Geometry, { [key: string]: any }>;

/** Estructura de un destino en el mapa */
interface Destination {
    id: number;
    nombre: string;
    tipo: string;
    lat: number;
    lng: number;
}

/** Tipo del contexto con todos los estados y setters de la aplicación */
interface RouteContextType {
    routeProfile: RouteProfile;
    setRouteProfile: React.Dispatch<React.SetStateAction<RouteProfile>>;
    startMode: StartMode;
    setStartMode: React.Dispatch<React.SetStateAction<StartMode>>;
    startPoint: StartPoint | null;
    setStartPoint: React.Dispatch<React.SetStateAction<StartPoint | null>>;
    shouldCalculateRoute: boolean;
    setShouldCalculateRoute: React.Dispatch<React.SetStateAction<boolean>>;
    selectedDestination: Destination | null;
    setSelectedDestination: React.Dispatch<React.SetStateAction<Destination | null>>;
    emergencyType: EmergencyType;
    setEmergencyType: React.Dispatch<React.SetStateAction<EmergencyType>>;
    blockedRoutes: FeatureCollection;
    setBlockedRoutes: React.Dispatch<React.SetStateAction<FeatureCollection>>;
    destinationMode: DestinationMode;
    setDestinationMode: React.Dispatch<React.SetStateAction<DestinationMode>>;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

/**
 * Provider del contexto de rutas
 * Inicializa estados y maneja filtrado de zonas bloqueadas según tipo de emergencia
 */
export const RouteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [routeProfile, setRouteProfile] = useState<RouteProfile>('foot-walking');
    const [shouldCalculateRoute, setShouldCalculateRoute] = useState(false);
    const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
    const [emergencyType, setEmergencyType] = useState<EmergencyType>('ninguna');
    const [startMode, setStartMode] = useState<StartMode>('gps');
    const [startPoint, setStartPoint] = useState<StartPoint | null>(null);
    const [destinationMode, setDestinationMode] = useState<DestinationMode>('selected');
    const [blockedRoutes, setBlockedRoutes] = useState<FeatureCollection>({
        type: 'FeatureCollection',
        features: []
    });

    /**
     * Carga inicial de todas las rutas bloqueadas desde el JSON
     * Se ejecuta una sola vez al montar el componente
     */
    useEffect(() => {
        setBlockedRoutes(rawblockedRoutes as FeatureCollection);
        console.log('Zonas bloqueadas cargadas en el contexto:', rawblockedRoutes);
    }, []);

    /**
     * Filtra rutas bloqueadas según el tipo de emergencia seleccionado
     * Si no hay emergencia, limpia las zonas bloqueadas
     * Si hay emergencia, filtra features que coincidan con el tipo
     */
    useEffect(() => {
        if (emergencyType === 'ninguna') {
            setBlockedRoutes({
                type: 'FeatureCollection',
                features: []
            });
            return;
        }

        const filteredFeatures = rawblockedRoutes.features.filter(
            (feature: Feature<Geometry>) => feature.properties?.reason === emergencyType
        );
        const filteredCollection: FeatureCollection = {
            type: 'FeatureCollection',
            features: filteredFeatures
        };

        setBlockedRoutes(filteredCollection);
        console.log(`🚨 Rutas bloqueadas por ${emergencyType} cargadas`, filteredCollection);
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
                shouldCalculateRoute,
                setShouldCalculateRoute,
                selectedDestination,
                setSelectedDestination,
                emergencyType,
                setEmergencyType,
                blockedRoutes,
                setBlockedRoutes,
                destinationMode,
                setDestinationMode,
            }}
        >
            {children}
        </RouteContext.Provider>
    );
};

/**
 * Hook personalizado para acceder al RouteContext
 * @throws Error si se usa fuera del RouteProvider
 * @returns Objeto con todos los estados y setters del contexto
 */
export const useRouteContext = () => {
    const context = useContext(RouteContext);
    if (!context) {
        throw new Error('useRouteContext must be used within a RouteProvider');
    }
    return context;
};