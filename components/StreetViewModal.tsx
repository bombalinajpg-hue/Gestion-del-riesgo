/**
 * StreetViewModal — vista panorámica embebida con Google Maps Embed API.
 *
 * Usa la URL oficial https://www.google.com/maps/embed/v1/streetview
 * que SÍ está diseñada para renderizarse dentro de un iframe/WebView.
 * Requiere una API key de Google Maps Platform (free tier: 10k requests/mes
 * para Embed API, suficiente para cualquier uso de esta app).
 *
 * Setup:
 *   1. Crear API key en https://console.cloud.google.com/google/maps-apis
 *   2. Habilitar "Maps Embed API" en el proyecto
 *   3. Agregar la key como variable de entorno:
 *        .env → EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
 *   4. Reiniciar Expo: `npx expo start --clear`
 *
 * Si la key no está configurada, el modal muestra un estado de fallback
 * con un botón para abrir Google Maps externo.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

interface Props {
  visible: boolean;
  onClose: () => void;
  latitude: number;
  longitude: number;
  placeName?: string;
}

export default function StreetViewModal({
  visible,
  onClose,
  latitude,
  longitude,
  placeName,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const openExternal = () => {
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}`;
    Linking.openURL(url).catch(() => { /* noop */ });
  };

  const handleShow = () => {
    setLoading(true);
    setLoadError(false);
  };

  const embedUrl = API_KEY
    ? `https://www.google.com/maps/embed/v1/streetview?key=${API_KEY}` +
      `&location=${latitude},${longitude}` +
      `&heading=0&pitch=0&fov=90`
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      onShow={handleShow}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <MaterialIcons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Vista 360°</Text>
            {placeName && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>{placeName}</Text>
            )}
          </View>
          <TouchableOpacity onPress={openExternal} style={styles.headerButton}>
            <MaterialIcons name="open-in-new" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* WebView o fallback */}
        <View style={styles.webviewContainer}>
          {!embedUrl ? (
            // Sin API key → fallback directo
            <View style={styles.errorOverlay}>
              <MaterialIcons name="vpn-key" size={48} color="#6b7280" />
              <Text style={styles.errorTitle}>Street View no configurado</Text>
              <Text style={styles.errorDetail}>
                Para ver la vista 360° embebida en la app, configura una API
                key de Google Maps (gratis, 10.000 consultas/mes). Mientras
                tanto, puedes abrir Google Maps en una ventana externa.
              </Text>
              <TouchableOpacity style={styles.errorButton} onPress={openExternal}>
                <MaterialIcons name="open-in-new" size={18} color="#ffffff" />
                <Text style={styles.errorButtonText}>Abrir en Google Maps</Text>
              </TouchableOpacity>
            </View>
          ) : !loadError ? (
            <WebView
              source={{ uri: embedUrl }}
              style={styles.webview}
              startInLoadingState
              scalesPageToFit
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              onLoadEnd={() => setLoading(false)}
              onError={() => { setLoadError(true); setLoading(false); }}
              onHttpError={() => { setLoadError(true); setLoading(false); }}
            />
          ) : (
            <View style={styles.errorOverlay}>
              <MaterialIcons name="error-outline" size={48} color="#6b7280" />
              <Text style={styles.errorTitle}>No se pudo cargar la vista</Text>
              <Text style={styles.errorDetail}>
                Puede ser que no haya cobertura de Street View en este punto
                o que la API key esté restringida. Verifica en Google Cloud
                Console que "Maps Embed API" esté habilitada.
              </Text>
              <TouchableOpacity style={styles.errorButton} onPress={openExternal}>
                <MaterialIcons name="open-in-new" size={18} color="#ffffff" />
                <Text style={styles.errorButtonText}>Abrir en Google Maps</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && embedUrl && !loadError && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Cargando vista panorámica...</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <MaterialIcons name="info-outline" size={14} color="#9ca3af" />
          <Text style={styles.footerText}>
            Arrastra para rotar · Toca flechas para avanzar
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#111827',
  },
  headerButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  headerSubtitle: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  webviewContainer: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#111827',
    gap: 12,
  },
  loadingText: { color: '#9ca3af', fontSize: 13 },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1f2937',
    paddingHorizontal: 32,
    gap: 8,
  },
  errorTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginTop: 12 },
  errorDetail: {
    color: '#9ca3af', fontSize: 13,
    textAlign: 'center', marginBottom: 16, lineHeight: 18,
  },
  errorButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 10, gap: 8,
  },
  errorButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#111827',
    gap: 6,
  },
  footerText: { color: '#9ca3af', fontSize: 11 },
});
