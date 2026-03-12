import { MaterialIcons } from '@expo/vector-icons';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouteContext } from '../context/RouteContext';
import destinos from '../data/destinos.json';

export default function MainMenu({ navigation }: DrawerContentComponentProps) {
  const {
    routeProfile,
    setRouteProfile,
    setShouldCalculateRoute,
    setSelectedDestination,
    emergencyType,
    setEmergencyType,
    startMode,
    setStartMode,
    setStartPoint,
    setDestinationMode,
  } = useRouteContext();

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.card}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>🚨 EMERGENCIA</Text>
        </View>

        {/* Tipo de Emergencia */}
        <Text style={styles.label}>Tipo de Emergencia</Text>
        <View style={styles.buttonGroup}>
          {[
            { label: 'Ninguna',            value: 'ninguna',            emoji: '—'  },
            { label: 'Inundación',         value: 'inundacion',         emoji: '🌊' },
            { label: 'Movimiento en masa', value: 'movimiento_en_masa', emoji: '⛰️' },
            { label: 'Avenida torrencial', value: 'avenida_torrencial', emoji: '🌪️' },
          ].map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                emergencyType === option.value && styles.optionButtonActive,
              ]}
              onPress={() => setEmergencyType(option.value as any)}
            >
              <Text style={[
                styles.optionText,
                emergencyType === option.value && styles.optionTextActive,
              ]}>
                {option.emoji} {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Leyenda de colores segÃºn emergencia activa */}
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
        <View style={styles.buttonGroup}>
          {[
            { label: '🚶 A pie',      value: 'foot-walking'     },
            { label: '🚴 Bicicleta', value: 'cycling-regular'  },
            { label: '🚗 Carro',     value: 'driving-car'      },
          ].map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                routeProfile === option.value && styles.optionButtonActive,
              ]}
              onPress={() => setRouteProfile(option.value as any)}
            >
              <Text style={[
                styles.optionText,
                routeProfile === option.value && styles.optionTextActive,
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Inicio de la ruta */}
        <Text style={styles.label}>Inicio de la ruta</Text>
        <View style={styles.buttonGroup}>
          {[
            { label: '📍 Mi ubicación',   value: 'gps'    },
            { label: '🗺️ Elegir en mapa', value: 'manual' },
          ].map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                startMode === option.value && styles.optionButtonActive,
              ]}
              onPress={() => {
                setStartMode(option.value as any);
                if (option.value === 'gps') setStartPoint(null);
              }}
            >
              <Text style={[
                styles.optionText,
                startMode === option.value && styles.optionTextActive,
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* BotÃ³n principal */}
        <TouchableOpacity
          style={styles.mainButton}
          onPress={() => {
            setDestinationMode('closest');
            setSelectedDestination(null);
            setShouldCalculateRoute(true);
            navigation.closeDrawer();
          }}
        >
          <Text style={styles.mainButtonText}>IR AL PUNTO MÁS CERCANO</Text>
        </TouchableOpacity>

        {/* Lista destinos */}
        <Text style={styles.label}>Puntos de Evacuación</Text>
        <View style={{ marginTop: 8 }}>
          {destinos.map((destino) => (
            <TouchableOpacity
              key={destino.id}
              style={styles.destinoCard}
              onPress={() => {
                setDestinationMode('selected');
                setSelectedDestination(destino);
                setShouldCalculateRoute(true);
                navigation.closeDrawer();
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {destino.id === 1 && (
                  <MaterialIcons name="local-fire-department" size={20} color="#ef476f" style={{ marginRight: 8 }} />
                )}
                {destino.id === 2 && (
                  <MaterialIcons name="local-police" size={20} color="#118ab2" style={{ marginRight: 8 }} />
                )}
                {destino.id === 3 && (
                  <MaterialIcons name="account-balance" size={20} color="#06d6a0" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.destinoText}>{destino.nombre}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#073b4c',
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    elevation: 8,
  },
  header: {
    backgroundColor: '#ef476f',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  headerText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  label: {
    fontWeight: '600',
    color: '#073b4c',
    marginBottom: 8,
    marginTop: 12,
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  optionButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f4f4f4',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionButtonActive: {
    backgroundColor: '#118ab2',
    borderColor: '#118ab2',
  },
  optionText: {
    color: '#073b4c',
    fontWeight: '500',
    fontSize: 13,
  },
  optionTextActive: {
    color: '#ffffff',
  },
  leyendaBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#f7f7f7',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#118ab2',
  },
  leyendaTitle: {
    fontWeight: '700',
    color: '#073b4c',
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leyendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  leyendaColor: {
    width: 16,
    height: 16,
    borderRadius: 3,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  leyendaText: {
    fontSize: 12,
    color: '#333',
  },
  mainButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#ef476f',
    elevation: 6,
  },
  mainButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  destinoCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f7f7f7',
    marginBottom: 10,
    borderLeftWidth: 6,
    borderLeftColor: '#06d6a0',
    elevation: 3,
  },
  destinoText: {
    color: '#073b4c',
    fontWeight: '500',
  },
});
