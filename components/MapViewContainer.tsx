/**
 * Componente principal del mapa
 * Gestiona ubicación, cálculo de rutas, validación de zonas bloqueadas
 * y renderizado del mapa con marcadores y polilíneas
 */

import { getRoute } from '@/src/services/openRouteService';
import polyline from '@mapbox/polyline';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Geojson, Marker, Polyline } from 'react-native-maps';
import { useRouteContext } from '../context/RouteContext';
import derrumbeData from '../data/amenaza_derrumbe.json';
import inundacionData from '../data/amenaza_inundacion.json';
import destinos from '../data/destinos.json';
import { routeIntersectsBlocked } from '../src/utils/geometry';
import { getDestinoMasCercano } from '../src/utils/getDestinoMasCercano';

type LatLngTuple = [number, number];

export default function MapViewContainer() {

  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [evacuando, setEvacuando] = useState(false);

  const {
    selectedDestination,
    blockedRoutes,
    routeProfile,
    shouldCalculateRoute,
    setShouldCalculateRoute,
    startMode,
    startPoint,
    setStartPoint,
    destinationMode,
    setDestinationMode,
    setSelectedDestination,
    emergencyType,
  } = useRouteContext();

  const derrumbeMedia = {
    ...derrumbeData,
    features: derrumbeData.features.filter(f => f.properties?.Categoria === "Media")
  } as any;

  const derrumbeAlta = {
    ...derrumbeData,
    features: derrumbeData.features.filter(f => f.properties?.Categoria === "Alta")
  } as any;

  const amenazaMedia = {
    ...inundacionData,
    features: inundacionData.features.filter(f => f.properties?.Categoria === "Media")
  } as any;

  const amenazaAlta = {
    ...inundacionData,
    features: inundacionData.features.filter(f => f.properties?.Categoria === "Alta")
  } as any;

  const navigation = useNavigation();

  /**
   * Seguimiento en tiempo real
   */
  useEffect(() => {
    let subscription: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita acceso a tu ubicación.');
        setLoading(false);
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 3,
        },
        (loc) => {
          setLocation(loc.coords);
          setLoading(false);
        }
      );
    })();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  /**
   * Consumo de ruta + detección de desviación
   */
  useEffect(() => {
    if (!location || routeCoords.length === 0) return;

    if (isOffRoute(location, routeCoords) && !isRecalculating) {
      console.log("Fuera de ruta, recalculando...");
      setIsRecalculating(true);
      setShouldCalculateRoute(true);
      return;
    }

    const remainingRoute = routeCoords.filter((coord) => {
      const distance = getDistance(
        location.latitude,
        location.longitude,
        coord.latitude,
        coord.longitude
      );
      return distance > 10;
    });

    setRouteCoords(remainingRoute);

    // Si llegó al destino
    if (remainingRoute.length < 3 && evacuando) {
      setEvacuando(false);
      Alert.alert('✅ Llegaste', 'Has llegado al punto de evacuación.');
    }

  }, [location]);

  /**
   * Limpia punto manual al cambiar a GPS
   */
  useEffect(() => {
    if (startMode === 'gps') setStartPoint(null);
  }, [startMode]);

  /**
   * Cálculo de ruta
   */
  useEffect(() => {
    if (!shouldCalculateRoute) return;
    if (!location) return;

    let finalDestination = selectedDestination;

    if (destinationMode === 'closest') {
      const userLocation =
        startMode === 'manual' && startPoint
          ? { latitude: startPoint.lat, longitude: startPoint.lng }
          : { latitude: location.latitude, longitude: location.longitude };

      finalDestination = getDestinoMasCercano(
        userLocation,
        destinos.filter(d => d.tipo === 'punto_encuentro')
      );

      if (!finalDestination) {
        setShouldCalculateRoute(false);
        setIsRecalculating(false);
        return;
      }
    }

    if (!finalDestination) {
      setShouldCalculateRoute(false);
      setIsRecalculating(false);
      return;
    }

    const start: [number, number] =
      startMode === 'manual' && startPoint
        ? [startPoint.lng, startPoint.lat]
        : [location.longitude, location.latitude];

    const end: [number, number] = [
      finalDestination.lng,
      finalDestination.lat,
    ];

    const relevantBlockedRoutes = {
      ...blockedRoutes,
      features: blockedRoutes.features.filter(
        (f) => !f.properties?.profile || f.properties.profile === routeProfile
      ),
    };

    getRoute(start, end, routeProfile, relevantBlockedRoutes)
      .then((route) => {
        const encodedPolyline = route.routes[0]?.geometry;
        if (!encodedPolyline) throw new Error('No geometry');

        const coords = (polyline.decode(encodedPolyline) as LatLngTuple[])
          .map(([lat, lng]) => ({
            latitude: lat,
            longitude: lng,
          }));

        if (routeIntersectsBlocked(coords, relevantBlockedRoutes)) {
          setRouteCoords([]);
        } else {
          setRouteCoords(coords);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!isRecalculating) {
          Alert.alert('Error', 'No se pudo calcular la ruta.');
        }
      })
      .finally(() => {
        setShouldCalculateRoute(false);
        setIsRecalculating(false);
      });

  }, [shouldCalculateRoute]);

  /**
   * Iniciar evacuación desde botón flotante
   */
  const handleIniciarEvacuacion = () => {
    if (!location) {
      Alert.alert('Sin ubicación', 'Esperando señal GPS...');
      return;
    }
    setEvacuando(true);
    setDestinationMode('closest');
    setSelectedDestination(null);
    setShouldCalculateRoute(true);
  };

  /**
   * Cancelar evacuación
   */
  const handleCancelarEvacuacion = () => {
    setEvacuando(false);
    setRouteCoords([]);
  };

  if (loading || !location)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ef476f" />
        <Text style={{ marginTop: 12, color: '#073b4c', fontWeight: '600' }}>
          Obteniendo ubicación...
        </Text>
      </View>
    );

  return (
    <View style={styles.container}>

      {/* Botón menú */}
      <TouchableOpacity
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        style={styles.menuButton}
      >
        <Text style={{ fontSize: 24 }}>☰</Text>
      </TouchableOpacity>

      {/* Banner de recalculando */}
      {isRecalculating && (
        <View style={styles.recalculatingBanner}>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.recalculatingText}>Recalculando ruta...</Text>
        </View>
      )}

      {/* Banner evacuando */}
      {evacuando && !isRecalculating && routeCoords.length > 0 && (
        <View style={styles.evacuandoBanner}>
          <Text style={styles.evacuandoText}>🚨 Dirigiéndote al punto seguro</Text>
        </View>
      )}

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
        showsMyLocationButton
        onPress={(e) => {
          if (startMode !== 'manual') return;
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setStartPoint({ lat: latitude, lng: longitude });
        }}
      >

        {/* Ruta activa */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#2196f3"
            strokeWidth={4}
          />
        )}

        {/* Inundación */}
        {emergencyType === "inundacion" && (
          <>
            <Geojson
              geojson={amenazaMedia}
              strokeColor="rgba(255,165,0,0.3)"
              fillColor="rgba(255,165,0,0.08)"
              strokeWidth={1}
            />
            <Geojson
              geojson={amenazaAlta}
              strokeColor="rgba(255,0,0,0.3)"
              fillColor="rgba(255,0,0,0.08)"
              strokeWidth={1}
            />
          </>
        )}

        {/* Derrumbe */}
        {emergencyType === "derrumbe" && (
          <>
            <Geojson
              geojson={derrumbeMedia}
              strokeColor="rgba(255,140,0,0.4)"
              fillColor="rgba(255,140,0,0.1)"
              strokeWidth={1}
            />
            <Geojson
              geojson={derrumbeAlta}
              strokeColor="rgba(139,0,0,0.5)"
              fillColor="rgba(139,0,0,0.15)"
              strokeWidth={1}
            />
          </>
        )}

        {/* Punto inicial manual */}
        {startMode === 'manual' && startPoint && (
          <Marker
            coordinate={{
              latitude: startPoint.lat,
              longitude: startPoint.lng,
            }}
            title="Punto inicial"
            pinColor="orange"
          />
        )}

      </MapView>

      {/* Botón flotante INICIAR EVACUACIÓN */}
      {!evacuando ? (
        <TouchableOpacity
          style={styles.evacuarButton}
          onPress={handleIniciarEvacuacion}
        >
          <Text style={styles.evacuarButtonText}>🚨 INICIAR EVACUACIÓN</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.cancelarButton}
          onPress={handleCancelarEvacuacion}
        >
          <Text style={styles.cancelarButtonText}>✕ CANCELAR EVACUACIÓN</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isOffRoute = (
  location: Location.LocationObjectCoords,
  routeCoords: { latitude: number; longitude: number }[]
) => {
  let minDistance = Infinity;
  for (let coord of routeCoords) {
    const distance = getDistance(
      location.latitude, location.longitude,
      coord.latitude, coord.longitude
    );
    if (distance < minDistance) minDistance = distance;
  }
  return minDistance > 25;
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  menuButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: '#ffffffee',
    padding: 10,
    borderRadius: 10,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  recalculatingBanner: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: '#118ab2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  recalculatingText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  evacuandoBanner: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: '#073b4c',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  evacuandoText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  evacuarButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#ef476f',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: '#ef476f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  evacuarButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  cancelarButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#073b4c',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    elevation: 8,
  },
  cancelarButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
