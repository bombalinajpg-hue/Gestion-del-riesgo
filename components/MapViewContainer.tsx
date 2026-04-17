/**
 * Componente principal del mapa
 */

import { getRoute } from '@/src/services/openRouteService';
import { MaterialIcons } from '@expo/vector-icons';
import polyline from '@mapbox/polyline';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Linking, Modal, StyleSheet, Text,
  TouchableOpacity, TouchableWithoutFeedback, View
} from 'react-native';
import MapView, { Geojson, MapType, Marker, Polyline } from 'react-native-maps';
import { useRouteContext } from '../context/RouteContext';
import avenidaTorrencialData from '../data/amenaza_avenida_torrencial.json';
import InundacionData from '../data/amenaza_inundacion.json';
import movimientoMasaData from '../data/amenaza_movimiento_en_masa.json';
import destinosRaw from '../data/destinos.json';
import { fetchPOIs, getCategoryIcon, POIFeature } from '../src/services/poiService';
import type { Destino, DestinoFinal, HazardFeatureProperties } from '../src/types/types';
import { getDestinoMasCercano } from '../src/utils/getDestinoMasCercano';

type HazardCollection = FeatureCollection<Geometry, HazardFeatureProperties>;

const destinos = destinosRaw as Destino[];
const avenidaTorrencial = avenidaTorrencialData as HazardCollection;
const inundacion = InundacionData as HazardCollection;
const movimientoMasa = movimientoMasaData as HazardCollection;

type LocationError = 'denied' | 'disabled' | 'error';

type LatLngTuple = [number, number];

const filterByCategoria = (coll: HazardCollection, categoria: 'Baja' | 'Media' | 'Alta'): HazardCollection => ({
  ...coll,
  features: coll.features.filter((f) => f.properties?.Categoria === categoria),
});

const MAP_TYPES: { label: string; value: MapType; icon: string }[] = [
  { label: 'Estándar',  value: 'standard',  icon: 'map'    },
  { label: 'Satélite',  value: 'satellite', icon: 'public' },
  { label: 'Híbrido',   value: 'hybrid',    icon: 'layers' },
];

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
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [locationError, setLocationError] = useState<LocationError | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [dangerSegment, setDangerSegment] = useState<{ latitude: number; longitude: number }[]>([]);
  const [evacuando, setEvacuando] = useState(false);
  const [destinoFinal, setDestinoFinal] = useState<DestinoFinal | null>(null);
  const [alertaDangerMostrada, setAlertaDangerMostrada] = useState(false);
  const [puntoConfirmado, setPuntoConfirmado] = useState(false);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);
  const [heading, setHeading] = useState(0);
  const [pois, setPois] = useState<POIFeature[]>([]);
  const [resaltarIniciar, setResaltarIniciar] = useState(false);
  const [resumenRuta, setResumenRuta] = useState<{ distancia: string; tiempo: string } | null>(null);

  const {
    selectedDestination, setSelectedDestination,
    selectedInstitucion, setSelectedInstitucion,
    routeProfile,
    startMode, setStartMode,
    startPoint, setStartPoint,
    destinationMode, setDestinationMode,
    emergencyType, setEmergencyType,
    shouldCenterOnUser, setShouldCenterOnUser,
    setShouldScrollToDestinos,
  } = useRouteContext();

  const abortRef = useRef<AbortController | null>(null);

  const mmBaja     = filterByCategoria(movimientoMasa, 'Baja');
  const mmMedia    = filterByCategoria(movimientoMasa, 'Media');
  const mmAlta     = filterByCategoria(movimientoMasa, 'Alta');
  const InundMedia = filterByCategoria(inundacion, 'Media');
  const InundAlta  = filterByCategoria(inundacion, 'Alta');
  const avMedia    = filterByCategoria(avenidaTorrencial, 'Media');
  const avAlta     = filterByCategoria(avenidaTorrencial, 'Alta');

  const navigation = useNavigation();

  // ── Ubicación y heading ────────────────────────────────────────────────────
  useEffect(() => {
    let locSub: Location.LocationSubscription | undefined;
    let headSub: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          if (!cancelled) { setLocationError('disabled'); setLoading(false); }
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) { setLocationError('denied'); setLoading(false); }
          return;
        }

        // Fix inicial rápido para no quedar colgados si watchPositionAsync tarda.
        try {
          const fix = await Location.getLastKnownPositionAsync();
          if (fix && !cancelled) { setLocation(fix.coords); setLoading(false); }
        } catch {
          // si falla, seguimos al watch
        }

        locSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 3 },
          (loc) => { if (!cancelled) { setLocation(loc.coords); setLoading(false); } }
        );
        headSub = await Location.watchHeadingAsync((h) => {
          if (!cancelled) setHeading(h.trueHeading ?? h.magHeading ?? 0);
        });
      } catch {
        if (!cancelled) { setLocationError('error'); setLoading(false); }
      }
    })();

    return () => {
      cancelled = true;
      locSub?.remove();
      headSub?.remove();
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

  // ── Reset al cambiar modo de inicio ───────────────────────────────────────
  useEffect(() => {
    setPuntoConfirmado(false);
    if (startMode === 'gps') setStartPoint(null);
    setRouteCoords([]);
    setDangerSegment([]);
  }, [startMode]);

  useEffect(() => {
    if (startMode === 'manual' && startPoint) {
      setPuntoConfirmado(false);
      setRouteCoords([]);
      setDangerSegment([]);
    }
  }, [startPoint]);

  // ── Animar botón INICIAR cuando se selecciona un destino ──────────────────
  useEffect(() => {
    if (selectedDestination || selectedInstitucion) {
      setResaltarIniciar(true);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
        { iterations: 4 }
      ).start(() => setResaltarIniciar(false));
    }
  }, [selectedDestination, selectedInstitucion]);

  // ── Cargar POIs ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchPOIs(4.8767129, -75.6272130).then(setPois);
  }, []);

  // ── Calcular ruta ──────────────────────────────────────────────────────────
  const iniciarEvacuacion = async () => {
    if (!location || evacuando) return;

    // Cancelar cualquier cálculo previo en vuelo
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setEvacuando(true);

    let finalDestination: DestinoFinal | null = selectedInstitucion ?? selectedDestination;

    if (destinationMode === 'closest') {
      const userLocation = startMode === 'manual' && startPoint
        ? { latitude: startPoint.lat, longitude: startPoint.lng }
        : { latitude: location.latitude, longitude: location.longitude };
      finalDestination = getDestinoMasCercano(userLocation, destinos.filter((d) => d.tipo === 'punto_encuentro'));
    }

    if (!finalDestination) {
      setEvacuando(false);
      return;
    }

    setDestinoFinal(finalDestination);

    const start: [number, number] = startMode === 'manual' && startPoint
      ? [startPoint.lng, startPoint.lat]
      : [location.longitude, location.latitude];

    const end: [number, number] = [finalDestination.lng, finalDestination.lat];

    const hazardSource: HazardCollection | undefined =
      emergencyType === 'inundacion' ? inundacion :
      emergencyType === 'movimiento_en_masa' ? movimientoMasa :
      emergencyType === 'avenida_torrencial' ? avenidaTorrencial :
      undefined;

    const hazardGeoJson: FeatureCollection | undefined = hazardSource && {
      type: 'FeatureCollection',
      features: hazardSource.features.filter(
        (f): f is Feature<Geometry, HazardFeatureProperties> =>
          f.properties?.Categoria === 'Media' || f.properties?.Categoria === 'Alta'
      ),
    };

    const destinosParaEvaluar = destinationMode === 'closest'
      ? destinos.filter((d) => d.tipo === 'punto_encuentro')
      : [finalDestination as Destino];

    const profile = routeProfile ?? 'foot-walking';

    try {
      const { data: route, isInDangerZone, dangerCoords, destinoFinalCoord, exitPoint } =
        await getRoute(start, end, profile, hazardGeoJson, destinosParaEvaluar);

      if (controller.signal.aborted) return;

      if (isInDangerZone && dangerCoords.length > 0 && !alertaDangerMostrada) {
        setAlertaDangerMostrada(true);
        Alert.alert(
          '⚠️ Estás en zona de riesgo',
          'Se calculó una ruta de salida. Sigue las instrucciones y aléjate del área peligrosa.',
          [{ text: 'Entendido' }]
        );
      }

      if (destinoFinalCoord) setDestinoFinal(destinoFinalCoord);

      const enc = route.routes[0]?.geometry;
      if (!enc) throw new Error('No geometry');

      const summary = route.routes[0]?.summary;
      if (summary && summary.distance != null && summary.duration != null) {
        const distKm = summary.distance >= 1000
          ? `${(summary.distance / 1000).toFixed(1)} km`
          : `${Math.round(summary.distance)} m`;
        const mins = Math.round(summary.duration / 60);
        const tiempo = mins < 60
          ? `${mins} min`
          : `${Math.floor(mins / 60)}h ${mins % 60}min`;
        setResumenRuta({ distancia: distKm, tiempo });
      }

      const decodedCoords = (polyline.decode(enc) as LatLngTuple[])
        .map(([lat, lng]) => ({ latitude: lat, longitude: lng }));

      // Prepend el cruce exacto con el borde del polígono — va sobre el mismo
      // tramo de vía que el primer punto del azul, así rojo y azul empalman
      // sobre la calle sin hueco ni atajo.
      const blueCoords = exitPoint ? [exitPoint, ...decodedCoords] : decodedCoords;

      setDangerSegment(dangerCoords);
      setRouteCoords(blueCoords);
    } catch {
      if (controller.signal.aborted) return;
      Alert.alert('Error', 'No se pudo calcular la ruta.');
      setEvacuando(false);
    }
  };

  const handleCenterOnUser = () => {
    if (!location) return;
    mapRef.current?.animateToRegion({
      latitude: location.latitude, longitude: location.longitude,
      latitudeDelta: 0.01, longitudeDelta: 0.01,
    }, 600);
  };

  const handleCancelarEvacuacion = () => {
    abortRef.current?.abort();
    setEvacuando(false);
    setRouteCoords([]);
    setDangerSegment([]);
    setDestinoFinal(null);
    setAlertaDangerMostrada(false);
    setPuntoConfirmado(false);
    setStartPoint(null);
    setStartMode('gps');
    setEmergencyType('ninguna');
    setSelectedDestination(null);
    setSelectedInstitucion(null);
    setDestinationMode('selected');
    setResaltarIniciar(false);
    setResumenRuta(null);
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

  // ── Pantallas de estado ────────────────────────────────────────────────────
  if (locationError) {
    const mensajes: Record<LocationError, { titulo: string; detalle: string }> = {
      denied:   { titulo: 'Permiso de ubicación denegado',   detalle: 'Esta app necesita acceso a tu ubicación para calcular rutas de evacuación.' },
      disabled: { titulo: 'Servicios de ubicación desactivados', detalle: 'Activa el GPS en la configuración del sistema para calcular rutas.' },
      error:    { titulo: 'No se pudo obtener tu ubicación', detalle: 'Ocurrió un error al acceder al GPS. Intenta reiniciar la app o revisa los permisos.' },
    };
    const { titulo, detalle } = mensajes[locationError];
    return (
      <View style={styles.loadingContainer}>
        <MaterialIcons name="location-off" size={48} color="#ef476f" />
        <Text style={{ marginTop: 16, color: '#073b4c', fontWeight: '700', fontSize: 16 }}>
          {titulo}
        </Text>
        <Text style={{ marginTop: 8, color: '#555', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
          {detalle}
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, backgroundColor: '#118ab2', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20 }}
          onPress={() => Linking.openSettings()}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>Abrir Configuración</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading || !location)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ef476f" />
        <Text style={{ marginTop: 12, color: '#073b4c', fontWeight: '600' }}>Obteniendo ubicación...</Text>
      </View>
    );

  const ubicacionLista = startMode === 'gps' || (startMode === 'manual' && startPoint !== null && puntoConfirmado);
  const destinoListo = destinationMode === 'closest' || selectedDestination !== null || selectedInstitucion !== null;
  const todosLosParametros = emergencyType !== 'ninguna' && routeProfile !== null && destinoListo && ubicacionLista;
  const seleccionandoPunto = startMode === 'manual' && !evacuando;
  const puntoPendiente = seleccionandoPunto && startPoint !== null && !puntoConfirmado;
  const isNorth = Math.abs(heading % 360) < 8 || Math.abs(heading % 360) > 352;
  const mostrarUbicacion = !evacuando && !todosLosParametros;

  const iconoModo = routeProfile === 'driving-car' ? '🚗' :
                    routeProfile === 'cycling-regular' ? '🚴' : '🚶';

  return (
    <View style={styles.container}>

      <View style={styles.floatingTitle}>
        <Text style={styles.floatingTitleText}>Rutas de Evacuación</Text>
      </View>

      <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.menuButton}>
        <Text style={{ fontSize: 24 }}>☰</Text>
      </TouchableOpacity>

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

      <TouchableOpacity style={styles.emergencyButton} onPress={handleLlamarEmergencia}>
        <MaterialIcons name="phone" size={28} color="#ffffff" />
      </TouchableOpacity>

      {evacuando && routeCoords.length > 0 && (
        <View style={styles.evacuandoBanner}>
          <Text style={styles.evacuandoText}>🚨  Evacuando</Text>
        </View>
      )}

      {evacuando && resumenRuta && (
        <View style={styles.resumenBanner}>
          <Text style={styles.resumenText}>
            {iconoModo} {resumenRuta.distancia}  ·  ⏱️ {resumenRuta.tiempo}
          </Text>
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
        {dangerSegment.length > 0 && <Polyline coordinates={dangerSegment} strokeColor="#ef476f" strokeWidth={4} />}

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

        {destinoFinal && (
          <Marker
            coordinate={{ latitude: destinoFinal.lat, longitude: destinoFinal.lng }}
            title={destinoFinal.nombre}
            pinColor="azure"
          />
        )}

        {startMode === 'manual' && startPoint && (
          <Marker coordinate={{ latitude: startPoint.lat, longitude: startPoint.lng }} title="Punto inicial" pinColor="orange" />
        )}

        {pois.map((poi, index) => {
          const icon = getCategoryIcon(poi);
          const [lng, lat] = poi.geometry.coordinates;
          const name = poi.properties.osm_tags?.name ?? icon.label;
          return (
            <Marker
              key={`poi-${index}`}
              coordinate={{ latitude: lat, longitude: lng }}
              title={name}
              description={poi.properties.category_ids
                ? Object.values(poi.properties.category_ids)[0]?.category_name
                : ''}
            >
              <View style={{ backgroundColor: icon.color, borderRadius: 20, padding: 4, borderWidth: 2, borderColor: '#fff' }}>
                <Text style={{ fontSize: 16 }}>{icon.label}</Text>
              </View>
            </Marker>
          );
        })}

      </MapView>

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

      {seleccionandoPunto && startPoint === null && (
        <View style={styles.floatingBanner}>
          <Text style={styles.floatingBannerText}>Toca el mapa para seleccionar tu punto de inicio</Text>
        </View>
      )}

      {puntoPendiente && (
        <TouchableOpacity
          style={styles.confirmarPuntoButton}
          onPress={() => {
            setPuntoConfirmado(true);
            setShouldScrollToDestinos(true);
            navigation.dispatch(DrawerActions.openDrawer());
          }}
        >
          <MaterialIcons name="check-circle" size={20} color="#ffffff" style={{ marginRight: 8 }} />
          <Text style={styles.confirmarPuntoButtonText}>CONFIRMAR PUNTO DE INICIO</Text>
        </TouchableOpacity>
      )}

      {todosLosParametros && !evacuando && (
        <Animated.View style={{ transform: [{ scale: resaltarIniciar ? pulseAnim : 1 }], position: 'absolute', bottom: 170, alignSelf: 'center' }}>
          <TouchableOpacity
            style={[styles.evacuarButton, resaltarIniciar && styles.evacuarButtonResaltado]}
            onPress={iniciarEvacuacion}
            disabled={evacuando}
          >
            <MaterialIcons name="directions-run" size={22} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.evacuarButtonText}>INICIAR EVACUACIÓN</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {evacuando && (
        <TouchableOpacity style={styles.cancelarButton} onPress={handleCancelarEvacuacion}>
          <Text style={styles.cancelarButtonText}>✕ CANCELAR EVACUACIÓN</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

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
  evacuandoBanner: {
    position: 'absolute', top: 176, alignSelf: 'center', zIndex: 10,
    backgroundColor: '#073b4c', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  evacuandoText: { color: '#ffffff', fontWeight: '700', fontSize: 14, includeFontPadding: false },
  resumenBanner: {
    position: 'absolute', top: 224, alignSelf: 'center', zIndex: 10,
    backgroundColor: '#ffffffee', paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  resumenText: { color: '#073b4c', fontWeight: '600', fontSize: 13, includeFontPadding: false },
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
    backgroundColor: '#ef476f', paddingVertical: 16, paddingHorizontal: 28,
    borderRadius: 30, flexDirection: 'row', alignItems: 'center',
    elevation: 8, shadowColor: '#ef476f', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8,
  },
  evacuarButtonResaltado: {
    shadowOpacity: 0.9, shadowRadius: 16, elevation: 16,
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
