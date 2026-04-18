/**
 * Botón flotante de reporte ciudadano.
 *
 * Ahora se integra dentro de un View contenedor (leftActionColumn en
 * MapViewContainer) — su posición es relativa, no absoluta, para que
 * se apile con los otros botones de la columna izquierda.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onPress: () => void;
  nearbyAlertCount?: number;
  disabled?: boolean;
}

export default function ReportButton({
  onPress,
  nearbyAlertCount = 0,
  disabled = false,
}: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityLabel="Reportar incidente"
    >
      <MaterialIcons name="add-alert" size={22} color="#ffffff" />
      {nearbyAlertCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {nearbyAlertCount > 9 ? '9+' : nearbyAlertCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  buttonDisabled: { opacity: 0.4 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
