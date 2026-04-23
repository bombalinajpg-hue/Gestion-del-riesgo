/**
 * Modal de personas desaparecidas.
 *
 * Dos vistas dentro del mismo modal:
 *   - Lista de desaparecidos activos (con foto, descripción, tiempo
 *     desde reporte, botón llamar contacto)
 *   - Formulario para reportar una nueva desaparición (foto, nombre,
 *     descripción, última ubicación, contacto)
 *
 * Acciones sobre reportes propios:
 *   - Marcar como encontrada (cambia status, se muestra con check verde)
 *   - Eliminar reporte
 */

import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  deleteReport,
  getAllMissing,
  markAsFound,
  reportMissing,
} from '../src/services/missingPersonsService';
import { getDeviceId } from '../src/services/reportsService';
import type { MissingPerson } from '../src/types/v4';
import { isValidPhone } from '../src/utils/validation';
import { useAuth } from '../context/AuthContext';
import EmailVerificationGate from './EmailVerificationGate';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type View_ = 'list' | 'report';

export default function MissingPersonsModal({ visible, onClose }: Props) {
  const { user } = useAuth();
  const [view, setView] = useState<View_>('list');
  const [missing, setMissing] = useState<MissingPerson[]>([]);
  const [myDeviceId, setMyDeviceId] = useState<string>('');

  const reload = async () => {
    setMissing(await getAllMissing());
    setMyDeviceId(await getDeviceId());
  };

  useEffect(() => {
    if (!visible) {
      setView('list');
      return;
    }
    reload();
  }, [visible]);

  const active = missing.filter((p) => p.status === 'desaparecida');
  const resolved = missing.filter((p) => p.status === 'encontrada');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {view === 'report' && (
            <TouchableOpacity
              onPress={() => setView('list')}
              style={styles.headerBtn}
            >
              <MaterialIcons name="arrow-back" size={22} color="#374151" />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {view === 'list' ? 'Personas desaparecidas' : 'Nuevo reporte'}
            </Text>
            <Text style={styles.subtitle}>
              {view === 'list'
                ? `${active.length} activos · ${resolved.length} resueltos`
                : 'Ayuda a encontrar a alguien'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <MaterialIcons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>

        {view === 'list' ? (
          <ListView
            active={active}
            resolved={resolved}
            myDeviceId={myDeviceId}
            onReload={reload}
            onNewReport={() => setView('report')}
          />
        ) : !user?.emailVerified ? (
          <EmailVerificationGate
            title="Reportar desaparecido"
            action="reportar una persona desaparecida"
            onClose={() => setView('list')}
          />
        ) : (
          <ReportForm onSubmitted={async () => { await reload(); setView('list'); }} />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ────────────────── ListView ──────────────────

function ListView({
  active,
  resolved,
  myDeviceId,
  onReload,
  onNewReport,
}: {
  active: MissingPerson[];
  resolved: MissingPerson[];
  myDeviceId: string;
  onReload: () => Promise<void>;
  onNewReport: () => void;
}) {
  const handleCard = (p: MissingPerson) => {
    const isMine = p.reporterDeviceId === myDeviceId;
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      {
        text: 'Llamar a contacto',
        onPress: () => Linking.openURL(`tel:${p.contactPhone}`),
      },
    ];
    if (isMine && p.status === 'desaparecida') {
      options.push({
        text: '✅ Marcar como encontrada',
        onPress: async () => {
          await markAsFound(p.id);
          await onReload();
        },
      });
      options.push({
        text: 'Eliminar reporte',
        style: 'destructive',
        onPress: async () => {
          Alert.alert('¿Eliminar?', 'Esta acción no se puede deshacer.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Eliminar',
              style: 'destructive',
              onPress: async () => {
                await deleteReport(p.id);
                await onReload();
              },
            },
          ]);
        },
      });
    }
    options.push({ text: 'Cerrar', style: 'cancel' });
    Alert.alert(p.name, p.description, options);
  };

  const render = ({ item }: { item: MissingPerson }) => {
    const hoursAgo = Math.floor(
      (Date.now() - new Date(item.lastSeenAt).getTime()) / 3_600_000,
    );
    const isMine = item.reporterDeviceId === myDeviceId;
    const resolvedStyle = item.status === 'encontrada';

    return (
      <TouchableOpacity
        style={[styles.card, resolvedStyle && styles.cardResolved]}
        onPress={() => handleCard(item)}
        activeOpacity={0.75}
      >
        <View style={styles.cardPhoto}>
          {item.photoUri ? (
            <Image source={{ uri: item.photoUri }} style={styles.cardPhotoImg} />
          ) : (
            <MaterialIcons name="person" size={32} color="#9ca3af" />
          )}
          {resolvedStyle && (
            <View style={styles.foundBadge}>
              <MaterialIcons name="check" size={12} color="#fff" />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.cardName}>{item.name}</Text>
            {item.approximateAge && (
              <Text style={styles.cardAge}>· {item.approximateAge} años</Text>
            )}
            {isMine && <Text style={styles.myBadge}>Mío</Text>}
          </View>
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.description}
          </Text>
          <View style={styles.cardFooter}>
            <MaterialIcons name="schedule" size={12} color="#9ca3af" />
            <Text style={styles.cardTime}>
              Hace {hoursAgo < 1 ? '<1' : hoursAgo}h
              {item.lastSeenPlace ? ` · ${item.lastSeenPlace}` : ''}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <FlatList
        data={[...active, ...resolved]}
        renderItem={render}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyTitle}>Sin reportes activos</Text>
            <Text style={styles.emptyText}>
              Si alguien está desaparecido, toca el botón para crear un reporte.
            </Text>
          </View>
        }
      />
      <TouchableOpacity style={styles.fab} onPress={onNewReport}>
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </>
  );
}

// ────────────────── ReportForm ──────────────────

function ReportForm({ onSubmitted }: { onSubmitted: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [lastSeenPlace, setLastSeenPlace] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {}
    })();
  }, []);

  const handlePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (libStatus !== 'granted') return;
    }

    const opts = { quality: 0.5 as const, allowsEditing: false, exif: false };
    const choice = Platform.OS === 'ios' ? await askIOSChoice() : await askAndroidChoice();
    let result;
    if (choice === 'camera') result = await ImagePicker.launchCameraAsync(opts);
    else if (choice === 'library') result = await ImagePicker.launchImageLibraryAsync(opts);
    else return;
    if (!result.canceled && result.assets[0]?.uri) setPhotoUri(result.assets[0].uri);
  };

  const askIOSChoice = (): Promise<'camera' | 'library' | null> =>
    new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancelar', 'Cámara', 'Galería'], cancelButtonIndex: 0 },
        (idx) => resolve(idx === 1 ? 'camera' : idx === 2 ? 'library' : null),
      );
    });

  const askAndroidChoice = (): Promise<'camera' | 'library' | null> =>
    new Promise((resolve) => {
      Alert.alert('Foto', 'Elige una opción', [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Cámara', onPress: () => resolve('camera') },
        { text: 'Galería', onPress: () => resolve('library') },
      ]);
    });

  const canSubmit =
    name.trim().length > 1 &&
    description.trim().length > 3 &&
    contactName.trim().length > 1 &&
    isValidPhone(contactPhone) &&
    location !== null;

  const handleSubmit = async () => {
    if (!canSubmit || !location) return;
    setSubmitting(true);
    try {
      await reportMissing({
        name,
        approximateAge: age ? parseInt(age, 10) : undefined,
        description,
        photoUri: photoUri ?? undefined,
        lastSeenLat: location.lat,
        lastSeenLng: location.lng,
        lastSeenPlace: lastSeenPlace.trim() || undefined,
        lastSeenAt: new Date().toISOString(),
        contactName,
        contactPhone,
      });
      Alert.alert(
        'Reporte creado',
        'El reporte quedó registrado. Comparte con familiares y autoridades.',
      );
      await onSubmitted();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el reporte.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContent}>
      {/* Foto */}
      <TouchableOpacity style={styles.photoBox} onPress={handlePhoto}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : (
          <>
            <MaterialIcons name="add-a-photo" size={32} color="#9ca3af" />
            <Text style={styles.photoHint}>Foto de la persona</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Nombre completo *</Text>
      <TextInput
        style={styles.input}
        placeholder="Nombre y apellido"
        value={name}
        onChangeText={setName}
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.label}>Edad aproximada</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: 45"
        value={age}
        onChangeText={setAge}
        keyboardType="number-pad"
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.label}>Descripción y señas particulares *</Text>
      <TextInput
        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
        placeholder="Ropa que vestía, altura, color de cabello, cicatrices..."
        value={description}
        onChangeText={setDescription}
        multiline
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.label}>Lugar donde fue vista por última vez</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Parque principal"
        value={lastSeenPlace}
        onChangeText={setLastSeenPlace}
        placeholderTextColor="#9ca3af"
      />

      <View style={styles.locationChip}>
        <MaterialIcons
          name="location-on"
          size={16}
          color={location ? '#10b981' : '#9ca3af'}
        />
        <Text style={styles.locationText}>
          {location
            ? 'Ubicación actual como referencia'
            : 'Obteniendo ubicación...'}
        </Text>
      </View>

      <Text style={styles.label}>Tu nombre / parentesco *</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Hijo de la persona"
        value={contactName}
        onChangeText={setContactName}
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.label}>Tu teléfono de contacto *</Text>
      <TextInput
        style={styles.input}
        placeholder="+57 ..."
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
        placeholderTextColor="#9ca3af"
      />

      <TouchableOpacity
        style={[
          styles.submitBtn,
          !canSubmit && styles.submitBtnDisabled,
        ]}
        onPress={handleSubmit}
        disabled={!canSubmit || submitting}
      >
        <Text style={styles.submitBtnText}>
          {submitting ? 'Enviando...' : 'Publicar reporte'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.disclaimer}>
        ⚠️ Este reporte es local y se comparte con otros usuarios de la app.
        No reemplaza el reporte oficial ante autoridades (Policía, Defensa Civil).
        Llama al 123 si es urgente.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  list: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 12,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  cardResolved: { opacity: 0.6 },
  cardPhoto: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  cardPhotoImg: { width: '100%', height: '100%' },
  foundBadge: {
    position: 'absolute', top: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#10b981',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardAge: { fontSize: 13, color: '#6b7280', marginLeft: 4 },
  myBadge: {
    marginLeft: 'auto',
    fontSize: 10,
    backgroundColor: '#eef2ff',
    color: '#4338ca',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
    overflow: 'hidden',
  },
  cardDesc: { fontSize: 12, color: '#374151', marginTop: 2, lineHeight: 16 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  cardTime: { fontSize: 11, color: '#9ca3af' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 4 },
  emptyText: { fontSize: 13, color: '#6b7280', textAlign: 'center', paddingHorizontal: 40 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#ef476f',
    justifyContent: 'center', alignItems: 'center',
    elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6,
  },
  formContent: { padding: 20, paddingBottom: 48 },
  photoBox: {
    height: 160,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 16,
  },
  photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoHint: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  locationChip: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 10, padding: 10,
    backgroundColor: '#fff', borderRadius: 10, gap: 6,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  locationText: { fontSize: 12, color: '#374151' },
  submitBtn: {
    backgroundColor: '#ef476f',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: { backgroundColor: '#d1d5db' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disclaimer: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 14,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
