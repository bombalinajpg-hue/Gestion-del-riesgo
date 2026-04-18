/**
 * Modal "Estoy a salvo" — función humanitaria.
 *
 * Permite al usuario compartir rápidamente su estado y ubicación actual
 * con contactos de emergencia (WhatsApp, SMS, o el share sheet del SO).
 * El mensaje incluye ubicación clicable (URL de Google Maps) para que
 * los contactos puedan ver dónde está sin necesidad de apps adicionales.
 *
 * Por qué importa: en las primeras horas post-evento, los sistemas de
 * telefonía se saturan. Un mensaje corto de texto/WhatsApp tiene más
 * probabilidad de llegar que una llamada, y tranquiliza a los familiares
 * reduciendo el tráfico sobre los servicios de emergencia.
 */

import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Ubicación actual — si no se pasa, se consulta al abrir */
  location?: { latitude: number; longitude: number } | null;
  /** Nombre del punto de encuentro, si aplica */
  refugeName?: string;
}

type Status = 'safe' | 'evacuating' | 'need_help';

interface StatusOption {
  value: Status;
  label: string;
  icon: string;
  color: string;
  message: (refuge?: string) => string;
}

const OPTIONS: StatusOption[] = [
  {
    value: 'safe',
    label: 'Estoy a salvo',
    icon: '✅',
    color: '#10b981',
    message: (refuge) =>
      refuge
        ? `Estoy a salvo en ${refuge}. `
        : 'Estoy a salvo. ',
  },
  {
    value: 'evacuating',
    label: 'Estoy evacuando',
    icon: '🏃',
    color: '#f59e0b',
    message: () =>
      'Estoy en proceso de evacuación. Sigo la ruta recomendada hacia un punto de encuentro. ',
  },
  {
    value: 'need_help',
    label: 'Necesito ayuda',
    icon: '🆘',
    color: '#dc2626',
    message: () =>
      'Necesito ayuda, no puedo evacuar por mis propios medios. Mi ubicación actual: ',
  },
];

export default function SafetyStatusModal({
  visible,
  onClose,
  location: initialLocation,
  refugeName,
}: Props) {
  const [location, setLocation] = useState<
    { latitude: number; longitude: number } | null
  >(initialLocation ?? null);
  const [selectedStatus, setSelectedStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (!visible) {
      setSelectedStatus(null);
      return;
    }
    if (!location) {
      (async () => {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        } catch {
          // sin ubicación, el compartir seguirá funcionando con solo texto
        }
      })();
    }
  }, [visible]);

  const buildMessage = (status: Status): string => {
    const opt = OPTIONS.find((o) => o.value === status)!;
    const base = opt.message(refugeName);
    const ts = new Date().toLocaleString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
    const locPart = location
      ? `\n📍 https://www.google.com/maps?q=${location.latitude},${location.longitude}`
      : '';
    return `${base}\n🕐 ${ts}${locPart}\n\n— Enviado desde Rutas de Evacuación`;
  };

  const handleShare = async (status: Status) => {
    const message = buildMessage(status);
    try {
      await Share.share(
        { message, title: 'Actualización de estado' },
        { dialogTitle: 'Compartir estado' },
      );
      onClose();
    } catch {
      Alert.alert('No se pudo compartir', 'Intenta con WhatsApp o SMS.');
    }
  };

  const handleWhatsApp = async (status: Status) => {
    const message = buildMessage(status);
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const can = await Linking.canOpenURL(url);
    if (!can) {
      Alert.alert(
        'WhatsApp no disponible',
        'No se encontró la app instalada en tu dispositivo.',
      );
      return;
    }
    await Linking.openURL(url);
    onClose();
  };

  const handleSMS = async (status: Status) => {
    const message = buildMessage(status);
    const url = `sms:?body=${encodeURIComponent(message)}`;
    await Linking.openURL(url);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Compartir mi estado</Text>
              <Text style={styles.subtitle}>
                Avisa rápidamente a tus contactos
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Selector de estado */}
          <Text style={styles.sectionLabel}>¿Cuál es tu situación?</Text>
          <View style={styles.statusList}>
            {OPTIONS.map((opt) => {
              const selected = selectedStatus === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.statusOption,
                    selected && {
                      borderColor: opt.color,
                      backgroundColor: `${opt.color}0F`,
                    },
                  ]}
                  onPress={() => setSelectedStatus(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.statusIcon}>{opt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.statusLabel,
                        selected && { color: opt.color, fontWeight: '700' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  {selected && (
                    <MaterialIcons
                      name="check-circle"
                      size={22}
                      color={opt.color}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Preview del mensaje */}
          {selectedStatus && (
            <>
              <Text style={styles.sectionLabel}>Vista previa del mensaje</Text>
              <View style={styles.preview}>
                <Text style={styles.previewText}>
                  {buildMessage(selectedStatus)}
                </Text>
              </View>
            </>
          )}

          {/* Ubicación */}
          <View style={styles.locationChip}>
            <MaterialIcons
              name="location-on"
              size={16}
              color={location ? '#10b981' : '#9ca3af'}
            />
            <Text style={styles.locationText}>
              {location
                ? 'Ubicación incluida en el mensaje'
                : 'Obteniendo ubicación...'}
            </Text>
          </View>

          {/* Botones de envío */}
          {selectedStatus && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#25d366' }]}
                onPress={() => handleWhatsApp(selectedStatus)}
              >
                <MaterialIcons name="chat" size={18} color="#fff" />
                <Text style={styles.actionText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#3b82f6' }]}
                onPress={() => handleSMS(selectedStatus)}
              >
                <MaterialIcons name="sms" size={18} color="#fff" />
                <Text style={styles.actionText}>SMS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                onPress={() => handleShare(selectedStatus)}
              >
                <MaterialIcons name="share" size={18} color="#fff" />
                <Text style={styles.actionText}>Otro</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: { fontSize: 19, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  statusList: { gap: 8 },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    gap: 12,
  },
  statusIcon: { fontSize: 22 },
  statusLabel: { fontSize: 15, color: '#111827' },
  preview: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewText: { fontSize: 12, color: '#374151', lineHeight: 18 },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    gap: 6,
  },
  locationText: { fontSize: 12, color: '#374151' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
