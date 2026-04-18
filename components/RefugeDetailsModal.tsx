/**
 * Bottom sheet con detalles de un refugio/punto de encuentro.
 *
 * Se abre al tocar el marcador del destino en el mapa (o directamente
 * desde el menú). Muestra nombre, capacidad con barra de ocupación,
 * servicios disponibles como chips, responsable y contacto con link
 * a teléfono.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { RefugeDetails } from '../src/types/v4';
import { SERVICE_METADATA } from '../src/services/refugesService';

interface Props {
  visible: boolean;
  onClose: () => void;
  refuge: RefugeDetails | null;
  /** Callback para abrir direcciones hacia el refugio */
  onNavigate?: () => void;
  /** Callback para ver en Street View */
  onStreetView?: () => void;
}

export default function RefugeDetailsModal({
  visible,
  onClose,
  refuge,
  onNavigate,
  onStreetView,
}: Props) {
  if (!refuge) return null;

  const ocupacion =
    refuge.capacidadMax && refuge.capacidadActual !== undefined
      ? refuge.capacidadActual / refuge.capacidadMax
      : null;

  const ocupacionColor = ocupacion === null
    ? '#9ca3af'
    : ocupacion >= 0.9 ? '#dc2626'
    : ocupacion >= 0.7 ? '#f97316'
    : '#10b981';

  const ocupacionLabel = ocupacion === null
    ? 'Sin datos'
    : ocupacion >= 0.9 ? 'Saturado'
    : ocupacion >= 0.7 ? 'Alta ocupación'
    : ocupacion >= 0.3 ? 'Ocupación media'
    : 'Disponible';

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
              <Text style={styles.title}>{refuge.nombre}</Text>
              <Text style={styles.subtitle}>Punto de encuentro oficial</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ maxHeight: 480 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Capacidad */}
            {refuge.capacidadMax && (
              <View style={styles.capacidadCard}>
                <View style={styles.capacidadHeader}>
                  <MaterialIcons name="people" size={20} color="#374151" />
                  <Text style={styles.capacidadTitle}>Capacidad</Text>
                  <Text style={[styles.capacidadEstado, { color: ocupacionColor }]}>
                    {ocupacionLabel}
                  </Text>
                </View>
                <View style={styles.capacidadBar}>
                  <View
                    style={[
                      styles.capacidadFill,
                      {
                        width: `${Math.min(100, (ocupacion ?? 0) * 100)}%`,
                        backgroundColor: ocupacionColor,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.capacidadNumbers}>
                  {refuge.capacidadActual ?? 0} / {refuge.capacidadMax} personas
                </Text>
              </View>
            )}

            {/* Servicios */}
            {refuge.servicios.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Servicios disponibles</Text>
                <View style={styles.servicesGrid}>
                  {refuge.servicios.map((tag) => {
                    const meta = SERVICE_METADATA[tag];
                    return (
                      <View key={tag} style={styles.serviceChip}>
                        <Text style={styles.serviceIcon}>{meta.icon}</Text>
                        <Text style={styles.serviceLabel}>{meta.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Horario */}
            {refuge.horario && (
              <View style={styles.infoRow}>
                <MaterialIcons name="schedule" size={18} color="#6b7280" />
                <Text style={styles.infoText}>{refuge.horario}</Text>
              </View>
            )}

            {/* Responsable */}
            {refuge.responsable && (
              <View style={styles.infoRow}>
                <MaterialIcons name="person" size={18} color="#6b7280" />
                <Text style={styles.infoText}>{refuge.responsable}</Text>
              </View>
            )}

            {/* Teléfono — tappable */}
            {refuge.telefonoContacto && (
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() => Linking.openURL(`tel:${refuge.telefonoContacto}`)}
              >
                <MaterialIcons name="phone" size={18} color="#2563eb" />
                <Text style={[styles.infoText, { color: '#2563eb' }]}>
                  {refuge.telefonoContacto}
                </Text>
              </TouchableOpacity>
            )}

            {/* Descripción */}
            {refuge.descripcion && (
              <>
                <Text style={styles.sectionLabel}>Descripción</Text>
                <Text style={styles.descripcion}>{refuge.descripcion}</Text>
              </>
            )}

            {/* Notas importantes */}
            {refuge.notas && (
              <View style={styles.notasBox}>
                <MaterialIcons name="info" size={16} color="#78350f" />
                <Text style={styles.notasText}>{refuge.notas}</Text>
              </View>
            )}
          </ScrollView>

          {/* Acciones */}
          <View style={styles.actions}>
            {onNavigate && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#ef476f' }]}
                onPress={() => {
                  onNavigate();
                  onClose();
                }}
              >
                <MaterialIcons name="directions-run" size={18} color="#fff" />
                <Text style={styles.actionText}>Ir aquí</Text>
              </TouchableOpacity>
            )}
            {onStreetView && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#6366f1' }]}
                onPress={() => {
                  onStreetView();
                  onClose();
                }}
              >
                <MaterialIcons name="streetview" size={18} color="#fff" />
                <Text style={styles.actionText}>Vista 360°</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center', alignItems: 'center',
  },
  capacidadCard: {
    backgroundColor: '#f9fafb',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  capacidadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  capacidadTitle: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600' },
  capacidadEstado: { fontSize: 12, fontWeight: '700' },
  capacidadBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  capacidadFill: { height: '100%', borderRadius: 4 },
  capacidadNumbers: { fontSize: 11, color: '#6b7280', marginTop: 6 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 12, marginBottom: 8,
  },
  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  serviceIcon: { fontSize: 14 },
  serviceLabel: { fontSize: 12, color: '#065f46', fontWeight: '600' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  infoText: { fontSize: 13, color: '#374151' },
  descripcion: { fontSize: 13, color: '#374151', lineHeight: 20 },
  notasBox: {
    flexDirection: 'row',
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  notasText: { fontSize: 12, color: '#78350f', flex: 1, lineHeight: 17 },
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
