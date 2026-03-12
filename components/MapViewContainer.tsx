/**
 * Componente principal del mapa
 * Gestiona ubicaciÃ³n, cÃ¡lculo de rutas, validaciÃ³n de zonas bloqueadas
 * y renderizado del mapa con marcadores y polilÃ­neas
 */

import { getRoute } from '@/src/services/openRouteService';
import polyline from '@mapbox/polyline';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Geojson, Marker, Polyline } from 'react-native-maps';
import { useRouteContext } from '../context/RouteContext';
import avenidaTorrencialData from '../data/amenaza_avenida_torrencial.json';
import InundacionData from '../data/amenaza_inundacion.json';
import movimientoMasaData from '../data/amenaza_movimiento_en_masa.json';
import destinos from '../data/destinos.json';
import { getDestinoMasCercano } from '../src/utils/getDestinoMasCercano';

type LatLngTuple = [number, number];

export default function MapViewContainer() {

  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [evacuando, setEvacuando] = useState(false);
  const [destinoFinal, setDestinoFinal] = useState<any>(null);
  const [alertaDangerMostrada, setAlertaDangerMostrada] = useState(false);

  const {
    selectedDestination,
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

  // â”€â”€ Movimiento en masa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const mmBaja = {
    ...movimientoMasaData,
    features: movimientoMasaData.features.filter(f => f.properties?.Categoria === "Baja")
  } as any;

  const mmMedia = {
    ...movimientoMasaData,
    features: movimientoMasaData.features.filter(f => f.properties?.Categoria === "Media")
  } as any;

  const mmAlta = {
    ...movimientoMasaData,
    features: movimientoMasaData.features.filter(f => f.properties?.Categoria === "Alta")
  } as any;

  // â”€â”€ InundaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const InundacionMedia = {
    ...InundacionData,
    features: InundacionData.features.filter(f => f.properties?.Categoria === "Media")
  } as any;

  const InundacionAlta = {
    ...InundacionData,
    features: InundacionData.features.filter(f => f.properties?.Categoria === "Alta")
  } as any;

  // â”€â”€ Avenida torrencial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const avenidaMedia = {
    ...avenidaTorrencialData,
    features: avenidaTorrencialData.features.filter(f => f.properties?.Categoria === "Media")
  } as any;

  const avenidaAlta = {
    ...avenidaTorrencialData,
    features: avenidaTorrencialData.features.filter(f => f.properties?.Categoria === "Alta")
  } as any;

  const navigation = useNavigation();

  useEffect(() => {
    let subscription: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita acceso a tu ubicaciÃ³n.');
        setLoading(false);
        return;
      }

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 3 },
        (loc) => {
          setLocation(loc.coords);
          setLoading(false);
        }
      );
    })();

    return () => { if (subscription) subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!location || routeCoords.length === 0) return;

    if (isOffRoute(location, routeCoords) && !isRecalculating) {
      setIsRecalculating(true);
      setShouldCalculateRoute(true);
      return;
    }

    const remainingRoute = routeCoords.filter((coord) =>
      getDistance(location.latitude, location.longitude, coord.latitude, coord.longitude) > 10
    );

    setRouteCoords(remainingRoute);

    if (remainingRoute.length < 3 && evacuando) {
      setEvacuando(false);
      Alert.alert('✅ Llegaste', 'Has llegado al punto de evacuaciónn.');
    }
  }, [location]);

  useEffect(() => {
    if (startMode === 'gps') setStartPoint(null);
  }, [startMode]);

  useEffect(() => {
    if (!shouldCalculateRoute || !location) return;

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

    setDestinoFinal(finalDestination);

    if (!finalDestination) {
      setShouldCalculateRoute(false);
      setIsRecalculating(false);
      return;
    }

    const start: [number, number] =
      startMode === 'manual' && startPoint
        ? [startPoint.lng, startPoint.lat]
        : [location.longitude, location.latitude];

    const end: [number, number] = [finalDestination.lng, finalDestination.lat];

    // Construir GeoJSON de amenaza según emergencia activa (solo Media y Alta)

    const hazardGeoJson: GeoJSON.FeatureCollection | undefined =
  emergencyType === 'ninguna' ? undefined : {
    type: 'FeatureCollection',
    features: (
      emergencyType === 'inundacion' ? InundacionData.features :
      emergencyType === 'movimiento_en_masa' ? movimientoMasaData.features :
      emergencyType === 'avenida_torrencial' ? avenidaTorrencialData.features :
      []
    ).filter((f: any) =>
      f.properties?.Categoria === 'Media' || f.properties?.Categoria === 'Alta'
    ) as GeoJSON.Feature[],
  };

getRoute(start, end, routeProfile, hazardGeoJson)
  .then(({ data: route, isInDangerZone }) => {
    if (isInDangerZone && !alertaDangerMostrada) {
      setAlertaDangerMostrada(true);
      Alert.alert(
        '⚠️ Estás en zona de riesgo',
        'Se calculó una ruta de salida. Sigue las instrucciones y aléjate del área peligrosa.',
        [{ text: 'Entendido' }]
      );
    }

    const encodedPolyline = route.routes[0]?.geometry;
    if (!encodedPolyline) throw new Error('No geometry');

    const coords = (polyline.decode(encodedPolyline) as LatLngTuple[])
      .map(([lat, lng]) => ({ latitude: lat, longitude: lng }));

    setRouteCoords(coords);
  })
      .catch((err) => {
        console.error(err);
        if (!isRecalculating) Alert.alert('Error', 'No se pudo calcular la ruta.');
      })
      .finally(() => {
        setShouldCalculateRoute(false);
        setIsRecalculating(false);
      });
  }, [shouldCalculateRoute]);

  const handleIniciarEvacuacion = () => {
    if (!location) {
      Alert.alert('Sin ubicación', 'Esperando señal GPS...');
      return;
    }
    setEvacuando(true);
    setAlertaDangerMostrada(false);
    setDestinationMode('closest');
    setSelectedDestination(null);
    setShouldCalculateRoute(true);
  };

  const handleCancelarEvacuacion = () => {
    setEvacuando(false);
    setRouteCoords([]);
    setAlertaDangerMostrada(false);
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

      <TouchableOpacity
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        style={styles.menuButton}
      >
        <Text style={{ fontSize: 24 }}>☰</Text>
      </TouchableOpacity>

      {isRecalculating && (
        <View style={styles.recalculatingBanner}>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.recalculatingText}>Recalculando ruta...</Text>
        </View>
      )}

      {evacuando && !isRecalculating && routeCoords.length > 0 && (
        <View style={styles.evacuandoBanner}>
          <Text style={styles.evacuandoText}>🚨 Dirigiéndote al punto seguro</Text>
        </View>
      )}

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 4.8696,
          longitude: -75.6211,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
        showsMyLocationButton
        showsCompass={true}
        onRegionChange={(region) => {
          if (startMode !== 'manual') return;
          setStartPoint({ lat: region.latitude, lng: region.longitude });
        }}
        onPress={(e) => {
          if (startMode !== 'manual') return;
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setStartPoint({ lat: latitude, lng: longitude });
        }}
      >

        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeColor="#2196f3" strokeWidth={4} />
        )}

        {/* â”€â”€ INUNDACIÃ“N: azul â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {emergencyType === "inundacion" && (
          <>
            <Geojson
              geojson={InundacionMedia}
              strokeColor="rgba(30,144,255,0.5)"
              fillColor="rgba(30,144,255,0.12)"
              strokeWidth={1}
            />
            <Geojson
              geojson={InundacionAlta}
              strokeColor="rgba(0,0,205,0.6)"
              fillColor="rgba(0,0,205,0.18)"
              strokeWidth={1}
            />
          </>
        )}

        {/* â”€â”€ MOVIMIENTO EN MASA: amarilloâ†’rojo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {emergencyType === "movimiento_en_masa" && (
          <>
            <Geojson
              geojson={mmBaja}
              strokeColor="rgba(255,215,0,0.5)"
              fillColor="rgba(255,215,0,0.12)"
              strokeWidth={1}
            />
            <Geojson
              geojson={mmMedia}
              strokeColor="rgba(255,140,0,0.5)"
              fillColor="rgba(255,140,0,0.12)"
              strokeWidth={1}
            />
            <Geojson
              geojson={mmAlta}
              strokeColor="rgba(139,0,0,0.6)"
              fillColor="rgba(139,0,0,0.18)"
              strokeWidth={1}
            />
          </>
        )}

        {/* â”€â”€ AVENIDA TORRENCIAL: naranjaâ†’rojo oscuro â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {emergencyType === "avenida_torrencial" && (
          <>
            <Geojson
              geojson={avenidaMedia}
              strokeColor="rgba(255,100,0,0.5)"
              fillColor="rgba(255,100,0,0.12)"
              strokeWidth={1}
            />
            <Geojson
              geojson={avenidaAlta}
              strokeColor="rgba(180,0,0,0.6)"
              fillColor="rgba(180,0,0,0.18)"
              strokeWidth={1}
            />
          </>
        )}

        {destinoFinal && (
          <Marker
            coordinate={{ latitude: destinoFinal.lat, longitude: destinoFinal.lng }}
            title={destinoFinal.nombre}
            pinColor="green"
          />
        )}

        {startMode === 'manual' && startPoint && (
          <Marker
            coordinate={{ latitude: startPoint.lat, longitude: startPoint.lng }}
            title="Punto inicial"
            pinColor="orange"
          />
        )}

      </MapView>

      {!evacuando ? (
        <TouchableOpacity style={styles.evacuarButton} onPress={handleIniciarEvacuacion}>
          <Text style={styles.evacuarButtonText}>🚨 INICIAR EVACUACIÓN</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.cancelarButton} onPress={handleCancelarEvacuacion}>
          <Text style={styles.cancelarButtonText}>✕ CANCELAR EVACUACIÓN</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLambda = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
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
  recalculatingText: { color: '#ffffff', fontWeight: '600', fontSize: 13 },
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
  evacuandoText: { color: '#ffffff', fontWeight: '600', fontSize: 13 },
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
  evacuarButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
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
  cancelarButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
});
