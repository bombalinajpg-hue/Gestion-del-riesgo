import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
    <View style={styles.wrapper}>
      <View style={styles.card}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>🚨 EMERGENCIA</Text>
        </View>

        {/* Emergencia */}
        <Text style={styles.label}>Tipo de Emergencia</Text>
        <Picker
          selectedValue={emergencyType}
          onValueChange={setEmergencyType}
          style={styles.picker}
        
        >
          <Picker.Item label="Ninguna" value="ninguna" />
          <Picker.Item label="Inundación" value="inundacion" />
          <Picker.Item label="Derrumbe" value="derrumbe" />
        </Picker>

        {/* Perfil */}
        <Text style={styles.label}>Modo de Desplazamiento</Text>
        <Picker
          selectedValue={routeProfile}
          onValueChange={setRouteProfile}
          style={styles.picker}
     
        >
          <Picker.Item label="🚶 A pie" value="foot-walking" />
          <Picker.Item label="🚴 En bicicleta" value="cycling-regular" />
          <Picker.Item label="🚗 En carro" value="driving-car" />
        </Picker>

        {/* Inicio */}
        <Text style={styles.label}>Inicio de la ruta</Text>
        <Picker
          selectedValue={startMode}
          onValueChange={(value) => {
            setStartMode(value);
            if (value === 'gps') setStartPoint(null);
          }}
          style={styles.picker}
      
        >
          <Picker.Item label="Usar mi ubicación" value="gps" />
          <Picker.Item label="Elegir punto en el mapa" value="manual" />
        </Picker>

        {/* Botón principal */}
        <TouchableOpacity
          style={styles.mainButton}
          onPress={() => {
            setDestinationMode('closest');
            setSelectedDestination(null);
            setShouldCalculateRoute(true);
            navigation.closeDrawer();
          }}
        >
          <Text style={styles.mainButtonText}>
            IR AL PUNTO DE ENCUENTRO MÁS CERCANO
          </Text>
        </TouchableOpacity>

        {/* Lista destinos */}
        <View style={{ marginTop: 16 }}>
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

    {/* Iconos en lista */}
    {destino.id === 1 && (
      <MaterialIcons
        name="local-fire-department"
        size={20}
        color="#ef476f"
        style={{ marginRight: 8 }}
      />
    )}

    {destino.id === 2 && (
      <MaterialIcons
        name="local-police"
        size={20}
        color="#118ab2"
        style={{ marginRight: 8 }}
      />
    )}

    {destino.id === 3 && (
      <MaterialIcons
        name="account-balance"
        size={20}
        color="#06d6a0"
        style={{ marginRight: 8 }}
      />
    )}

    <Text style={styles.destinoText}>
      {destino.nombre}
    </Text>

  </View>

</TouchableOpacity>
          ))}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  wrapper: {
    flex: 1,
    backgroundColor: '#073b4c',
    padding: 16,
  },

  card: {
    flex: 1,
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
    marginBottom: 4,
    marginTop: 8,
  },

  picker: {
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
    marginBottom: 8,
  },

  mainButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#118ab2',
    shadowColor: '#06d6a0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
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
