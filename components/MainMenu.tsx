import { MaterialIcons } from '@expo/vector-icons';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouteContext } from '../context/RouteContext';
import destinos from '../data/destinos.json';
import instituciones from '../data/instituciones.json';
import { EmergencyType, RouteProfile, StartMode } from '../src/types/types';

// ── Íconos por nombre ──────────────────────────────────────────────────────────
const iconoPorDestino: Record<string, string> = {
  'Parque Público':             '🌳',
  'Coliseo Bayron Gaviria':     '🏟️',
  'Zona Verde 2':               '🌿',
  'Parque 5a Etapa La Hermosa': '🌳',
  'Cancha Betania':             '⚽',
  'Coliseo Timoteo':            '🏟️',
  'Zona Verde 1':               '🌿',
};

const iconoPorInstitucion: Record<string, string> = {
  'Hospital San Vicente':                        '🏥',
  'CAI Betania':                                 '👮',
  'Parroquia Ntra. Sra. de las Mercedes':        '⛪',
  'Clínica Santa Clara':                         '🏥',
  'Parroquia Franciscana Santísima Trinidad':    '⛪',
  'Parroquia San Vicente de Paul':               '⛪',
  'Cruz Roja':                                   '🚑',
  'Bomberos':                                    '🚒',
  'Escuela La Hermosa':                          '🏫',
};

export default function MainMenu({ navigation }: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const destinosYRef = useRef<number>(0);

  const {
    routeProfile, setRouteProfile,
    selectedDestination, setSelectedDestination,
    selectedInstitucion, setSelectedInstitucion,
    emergencyType, setEmergencyType,
    startMode, setStartMode,
    setStartPoint,
    setDestinationMode, destinationMode,
    setShouldCenterOnUser,
    shouldScrollToDestinos, setShouldScrollToDestinos,
    requestShowInstructivo,
  } = useRouteContext();

  useEffect(() => {
    if (shouldScrollToDestinos) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: destinosYRef.current, animated: true });
      }, 300);
      setShouldScrollToDestinos(false);
    }
  }, [shouldScrollToDestinos]);

  const parametrosBasicosListos =
    emergencyType !== 'ninguna' &&
    routeProfile !== null &&
    startMode !== null;

  const destinoListo =
    destinationMode === 'closest' ||
    selectedDestination !== null ||
    selectedInstitucion !== null;

  const handleSelectDestino = (destino: typeof destinos[0]) => {
    setSelectedDestination(destino);
    setSelectedInstitucion(null);
    setDestinationMode('selected');
    navigation.closeDrawer();
  };

  const handleSelectInstitucion = (inst: typeof instituciones[0]) => {
    setSelectedInstitucion(inst);
    setSelectedDestination(null);
    setDestinationMode('selected');
    navigation.closeDrawer();
  };

  const handleSelectClosest = () => {
    setDestinationMode('closest');
    setSelectedDestination(null);
    setSelectedInstitucion(null);
    navigation.closeDrawer();
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.wrapper}
      contentContainerStyle={{ paddingBottom: 56 + insets.bottom }}
    >
      <View style={styles.card}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>🚨 EMERGENCIA</Text>
        </View>

        {/* Tipo de Emergencia */}
        <Text style={styles.label}>Tipo de Emergencia</Text>
        <View style={styles.emergencyGroup}>
          {[
            { label: 'Ninguna',            value: 'ninguna',            emoji: '—'  },
            { label: 'Inundación',         value: 'inundacion',         emoji: '🌊' },
            { label: 'Movimiento en masa', value: 'movimiento_en_masa', emoji: '⛰️' },
            { label: 'Avenida torrencial', value: 'avenida_torrencial', emoji: '🌪️' },
          ].map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.emergencyButton, emergencyType === option.value && styles.optionButtonActive]}
              onPress={() => setEmergencyType(option.value as EmergencyType)}
            >
              <Text style={[styles.emergencyText, emergencyType === option.value && styles.optionTextActive]}>
                {option.emoji} {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {emergencyType === 'ninguna' && (
          <Text style={styles.inlineHint}>Selecciona el tipo de emergencia para continuar</Text>
        )}

        {/* Leyenda */}
        {emergencyType !== 'ninguna' && (
          <View style={styles.leyendaBox}>
            <Text style={styles.leyendaTitle}>Leyenda</Text>
            {emergencyType === 'inundacion' && (
              <>
                <View style={styles.leyendaRow}>
                  <View style={[styles.leyendaColor, { backgroundColor: 'rgba(30,144,255,0.4)' }]} />
                  <Text style={styles.leyendaText}>Amenaza Media</Text>
                </View>
                <View style={styles.leyendaRow}>
                  <View style={[styles.leyendaColor, { backgroundColor: 'rgba(0,0,205,0.5)' }]} />
                  <Text style={styles.leyendaText}>Amenaza Alta</Text>
                </View>
              </>
            )}
            {emergencyType === 'movimiento_en_masa' && (
              <>
                <View style={styles.leyendaRow}>
                  <View style={[styles.leyendaColor, { backgroundColor: 'rgba(255,215,0,0.6)' }]} />
                  <Text style={styles.leyendaText}>Amenaza Baja</Text>
                </View>
                <View style={styles.leyendaRow}>
                  <View style={[styles.leyendaColor, { backgroundColor: 'rgba(255,140,0,0.6)' }]} />
                  <Text style={styles.leyendaText}>Amenaza Media</Text>
                </View>
                <View style={styles.leyendaRow}>
                  <View style={[styles.leyendaColor, { backgroundColor: 'rgba(139,0,0,0.7)' }]} />
                  <Text style={styles.leyendaText}>Amenaza Alta</Text>
                </View>
              </>
            )}
            {emergencyType === 'avenida_torrencial' && (
              <>
                <View style={styles.leyendaRow}>
                  <View style={[styles.leyendaColor, { backgroundColor: 'rgba(255,100,0,0.5)' }]} />
                  <Text style={styles.leyendaText}>Amenaza Media</Text>
                </View>
                <View style={styles.leyendaRow}>
                  <View style={[styles.leyendaColor, { backgroundColor: 'rgba(180,0,0,0.6)' }]} />
                  <Text style={styles.leyendaText}>Amenaza Alta</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Modo de Desplazamiento */}
        <Text style={styles.label}>Modo de Desplazamiento</Text>
        {emergencyType === 'ninguna' ? (
          <View style={styles.inicioDeshabilitado}>
            <MaterialIcons name="lock" size={16} color="#b0bec5" style={{ marginRight: 6 }} />
            <Text style={styles.inicioDeshabilitadoText}>Selecciona el tipo de emergencia primero</Text>
          </View>
        ) : (
          <View style={styles.buttonGroup}>
            {[
              { label: '🚶 A pie',      value: 'foot-walking'    },
              { label: '🚴 Bicicleta', value: 'cycling-regular' },
              { label: '🚗 Carro',     value: 'driving-car'     },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.optionButton, routeProfile === option.value && styles.optionButtonActive]}
                onPress={() => setRouteProfile(option.value as RouteProfile)}
              >
                <Text style={[styles.optionText, routeProfile === option.value && styles.optionTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {emergencyType !== 'ninguna' && routeProfile === null && (
          <Text style={styles.inlineHint}>Selecciona cómo te vas a desplazar</Text>
        )}

        {/* Inicio de la ruta */}
        <Text style={[styles.label, (emergencyType === 'ninguna' || routeProfile === null) && styles.labelDisabled]}>
          Inicio de la ruta
        </Text>

        {emergencyType !== 'ninguna' && routeProfile !== null ? (
          <View style={styles.buttonGroup}>
            {[
              { label: '📍 Mi ubicación',   value: 'gps'    },
              { label: '🗺️ Elegir en mapa', value: 'manual' },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.optionButton, startMode === option.value && styles.optionButtonActive]}
                onPress={() => {
                  setStartMode(option.value as StartMode);
                  setStartPoint(null);
                  if (option.value === 'gps') setShouldCenterOnUser(true);
                  navigation.closeDrawer();
                }}
              >
                <Text style={[styles.optionText, startMode === option.value && styles.optionTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.inicioDeshabilitado}>
            <MaterialIcons name="lock" size={16} color="#b0bec5" style={{ marginRight: 6 }} />
            <Text style={styles.inicioDeshabilitadoText}>
              Completa los pasos anteriores para seleccionar el inicio
            </Text>
          </View>
        )}

        {emergencyType !== 'ninguna' && routeProfile !== null && startMode === null && (
          <Text style={styles.inlineHint}>Selecciona desde dónde inicias la evacuación</Text>
        )}

        {/* ── Punto de Encuentro ─────────────────────────────────────────── */}
        <View onLayout={(e) => { destinosYRef.current = e.nativeEvent.layout.y; }}>
          <Text style={styles.sectionHeader}>📍 Punto de Encuentro</Text>
          <Text style={styles.sectionSubtitle}>Zonas seguras de reunión</Text>

          {parametrosBasicosListos && startMode !== null ? (
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.destinoCard, destinationMode === 'closest' && styles.destinoCardActive]}
                onPress={handleSelectClosest}
              >
                <View style={styles.destinoRow}>
                  <MaterialIcons
                    name="near-me"
                    size={20}
                    color={destinationMode === 'closest' ? '#ffffff' : '#118ab2'}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.destinoText, destinationMode === 'closest' && styles.destinoTextActive]}>
                    Punto más cercano
                  </Text>
                </View>
              </TouchableOpacity>

              {destinos.map((destino) => {
                const isSelected = destinationMode === 'selected' && selectedDestination?.id === destino.id && selectedInstitucion === null;
                return (
                  <TouchableOpacity
                    key={destino.id}
                    style={[styles.destinoCard, isSelected && styles.destinoCardActive]}
                    onPress={() => handleSelectDestino(destino)}
                  >
                    <View style={styles.destinoRow}>
                      <Text style={styles.destinoEmoji}>{iconoPorDestino[destino.nombre] ?? '📍'}</Text>
                      <Text style={[styles.destinoText, isSelected && styles.destinoTextActive]}>
                        {destino.nombre}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.inicioDeshabilitado}>
              <MaterialIcons name="lock" size={16} color="#b0bec5" style={{ marginRight: 6 }} />
              <Text style={styles.inicioDeshabilitadoText}>
                Completa los pasos anteriores para seleccionar el destino
              </Text>
            </View>
          )}
        </View>

        {/* ── Instituciones ──────────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>🏛️ Instituciones</Text>
        <Text style={styles.sectionSubtitle}>Hospitales, seguridad y más</Text>

        {parametrosBasicosListos && startMode !== null ? (
          <View style={{ marginTop: 8 }}>
            {instituciones.map((inst) => {
              const isSelected = selectedInstitucion?.id === inst.id;
              return (
                <TouchableOpacity
                  key={inst.id}
                  style={[styles.institucionCard, isSelected && styles.destinoCardActive]}
                  onPress={() => handleSelectInstitucion(inst)}
                >
                  <View style={styles.destinoRow}>
                    <Text style={styles.destinoEmoji}>{iconoPorInstitucion[inst.nombre] ?? '🏢'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.destinoText, isSelected && styles.destinoTextActive]}>
                        {inst.nombre}
                      </Text>
                      <Text style={[styles.institucionTipo, isSelected && { color: '#ffffffaa' }]}>
                        {inst.tipo}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.inicioDeshabilitado}>
            <MaterialIcons name="lock" size={16} color="#b0bec5" style={{ marginRight: 6 }} />
            <Text style={styles.inicioDeshabilitadoText}>
              Completa los pasos anteriores para seleccionar una institución
            </Text>
          </View>
        )}

        {parametrosBasicosListos && startMode !== null && !destinoListo && (
          <Text style={styles.inlineHint}>
            Selecciona un punto de encuentro o institución para continuar
          </Text>
        )}

        {/* ── Ver guía ───────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.verGuiaBtn}
          onPress={() => {
            navigation.closeDrawer();
            requestShowInstructivo();
          }}
        >
          <MaterialIcons name="help-outline" size={18} color="#118ab2" style={{ marginRight: 8 }} />
          <Text style={styles.verGuiaText}>Ver guía de uso</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#073b4c', padding: 16, paddingTop: 60 },
  card: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16, elevation: 8 },
  header: { backgroundColor: '#ef476f', padding: 14, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  headerText: { color: '#ffffff', fontWeight: 'bold', fontSize: 18 },
  label: { fontWeight: '600', color: '#073b4c', marginBottom: 8, marginTop: 12 },
  labelDisabled: { color: '#b0bec5' },
  sectionHeader: {
    fontWeight: '700', color: '#073b4c', fontSize: 14,
    marginTop: 20, marginBottom: 2,
    borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 16,
  },
  sectionSubtitle: { fontSize: 11, color: '#888', marginBottom: 4 },
  buttonGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  optionButton: {
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 20, backgroundColor: '#f4f4f4',
    borderWidth: 1, borderColor: '#e0e0e0',
    flexGrow: 1, minWidth: 90, alignItems: 'center',
  },
  optionButtonActive: { backgroundColor: '#118ab2', borderColor: '#118ab2' },
  optionText: { color: '#073b4c', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  optionTextActive: { color: '#ffffff' },
  emergencyGroup: { gap: 8, marginBottom: 8 },
  emergencyButton: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: '#f4f4f4',
    borderWidth: 1, borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  emergencyText: { color: '#073b4c', fontWeight: '600', fontSize: 14 },
  inlineHint: {
    fontSize: 12, color: '#856404',
    backgroundColor: '#fff3cd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    marginTop: 4, marginBottom: 4,
    borderLeftWidth: 3, borderLeftColor: '#ffc107',
  },
  leyendaBox: { marginTop: 8, padding: 10, backgroundColor: '#f7f7f7', borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#118ab2' },
  leyendaTitle: { fontWeight: '700', color: '#073b4c', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  leyendaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  leyendaColor: { width: 16, height: 16, borderRadius: 3, marginRight: 8, borderWidth: 1, borderColor: '#ccc' },
  leyendaText: { fontSize: 12, color: '#333' },
  destinoCard: {
    padding: 12, borderRadius: 12, backgroundColor: '#f7f7f7',
    marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#06d6a0', elevation: 2,
  },
  institucionCard: {
    padding: 12, borderRadius: 12, backgroundColor: '#f7f7f7',
    marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#118ab2', elevation: 2,
  },
  destinoCardActive: { backgroundColor: '#118ab2', borderLeftColor: '#073b4c' },
  destinoRow: { flexDirection: 'row', alignItems: 'center' },
  destinoEmoji: { fontSize: 18, marginRight: 10, width: 26, textAlign: 'center' },
  destinoText: { color: '#073b4c', fontWeight: '500', flex: 1 },
  destinoTextActive: { color: '#ffffff' },
  institucionTipo: { fontSize: 10, color: '#888', marginTop: 1 },
  inicioDeshabilitado: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#f4f4f4', borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0',
    marginBottom: 8,
  },
  inicioDeshabilitadoText: { color: '#b0bec5', fontSize: 12, flex: 1 },
  verGuiaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 20, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1, borderColor: '#118ab2',
  },
  verGuiaText: { color: '#118ab2', fontWeight: '600', fontSize: 13 },
});
