/**
 * Componente principal del mapa
 */

import { getRoute } from '@/src/services/openRouteService';
import { MaterialIcons } from '@expo/vector-icons';
import polyline from '@mapbox/polyline';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, StyleSheet, Text,
  TouchableOpacity, TouchableWithoutFeedback, View
} from 'react-native';
import MapView, { Geojson, MapType, Marker, Polyline } from 'react-native-maps';
import { useRouteContext } from '../context/RouteContext';
import avenidaTorrencialData from '../data/amenaza_avenida_torrencial.json';
import InundacionData from '../data/amenaza_inundacion.json';
import movimientoMasaData from '../data/amenaza_movimiento_en_masa.json';
import destinos from '../data/destinos.json';
import { getDestinoMasCercano } from '../src/utils/getDestinoMasCercano';

type LatLngTuple = [number, number];

const MAP_TYPES: { label: string; value: MapType; icon: string }[] = [
  { label: 'Estándar',  value: 'standard',  icon: 'map'     },
  { label: 'Satélite',  value: 'satellite', icon: 'public'  },
  { label: 'Híbrido',   value: 'hybrid',    icon: 'layers'  },
  { label: 'Relieve',   value: 'terrain',   icon: 'terrain' },
];

// ── Brújula personalizada ──────────────────────────────────────────────────
function NorthArrow({ heading }: { heading: number }) {
  return (
    <View style={{ transform: [{ rotate: `-${heading}deg` }], alignItems: 'center' }}>
      <Text style={{ fontSize: 9, fontWeight: '900', color: '#ef476f', marginBottom: 1 }}>N</Text>
      <View style={{ width: 0, height: 0, alignItems: 'center' }}>
        <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 0, borderBottomWidth: 13, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#073b4c', position: 'absolute', left: -7, top: 0 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 0, borderRightWidth: 7, borderBottomWidth: 13, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#ef476f', position: 'absolute', left: 0, top: 0 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 0, borderTopWidth: 13, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#ffffff', position: 'absolute', left: -7, top: 13 }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 0, borderRightWidth: 7, borderTopWidth: 13, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#e0e0e0', position: 'absolute', left: 0, top: 13 }} />
      </View>
      <View style={{ height: 26 }} />
    </View>
  );
}

export default function MapViewContainer() {

  const mapRef = useRef<MapView>(null);

  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [evacuando, setEvacuando] = useState(false);
  const [destinoFinal, setDestinoFinal] = useState<any>(null);
  const [alertaDangerMostrada, setAlertaDangerMostrada] = useState(false);
  const [puntoConfirmado, setPuntoConfirmado] = useState(false);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);
  const [heading, setHeading] = useState(0);

  const {
    selectedDestination,
    routeProfile,
    shouldCalculateRoute,
    setShouldCalculateRoute,
    startMode,
    setStartMode,
    startPoint,
    setStartPoint,
    destinationMode,
    setDestinationMode,
    emergencyType,
    setEmergencyType,
    setSelectedDestination,
    shouldCenterOnUser,
    setShouldCenterOnUser,
  } = useRouteContext();

  // ── Capas GeoJSON ──────────────────────────────────────────────────────────
  const mmBaja     = { ...movimientoMasaData,    features: movimientoMasaData.features.filter(f    => f.properties?.Categoria === "Baja")  } as any;
  const mmMedia    = { ...movimientoMasaData,    features: movimientoMasaData.features.filter(f    => f.properties?.Categoria === "Media") } as any;
  const mmAlta     = { ...movimientoMasaData,    features: movimientoMasaData.features.filter(f    => f.properties?.Categoria === "Alta")  } as any;
  const InundMedia = { ...InundacionData,        features: InundacionData.features.filter(f        => f.properties?.Categoria === "Media") } as any;
  const InundAlta  = { ...InundacionData,        features: InundacionData.features.filter(f        => f.properties?.Categoria === "Alta")  } as any;
  const avMedia    = { ...avenidaTorrencialData, features: avenidaTorrencialData.features.filter(f => f.properties?.Categoria === "Media") } as any;
  const avAlta     = { ...avenidaTorrencialData, features: avenidaTorrencialData.features.filter(f => f.properties?.Categoria === "Alta")  } as any;

  const navigation = useNavigation();

  // ── Ubicación y heading ────────────────────────────────────────────────────
  useEffect(() => {
    let locSub: Location.LocationSubscription;
    let headSub: Location.LocationSubscription;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita acceso a tu ubicación.');
        setLoading(false);
        return;
      }
      locSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 3 },
        (loc) => { setLocation(loc.coords); setLoading(false); }
      );
      headSub = await Location.watchHeadingAsync((h) => {
        setHeading(h.trueHeading ?? h.magHeading ?? 0);
      });
    })();
    return () => {
      if (locSub) locSub.remove();
      if (headSub) headSub.remove();
    };
  }, []);

  // ── Centrar en usuario ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldCenterOnUser || !location) return;
    mapRef.current?.animateToRegion({
      latitude: location.latitude, longitude: location.longitude,
      latitudeDelta: 0.01, longitudeDelta: 0.01,
    }, 600);
    setShouldCenterOnUser(false);
  }, [shouldCenterOnUser, location]);

  // ── Reset punto confirmado ─────────────────────────────────────────────────
  useEffect(() => {
    setPuntoConfirmado(false);
    if (startMode === 'gps') setStartPoint(null);
  }, [startMode]);

  useEffect(() => {
    if (startMode === 'manual' && startPoint) setPuntoConfirmado(false);
  }, [startPoint]);

  // ── Recálculo automático ───────────────────────────────────────────────────
  useEffect(() => {
    if (!location || routeCoords.length === 0) return;
    if (isOffRoute(location, routeCoords) && !isRecalculating) {
      setIsRecalculating(true);
      setShouldCalculateRoute(true);
      return;
    }
    const remaining = routeCoords.filter(c =>
      getDistance(location.latitude, location.longitude, c.latitude, c.longitude) > 10
    );
    setRouteCoords(remaining);
    if (remaining.length < 3 && evacuando) {
      setEvacuando(false);
      Alert.alert('Llegaste', 'Has llegado al punto de evacuación.');
    }
  }, [location]);

  // ── Calcular ruta ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldCalculateRoute || !location) return;
    setEvacuando(true);

    let finalDestination = selectedDestination;

    if (destinationMode === 'closest') {
      const userLocation = startMode === 'manual' && startPoint
        ? { latitude: startPoint.lat, longitude: startPoint.lng }
        : { latitude: location.latitude, longitude: location.longitude };
      finalDestination = getDestinoMasCercano(userLocation, destinos.filter(d => d.tipo === 'punto_encuentro'));
      if (!finalDestination) {
        setShouldCalculateRoute(false); setIsRecalculating(false); setEvacuando(false); return;
      }
    }

    setDestinoFinal(finalDestination);
    if (!finalDestination) {
      setShouldCalculateRoute(false); setIsRecalculating(false); setEvacuando(false); return;
    }

    const start: [number, number] = startMode === 'manual' && startPoint
      ? [startPoint.lng, startPoint.lat]
      : [location.longitude, location.latitude];
    const end: [number, number] = [finalDestination.lng, finalDestination.lat];

    const hazardGeoJson: GeoJSON.FeatureCollection | undefined = emergencyType === 'ninguna' ? undefined : {
      type: 'FeatureCollection',
      features: (
        emergencyType === 'inundacion' ? InundacionData.features :
        emergencyType === 'movimiento_en_masa' ? movimientoMasaData.features :
        avenidaTorrencialData.features
      ).filter((f: any) => f.properties?.Categoria === 'Media' || f.properties?.Categoria === 'Alta') as GeoJSON.Feature[],
    };

    getRoute(start, end, routeProfile, hazardGeoJson)
      .then(({ data: route, isInDangerZone }) => {
        if (isInDangerZone && !alertaDangerMostrada) {
          setAlertaDangerMostrada(true);
          Alert.alert('⚠️ Estás en zona de riesgo', 'Se calculó una ruta de salida. Sigue las instrucciones y aléjate del área peligrosa.', [{ text: 'Entendido' }]);
        }
        const enc = route.routes[0]?.geometry;
        if (!enc) throw new Error('No geometry');
        setRouteCoords((polyline.decode(enc) as LatLngTuple[]).map(([lat, lng]) => ({ latitude: lat, longitude: lng })));
      })
      .catch((err) => {
        console.error(err);
        if (!isRecalculating) Alert.alert('Error', 'No se pudo calcular la ruta.');
        setEvacuando(false);
      })
      .finally(() => { setShouldCalculateRoute(false); setIsRecalculating(false); });
  }, [shouldCalculateRoute]);

  const handleCenterOnUser = () => {
    if (!location) return;
    mapRef.current?.animateToRegion({
      latitude: location.latitude, longitude: location.longitude,
      latitudeDelta: 0.01, longitudeDelta: 0.01,
    }, 600);
  };

  const handleCancelarEvacuacion = () => {
    setEvacuando(false); setRouteCoords([]); setDestinoFinal(null);
    setAlertaDangerMostrada(false); setPuntoConfirmado(false);
    setStartPoint(null); setStartMode('gps'); setEmergencyType('ninguna');
    setSelectedDestination(null); setDestinationMode('selected'); setShouldCalculateRoute(false);
  };

  const handleLlamarEmergencia = () => {
    Alert.alert(
      'Llamar al 123',
      '¿Deseas llamar al número de emergencias?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Llamar', onPress: () => Linking.openURL('tel:123') },
      ]
    );
  };

  if (loading || !location)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ef476f" />
        <Text style={{ marginTop: 12, color: '#073b4c', fontWeight: '600' }}>Obteniendo ubicación...</Text>
      </View>
    );

  const ubicacionLista = startMode === 'gps' || (startMode === 'manual' && startPoint !== null && puntoConfirmado);
  const destinoListo = destinationMode === 'closest' || selectedDestination !== null;
  const todosLosParametros = emergencyType !== 'ninguna' && destinoListo && ubicacionLista;
  const seleccionandoPunto = startMode === 'manual' && !evacuando;
  const puntoPendiente = seleccionandoPunto && startPoint !== null && !puntoConfirmado;
  const isNorth = Math.abs(heading % 360) < 8 || Math.abs(heading % 360) > 352;
  const mostrarUbicacion = !evacuando && !todosLosParametros;

  return (
    <View style={styles.container}>

      {/* Título flotante */}
      <View style={styles.floatingTitle}>
        <Text style={styles.floatingTitleText}>Rutas de Evacuación</Text>
      </View>

      {/* Botón menú — esquina superior izquierda */}
      <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.menuButton}>
        <Text style={{ fontSize: 24 }}>☰</Text>
      </TouchableOpacity>

      {/* Grupo superior derecha: capas + brújula */}
      <View style={styles.topRightGroup}>
        <TouchableOpacity style={styles.squareButton} onPress={() => setShowMapTypePicker(true)}>
          <MaterialIcons name="layers" size={24} color="#073b4c" />
        </TouchableOpacity>
        {!isNorth && (
          <View style={styles.roundButton}>
            <NorthArrow heading={heading} />
          </View>
        )}
      </View>

      {/* Grupo inferior derecha: ubicación + evacuación — solo cuando emergencyType es ninguna */}
      {mostrarUbicacion && (
        <View style={styles.bottomRightGroup}>
          <TouchableOpacity style={[styles.roundButton, { width: 56, height: 56, borderRadius: 28 }]} onPress={handleCenterOnUser}>
            <MaterialIcons name="my-location" size={30} color="#073b4c" />
          </TouchableOpacity>
          {emergencyType === 'ninguna' && (
            <TouchableOpacity style={[styles.squareButton, { backgroundColor: '#ef476f', width: 56, height: 56 }]} onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
              <MaterialIcons name="directions-run" size={32} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Botón llamada emergencia — esquina inferior izquierda */}
      <TouchableOpacity style={styles.emergencyButton} onPress={handleLlamarEmergencia}>
        <MaterialIcons name="phone" size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Banners */}
      {isRecalculating && (
        <View style={styles.recalculatingBanner}>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.recalculatingText}>  Recalculando ruta...</Text>
        </View>
      )}
      {evacuando && !isRecalculating && routeCoords.length > 0 && (
        <View style={styles.evacuandoBanner}>
          <Text style={styles.evacuandoText}>Dirigiéndote al punto</Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapType}
        showsCompass={false}
        showsMyLocationButton={false}
        initialRegion={{ latitude: 4.8767129, longitude: -75.6272130, latitudeDelta: 0.007, longitudeDelta: 0.007 }}
        showsUserLocation
        onPress={(e) => {
          if (startMode !== 'manual' || evacuando) return;
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setStartPoint({ lat: latitude, lng: longitude });
        }}
      >
        {routeCoords.length > 0 && <Polyline coordinates={routeCoords} strokeColor="#2196f3" strokeWidth={4} />}

        {emergencyType === "inundacion" && (
          <>
            <Geojson geojson={InundMedia} strokeColor="rgba(30,144,255,0.5)"  fillColor="rgba(30,144,255,0.12)"  strokeWidth={1} />
            <Geojson geojson={InundAlta}  strokeColor="rgba(0,0,205,0.6)"     fillColor="rgba(0,0,205,0.18)"     strokeWidth={1} />
          </>
        )}
        {emergencyType === "movimiento_en_masa" && (
          <>
            <Geojson geojson={mmBaja}  strokeColor="rgba(255,215,0,0.5)"  fillColor="rgba(255,215,0,0.12)"  strokeWidth={1} />
            <Geojson geojson={mmMedia} strokeColor="rgba(255,140,0,0.5)"  fillColor="rgba(255,140,0,0.12)"  strokeWidth={1} />
            <Geojson geojson={mmAlta}  strokeColor="rgba(139,0,0,0.6)"    fillColor="rgba(139,0,0,0.18)"    strokeWidth={1} />
          </>
        )}
        {emergencyType === "avenida_torrencial" && (
          <>
            <Geojson geojson={avMedia} strokeColor="rgba(255,100,0,0.5)"  fillColor="rgba(255,100,0,0.12)"  strokeWidth={1} />
            <Geojson geojson={avAlta}  strokeColor="rgba(180,0,0,0.6)"    fillColor="rgba(180,0,0,0.18)"    strokeWidth={1} />
          </>
        )}

        {destinoFinal && <Marker coordinate={{ latitude: destinoFinal.lat, longitude: destinoFinal.lng }} title={destinoFinal.nombre} pinColor="green" />}
        {startMode === 'manual' && startPoint && <Marker coordinate={{ latitude: startPoint.lat, longitude: startPoint.lng }} title="Punto inicial" pinColor="orange" />}
      </MapView>

      {/* Modal tipo de mapa */}
      <Modal visible={showMapTypePicker} transparent animationType="slide" onRequestClose={() => setShowMapTypePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowMapTypePicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Tipo de mapa</Text>
                  <TouchableOpacity onPress={() => setShowMapTypePicker(false)}>
                    <MaterialIcons name="close" size={24} color="#073b4c" />
                  </TouchableOpacity>
                </View>
                <View style={styles.mapTypeRow}>
                  {MAP_TYPES.map((type) => {
                    const isActive = mapType === type.value;
                    return (
                      <TouchableOpacity key={type.value} style={styles.mapTypeOption} onPress={() => { setMapType(type.value); setShowMapTypePicker(false); }}>
                        <View style={[styles.mapTypeIconBox, isActive && styles.mapTypeIconBoxActive]}>
                          <MaterialIcons name={type.icon as any} size={32} color={isActive ? '#118ab2' : '#073b4c'} />
                        </View>
                        <Text style={[styles.mapTypeLabel, isActive && styles.mapTypeLabelActive]}>{type.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Mensaje: toca el mapa */}
      {seleccionandoPunto && startPoint === null && (
        <View style={styles.floatingBanner}>
          <Text style={styles.floatingBannerText}>Toca el mapa para seleccionar tu punto de inicio</Text>
        </View>
      )}

      {/* Confirmar punto */}
      {puntoPendiente && (
        <TouchableOpacity style={styles.confirmarPuntoButton} onPress={() => setPuntoConfirmado(true)}>
          <MaterialIcons name="check-circle" size={20} color="#ffffff" style={{ marginRight: 8 }} />
          <Text style={styles.confirmarPuntoButtonText}>CONFIRMAR PUNTO DE INICIO</Text>
        </TouchableOpacity>
      )}

      {/* Iniciar evacuación */}
      {todosLosParametros && !evacuando && (
        <TouchableOpacity style={styles.evacuarButton} onPress={() => setShouldCalculateRoute(true)}>
          <MaterialIcons name="directions-run" size={22} color="#ffffff" style={{ marginRight: 8 }} />
          <Text style={styles.evacuarButtonText}>INICIAR EVACUACIÓN</Text>
        </TouchableOpacity>
      )}

      {/* Cancelar evacuación */}
      {evacuando && (
        <TouchableOpacity style={styles.cancelarButton} onPress={handleCancelarEvacuacion}>
          <Text style={styles.cancelarButtonText}>✕ CANCELAR EVACUACIÓN</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180, phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180, dLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isOffRoute = (location: Location.LocationObjectCoords, routeCoords: { latitude: number; longitude: number }[]) => {
  let min = Infinity;
  for (const c of routeCoords) {
    const d = getDistance(location.latitude, location.longitude, c.latitude, c.longitude);
    if (d < min) min = d;
  }
  return min > 25;
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },

  floatingTitle: {
    position: 'absolute', top: 60, alignSelf: 'center', zIndex: 10,
    backgroundColor: '#ffffffdd', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 5,
  },
  floatingTitleText: { color: '#073b4c', fontWeight: 'bold', fontSize: 18, letterSpacing: 0.5 },
  menuButton: {
    position: 'absolute', top: 120, left: 20, zIndex: 10,
    backgroundColor: '#ffffffee', padding: 10, borderRadius: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  topRightGroup: { position: 'absolute', top: 120, right: 20, zIndex: 10, gap: 8 },
  bottomRightGroup: { position: 'absolute', bottom: 70, right: 20, zIndex: 10, gap: 10 },

  squareButton: {
    backgroundColor: '#ffffffee', width: 46, height: 46, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  roundButton: {
    backgroundColor: '#ffffffee', width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },

  emergencyButton: {
    position: 'absolute', bottom: 70, left: 20, zIndex: 10,
    backgroundColor: '#ef476f', width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#ef476f', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },

  recalculatingBanner: {
    position: 'absolute', top: 122, left: 76, right: 76, zIndex: 10,
    backgroundColor: '#118ab2',
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 20, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  recalculatingText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  evacuandoBanner: {
    position: 'absolute', top: 122, left: 76, right: 76, zIndex: 10,
    backgroundColor: '#073b4c',
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  evacuandoText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  floatingBanner: {
    position: 'absolute', bottom: 170, alignSelf: 'center',
    backgroundColor: '#ffffffee', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 20, elevation: 5,
  },
  floatingBannerText: { color: '#073b4c', fontWeight: '500', fontSize: 13 },

  confirmarPuntoButton: {
    position: 'absolute', bottom: 170, alignSelf: 'center',
    backgroundColor: '#118ab2', paddingVertical: 16, paddingHorizontal: 28,
    borderRadius: 30, flexDirection: 'row', alignItems: 'center', elevation: 8,
  },
  confirmarPuntoButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },

  evacuarButton: {
    position: 'absolute', bottom: 170, alignSelf: 'center',
    backgroundColor: '#ef476f', paddingVertical: 16, paddingHorizontal: 28,
    borderRadius: 30, flexDirection: 'row', alignItems: 'center',
    elevation: 8, shadowColor: '#ef476f', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8,
  },
  evacuarButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },

  cancelarButton: {
    position: 'absolute', bottom: 170, alignSelf: 'center',
    backgroundColor: '#073b4c', paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 30, elevation: 8,
  },
  cancelarButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#073b4c' },
  mapTypeRow: { flexDirection: 'row', justifyContent: 'space-around' },
  mapTypeOption: { alignItems: 'center', width: 72 },
  mapTypeIconBox: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#f4f4f4', borderWidth: 2, borderColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  mapTypeIconBoxActive: { borderColor: '#118ab2', backgroundColor: '#e8f4fd' },
  mapTypeLabel: { fontSize: 13, color: '#073b4c', fontWeight: '500', textAlign: 'center' },
  mapTypeLabelActive: { color: '#118ab2', fontWeight: '700' },
});
