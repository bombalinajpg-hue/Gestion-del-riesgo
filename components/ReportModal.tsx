/**
 * Modal de reporte ciudadano — versión mejorada.
 *
 * Cambios:
 *   - Captura de foto (cámara) o selección de biblioteca (expo-image-picker).
 *   - Campo severidad (leve/moderada/grave) como chips — 1 toque.
 *   - Validación visual: el botón "Enviar" destaca cuando todo está listo.
 *   - Layout más aireado, menos formulario-burocrático.
 *
 * Requisito de instalación:
 *   npx expo install expo-image-picker
 */

import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ReportSeverity, ReportType } from '../src/types/graph';
import { submitReport } from '../src/services/reportsService';
import { useAuth } from '../context/AuthContext';
import EmailVerificationGate from './EmailVerificationGate';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  initialLocation?: { lat: number; lng: number };
}

interface TypeOption {
  value: ReportType;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  { value: 'bloqueo_vial', label: 'Bloqueo vial', icon: 'block', color: '#dc2626' },
  { value: 'sendero_obstruido', label: 'Sendero obstruido', icon: 'directions-walk', color: '#ea580c' },
  { value: 'inundacion_local', label: 'Inundación puntual', icon: 'water', color: '#2563eb' },
  { value: 'deslizamiento_local', label: 'Deslizamiento', icon: 'landscape', color: '#7c2d12' },
  { value: 'riesgo_electrico', label: 'Riesgo eléctrico', icon: 'flash-on', color: '#f59e0b' },
  { value: 'refugio_saturado', label: 'Punto de encuentro saturado', icon: 'people', color: '#9333ea' },
  { value: 'refugio_cerrado', label: 'Punto de encuentro cerrado', icon: 'lock', color: '#6b7280' },
  { value: 'otro', label: 'Otro incidente', icon: 'more-horiz', color: '#475569' },
];

const SEVERITIES: { value: ReportSeverity; label: string; color: string; emoji: string }[] = [
  { value: 'leve', label: 'Leve', color: '#eab308', emoji: '🟡' },
  { value: 'moderada', label: 'Moderada', color: '#f97316', emoji: '🟠' },
  { value: 'grave', label: 'Grave', color: '#dc2626', emoji: '🔴' },
];

export default function ReportModal({
  visible,
  onClose,
  onSubmitted,
  initialLocation,
}: Props) {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<ReportSeverity | null>(null);
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    initialLocation ?? null,
  );
  const [locationState, setLocationState] = useState<
    "idle" | "loading" | "denied" | "disabled" | "error"
  >("idle");
  const [submitting, setSubmitting] = useState(false);

  // Resolver ubicación al abrir el modal. Flujo:
  //   1. Pedir permiso explícitamente (antes fallaba silencioso si el
  //      usuario nunca había otorgado la app el permiso de ubicación).
  //   2. Intentar `getLastKnownPositionAsync` (instantáneo, casi siempre
  //      tiene fix reciente).
  //   3. Si no hay fix, pedir `getCurrentPositionAsync` con accuracy
  //      `Balanced` (más rápido que High, suficiente para un reporte).
  //   4. Estados explícitos: loading/denied/disabled/error para que el
  //      UI pueda mostrar mensaje + retry en vez de deshabilitar el
  //      botón de publicar sin explicación.
  const resolveLocation = useCallback(async () => {
    setLocationState("loading");
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setLocationState("disabled");
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationState("denied");
        return;
      }
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        setLocation({ lat: last.coords.latitude, lng: last.coords.longitude });
        setLocationState("idle");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationState("idle");
    } catch (e) {
      console.warn("[ReportModal] location:", e);
      setLocationState("error");
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setSelectedType(null);
      setSelectedSeverity(null);
      setNote('');
      setPhotoUri(null);
      setSubmitting(false);
      return;
    }
    if (!location) {
      void resolveLocation();
    }
  }, [visible, location, resolveLocation]);

  // ─── Manejo de foto ──────────────────────────────────────────────────────

  const requestCameraPermission = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permiso necesario',
        'Para tomar foto necesitamos acceso a la cámara. Puedes activarlo en ajustes.',
      );
      return false;
    }
    return true;
  };

  const requestLibraryPermission = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permiso necesario',
        'Para seleccionar foto necesitamos acceso a tu biblioteca.',
      );
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    if (!(await requestCameraPermission())) return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.5, // JPEG 50% — archivos ~200KB, suficiente para confirmación visual
      exif: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const pickPhoto = async () => {
    if (!(await requestLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.5,
      exif: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handlePhotoPress = () => {
    if (photoUri) {
      // Si ya hay foto, ofrecer eliminar o reemplazar
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancelar', 'Tomar otra foto', 'Elegir de galería', 'Quitar'],
            cancelButtonIndex: 0,
            destructiveButtonIndex: 3,
          },
          (idx) => {
            if (idx === 1) takePhoto();
            else if (idx === 2) pickPhoto();
            else if (idx === 3) setPhotoUri(null);
          },
        );
      } else {
        Alert.alert('Foto', 'Elige una opción', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Tomar otra', onPress: takePhoto },
          { text: 'De galería', onPress: pickPhoto },
          { text: 'Quitar', style: 'destructive', onPress: () => setPhotoUri(null) },
        ]);
      }
    } else {
      // Sin foto, preguntar cámara o galería
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancelar', 'Tomar foto', 'Elegir de galería'],
            cancelButtonIndex: 0,
          },
          (idx) => {
            if (idx === 1) takePhoto();
            else if (idx === 2) pickPhoto();
          },
        );
      } else {
        Alert.alert('Adjuntar foto', 'Elige una opción', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Tomar foto', onPress: takePhoto },
          { text: 'De galería', onPress: pickPhoto },
        ]);
      }
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedType || !location) return;
    setSubmitting(true);
    try {
      const result = await submitReport({
        type: selectedType,
        lat: location.lat,
        lng: location.lng,
        note: note.trim() || undefined,
        severity: selectedSeverity ?? undefined,
        photoUri: photoUri ?? undefined,
      });
      if (!result.ok) {
        if (result.reason === 'rate_limited') {
          Alert.alert(
            'Reporte duplicado',
            'Ya registraste un reporte similar hace poco. Espera unos minutos antes de volver a reportar esta ubicación.',
          );
        } else {
          Alert.alert('Error', 'No se pudo guardar el reporte. Intenta de nuevo.');
        }
        return;
      }
      if (result.newPublicAlert) {
        Alert.alert(
          '✅ Alerta pública generada',
          `Tu reporte, junto con otros ciudadanos, ha sido promovido a alerta pública visible en el mapa.\n\nConfianza: ${Math.round(result.newPublicAlert.confidence * 100)}%`,
        );
      } else {
        Alert.alert(
          'Reporte enviado',
          'Gracias. Si otros ciudadanos confirman lo mismo en esta zona, se mostrará como alerta pública en el mapa.',
        );
      }
      onSubmitted?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = selectedType !== null && location !== null && !submitting;
  const selectedTypeOpt = TYPE_OPTIONS.find((t) => t.value === selectedType);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {!user?.emailVerified ? (
          <View style={styles.sheet}>
            <EmailVerificationGate
              title="Reportar incidente"
              action="enviar reportes ciudadanos"
              onClose={onClose}
            />
          </View>
        ) : (
        <View style={styles.sheet}>
          {/* Handle visual de "arrastre" */}
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Reportar incidente</Text>
              <Text style={styles.subtitle}>
                Tu reporte ayuda a otros ciudadanos
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Cerrar"
            >
              <MaterialIcons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ maxHeight: 520 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {/* TIPO — grid de 2 columnas */}
            <Text style={styles.sectionLabel}>¿Qué está pasando?</Text>
            <View style={styles.typeGrid}>
              {TYPE_OPTIONS.map((opt) => {
                const isSelected = selectedType === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.typeChip,
                      isSelected && {
                        borderColor: opt.color,
                        backgroundColor: `${opt.color}12`,
                      },
                    ]}
                    onPress={() => setSelectedType(opt.value)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={opt.icon}
                      size={18}
                      color={isSelected ? opt.color : '#6b7280'}
                    />
                    <Text
                      style={[
                        styles.typeChipLabel,
                        isSelected && { color: opt.color, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* SEVERIDAD — aparece solo después de elegir tipo */}
            {selectedType && (
              <>
                <Text style={styles.sectionLabel}>¿Qué tan grave es?</Text>
                <View style={styles.severityRow}>
                  {SEVERITIES.map((s) => {
                    const isSelected = selectedSeverity === s.value;
                    return (
                      <TouchableOpacity
                        key={s.value}
                        style={[
                          styles.severityChip,
                          isSelected && {
                            backgroundColor: s.color,
                            borderColor: s.color,
                          },
                        ]}
                        onPress={() => setSelectedSeverity(s.value)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.severityEmoji}>{s.emoji}</Text>
                        <Text
                          style={[
                            styles.severityLabel,
                            isSelected && { color: '#fff', fontWeight: '700' },
                          ]}
                        >
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* FOTO — chip grande con preview */}
            {selectedType && (
              <>
                <Text style={styles.sectionLabel}>Foto (opcional)</Text>
                <TouchableOpacity
                  style={styles.photoBox}
                  onPress={handlePhotoPress}
                  activeOpacity={0.8}
                >
                  {photoUri ? (
                    <>
                      <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                      <View style={styles.photoOverlay}>
                        <MaterialIcons name="edit" size={18} color="#fff" />
                        <Text style={styles.photoOverlayText}>Cambiar</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <MaterialIcons
                        name="add-a-photo"
                        size={32}
                        color="#9ca3af"
                      />
                      <Text style={styles.photoPlaceholderText}>
                        Tomar foto o elegir de galería
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* NOTA — solo después de tipo */}
            {selectedType && (
              <>
                <Text style={styles.sectionLabel}>Detalles (opcional)</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Describe brevemente lo que observas..."
                  placeholderTextColor="#9ca3af"
                  value={note}
                  onChangeText={(t) => setNote(t.slice(0, 200))}
                  multiline
                  numberOfLines={3}
                />
                <Text style={styles.charCount}>{note.length}/200</Text>
              </>
            )}

            {/* UBICACIÓN — estados explícitos para que el usuario sepa
                por qué el botón está deshabilitado (si lo está). */}
            <View style={styles.locationInfo}>
              <MaterialIcons
                name={location ? 'location-on' : 'location-off'}
                size={16}
                color={
                  location ? '#10b981'
                  : locationState === 'loading' ? '#6366f1'
                  : '#dc2626'
                }
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.locationText}>
                  {location
                    ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
                    : locationState === 'loading' ? 'Obteniendo ubicación...'
                    : locationState === 'denied' ? 'Permiso de ubicación denegado'
                    : locationState === 'disabled' ? 'GPS desactivado'
                    : locationState === 'error' ? 'No se pudo obtener ubicación'
                    : 'Sin ubicación'}
                </Text>
              </View>
              {!location && locationState !== 'loading' && (
                <TouchableOpacity
                  onPress={resolveLocation}
                  style={styles.retryBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Reintentar obtener ubicación"
                >
                  <Text style={styles.retryBtnText}>Reintentar</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.privacyNote}>
              📡 El reporte es anónimo. Se requieren 3+ ciudadanos para que
              aparezca como alerta pública en el mapa.
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              selectedTypeOpt && canSubmit && {
                backgroundColor: selectedTypeOpt.color,
              },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.submitButtonText}>
              {submitting ? 'Enviando...' : 'Enviar reporte'}
            </Text>
          </TouchableOpacity>
        </View>
        )}
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
    justifyContent: 'space-between',
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    minWidth: '47%',
    gap: 6,
  },
  typeChipLabel: { fontSize: 13, color: '#374151', flex: 1 },
  severityRow: { flexDirection: 'row', gap: 8 },
  severityChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  severityEmoji: { fontSize: 18 },
  severityLabel: { fontSize: 12, color: '#374151', marginTop: 2 },
  photoBox: {
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  photoOverlayText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  photoPlaceholderText: { fontSize: 12, color: '#6b7280' },
  noteInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 70,
    textAlignVertical: 'top',
    backgroundColor: '#f9fafb',
  },
  charCount: {
    fontSize: 10,
    color: '#9ca3af',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    gap: 6,
  },
  locationText: { fontSize: 12, color: '#374151' },
  retryBtn: {
    backgroundColor: '#4338ca',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  retryBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  privacyNote: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 10,
    lineHeight: 16,
  },
  submitButton: {
    backgroundColor: '#ef476f',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: { backgroundColor: '#d1d5db' },
  submitButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
