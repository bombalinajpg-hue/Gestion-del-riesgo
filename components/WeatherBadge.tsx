/**
 * Widget de clima — versión icono + modal.
 *
 * Antes era un banner expandible inline que podía solaparse con la
 * información de ruta. Ahora es un ícono compacto en el header con
 * un indicador de color (nivel de riesgo), y el detalle se abre
 * en un modal centrado que no interfiere con nada.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  type CurrentWeather,
  getCachedWeather,
} from '../src/services/weatherService';

const RISK_COLORS: Record<CurrentWeather['riskLevel'], string> = {
  normal: '#10b981',
  atento: '#eab308',
  elevado: '#f97316',
  critico: '#dc2626',
};

const RISK_LABELS: Record<CurrentWeather['riskLevel'], string> = {
  normal: 'Condiciones normales',
  atento: 'Atento',
  elevado: 'Riesgo elevado',
  critico: 'Riesgo crítico',
};

interface Props {
  latitude?: number;
  longitude?: number;
}

export default function WeatherBadge({ latitude, longitude }: Props) {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const w = await getCachedWeather(latitude, longitude);
      if (!cancelled) setWeather(w);
    };
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [latitude, longitude]);

  if (!weather) {
    // Placeholder compacto mientras carga — mantiene posición fija
    return (
      <View style={[styles.iconButton, { backgroundColor: '#e5e7eb' }]}>
        <MaterialIcons name="cloud" size={20} color="#9ca3af" />
      </View>
    );
  }

  const color = RISK_COLORS[weather.riskLevel];

  return (
    <>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
        accessibilityLabel={`Clima: ${weather.weatherDescription}, ${RISK_LABELS[weather.riskLevel]}`}
      >
        <Text style={styles.iconEmoji}>{weather.weatherIcon}</Text>
        <View style={[styles.riskDot, { backgroundColor: color }]} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => { /* swallow */ }}>
            <View style={[styles.modalCard, { borderTopColor: color }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalEmoji}>{weather.weatherIcon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTemp}>
                    {Math.round(weather.temperatureC)}°C
                  </Text>
                  <Text style={styles.modalDesc}>
                    {weather.weatherDescription}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.closeBtn}
                >
                  <MaterialIcons name="close" size={20} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={[styles.riskBanner, { backgroundColor: color }]}>
                <MaterialIcons
                  name={
                    weather.riskLevel === 'normal' ? 'check-circle' : 'warning'
                  }
                  size={18}
                  color="#fff"
                />
                <Text style={styles.riskText}>
                  {RISK_LABELS[weather.riskLevel]}
                </Text>
              </View>

              <View style={styles.metricsGrid}>
                <MetricCell
                  icon="water-drop"
                  label="Lluvia (1h)"
                  value={`${weather.rainMmLastHour.toFixed(1)} mm`}
                />
                <MetricCell
                  icon="opacity"
                  label="Humedad"
                  value={`${Math.round(weather.humidityPct)}%`}
                />
                <MetricCell
                  icon="air"
                  label="Viento"
                  value={`${Math.round(weather.windSpeedKmh)} km/h`}
                />
              </View>

              {weather.riskLevel !== 'normal' && (
                <View style={styles.advice}>
                  <Text style={styles.adviceText}>
                    {adviceFor(weather.riskLevel)}
                  </Text>
                </View>
              )}

              <Text style={styles.source}>{weather.source}</Text>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function adviceFor(level: CurrentWeather['riskLevel']): string {
  switch (level) {
    case 'atento':
      return '💡 Suelo potencialmente saturado. Evita zonas de ladera y quebradas.';
    case 'elevado':
      return '⚠️ Lluvia sostenida. Pospone desplazamientos por zonas de riesgo si es posible.';
    case 'critico':
      return '🚨 Lluvia intensa o tormenta activa. Busca refugio en lugar seguro y mantente alerta a posibles evacuaciones.';
    default:
      return '';
  }
}

function MetricCell({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <MaterialIcons name={icon} size={18} color="#6b7280" />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    backgroundColor: '#ffffffee',
    width: 46,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    position: 'relative',
  },
  iconEmoji: { fontSize: 22 },
  riskDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    width: 320,
    maxWidth: '100%',
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalEmoji: { fontSize: 42, marginRight: 10 },
  modalTemp: { fontSize: 28, fontWeight: '800', color: '#111827' },
  modalDesc: { fontSize: 13, color: '#6b7280', marginTop: -2 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
    marginBottom: 14,
  },
  riskText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  metricsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metric: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  metricLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  advice: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  adviceText: { fontSize: 12, color: '#78350f', lineHeight: 17 },
  source: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 6,
  },
});
