/**
 * StreetViewModal v4.1 — arregla pantalla negra usando un wrapper HTML.
 *
 * El problema con v4 (src={uri} directo): la WebView de React Native no da
 * al iframe de Google el contexto HTML que necesita para renderizar el
 * panorama WebGL. Carga la URL pero el canvas de Street View queda negro.
 *
 * Solución: cargamos una página HTML nuestra con source={{html}} que
 * embebe el iframe con los atributos `allow` correctos. La WebView
 * renderiza la página HTML completa, que a su vez renderiza el iframe
 * de Google con permisos para giroscopio/acelerómetro/fullscreen.
 *
 * Además:
 *   - Timeout de 10s: si no carga, ofrece abrir externo
 *   - Botón "abrir externo" siempre visible en el header
 *   - Mensaje informativo sobre cobertura limitada en zonas rurales
 */

import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // En Modal con presentationStyle="fullScreen" la SafeAreaView no siempre
  // aplica correctamente los insets en iOS. Tomamos los insets directo y
  // los aplicamos al header para que la X nunca quede tras el notch.
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openExternal = () => {
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}`;
    Linking.openURL(url).catch(() => {});
  };

  // Reset al abrir y empezar el timer de "no carga"
  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    setLoading(true);
    setTimedOut(false);
    // Si a los 10s seguimos cargando, mostrar fallback
    timerRef.current = setTimeout(() => {
      setTimedOut(true);
      setLoading(false);
    }, 10_000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, latitude, longitude]);

  // HTML que envuelve el iframe. Esto es lo que arregla la pantalla negra.
  const html = useMemo(() => {
    if (!API_KEY) return null;
    const src =
      `https://www.google.com/maps/embed/v1/streetview?key=${API_KEY}` +
      `&location=${latitude},${longitude}` +
      `&heading=0&pitch=0&fov=90`;
    return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
  iframe { width: 100%; height: 100%; border: 0; display: block; }
</style>
</head>
<body>
<iframe
  src="${src}"
  allow="accelerometer; gyroscope; fullscreen"
  allowfullscreen
  frameborder="0"
  loading="eager"
></iframe>
</body>
</html>`;
  }, [latitude, longitude]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header con padding-top explícito del notch para garantizar
            que la X nunca quede bajo la barra de estado. */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
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

        <View style={styles.webviewContainer}>
          {/* Caso 1: sin API key → fallback directo */}
          {!html ? (
            <View style={styles.messageOverlay}>
              <MaterialIcons name="vpn-key" size={48} color="#6b7280" />
              <Text style={styles.messageTitle}>Street View no configurado</Text>
              <Text style={styles.messageDetail}>
                Configura una API key de Google Maps (gratis, 10.000 cargas/mes)
                en el archivo .env como EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.
              </Text>
              <TouchableOpacity style={styles.messageButton} onPress={openExternal}>
                <MaterialIcons name="open-in-new" size={18} color="#ffffff" />
                <Text style={styles.messageButtonText}>Abrir en Google Maps</Text>
              </TouchableOpacity>
            </View>
          ) : timedOut ? (
            /* Caso 2: timeout de 10s → cobertura probablemente inexistente */
            <View style={styles.messageOverlay}>
              <MaterialIcons name="visibility-off" size={48} color="#6b7280" />
              <Text style={styles.messageTitle}>Sin cobertura aquí</Text>
              <Text style={styles.messageDetail}>
                Google Street View no tiene imágenes panorámicas en esta
                ubicación específica. En zonas rurales o calles secundarias
                la cobertura puede ser limitada.
              </Text>
              <TouchableOpacity style={styles.messageButton} onPress={openExternal}>
                <MaterialIcons name="map" size={18} color="#ffffff" />
                <Text style={styles.messageButtonText}>Abrir en Google Maps</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Caso 3: normal — WebView con HTML que contiene el iframe */
            <WebView
              source={{ html }}
              style={styles.webview}
              originWhitelist={['https://*.google.com', 'https://*.googleapis.com', 'https://*.gstatic.com']}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              mixedContentMode="compatibility"
              setSupportMultipleWindows={false}
              onLoadEnd={() => {
                setLoading(false);
                if (timerRef.current) clearTimeout(timerRef.current);
              }}
              onError={() => {
                setTimedOut(true);
                setLoading(false);
              }}
              onHttpError={() => {
                setTimedOut(true);
                setLoading(false);
              }}
            />
          )}

          {/* Loading overlay */}
          {loading && html && !timedOut && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Cargando vista panorámica...</Text>
              <Text style={styles.loadingHint}>Puede tardar unos segundos</Text>
            </View>
          )}
        </View>

        {/* Footer con hint */}
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
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerSubtitle: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  webviewContainer: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.8)',
    gap: 12,
  },
  loadingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  loadingHint: { color: '#9ca3af', fontSize: 11 },
  messageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1f2937', paddingHorizontal: 32, gap: 8,
  },
  messageTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 12 },
  messageDetail: {
    color: '#9ca3af', fontSize: 13,
    textAlign: 'center', marginBottom: 16, lineHeight: 18,
  },
  messageButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 10, gap: 8,
  },
  messageButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, backgroundColor: '#111827', gap: 6,
  },
  footerText: { color: '#9ca3af', fontSize: 11 },
});