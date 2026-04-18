/**
 * Modal de preparación para emergencias.
 *
 * Cambio en v4: usa SafeAreaView de react-native-safe-area-context en
 * vez de react-native (el nativo está deprecado).
 */

import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  type ItemCategory,
  PREPAREDNESS_CATALOG,
  type PreparednessState,
  getProgress,
  loadPreparedness,
  toggleItem,
} from '../src/services/preparednessService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PreparednessModal({ visible, onClose }: Props) {
  const [state, setState] = useState<PreparednessState>({ checkedIds: [] });

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setState(await loadPreparedness());
    })();
  }, [visible]);

  const handleToggle = async (itemId: string) => {
    const next = await toggleItem(itemId);
    setState(next);
  };

  const progress = getProgress(state);
  const isChecked = (id: string) => state.checkedIds.includes(id);

  const byCategory = PREPAREDNESS_CATALOG.reduce(
    (acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    },
    {} as Record<ItemCategory, typeof PREPAREDNESS_CATALOG>,
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Kit de emergencia</Text>
            <Text style={styles.subtitle}>Preparación 72 horas · UNGRD</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              {progress.checked} / {progress.total} items
            </Text>
            <Text style={[styles.progressPercent, { color: colorForProgress(progress.percent) }]}>
              {Math.round(progress.percent * 100)}%
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress.percent * 100}%`, backgroundColor: colorForProgress(progress.percent) },
              ]}
            />
          </View>
          <Text style={styles.progressHint}>
            {messageForProgress(progress.percent)}
          </Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {Object.entries(byCategory).map(([cat, items]) => {
            const category = cat as ItemCategory;
            const catChecked = items.filter((i) => isChecked(i.id)).length;
            return (
              <View key={category} style={styles.categorySection}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryIcon}>{CATEGORY_ICONS[category]}</Text>
                  <Text style={styles.categoryTitle}>{CATEGORY_LABELS[category]}</Text>
                  <Text style={styles.categoryCount}>{catChecked}/{items.length}</Text>
                </View>
                {items.map((item) => {
                  const checked = isChecked(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.item, checked && styles.itemChecked]}
                      onPress={() => handleToggle(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <MaterialIcons name="check" size={16} color="#ffffff" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemLabel, checked && styles.itemLabelChecked]}>
                          {item.label}
                        </Text>
                        {item.description && (
                          <Text style={styles.itemDescription}>{item.description}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
          <View style={styles.footer}>
            <MaterialIcons name="info-outline" size={16} color="#6b7280" />
            <Text style={styles.footerText}>
              Recomendaciones basadas en la UNGRD y la Defensa Civil Colombiana.
              Revisa tu kit cada 6 meses.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function colorForProgress(p: number): string {
  if (p >= 0.8) return '#10b981';
  if (p >= 0.5) return '#eab308';
  if (p >= 0.25) return '#f97316';
  return '#dc2626';
}

function messageForProgress(p: number): string {
  if (p >= 0.8) return '¡Excelente! Tu kit está casi completo.';
  if (p >= 0.5) return 'Vas por buen camino. Sigue completando.';
  if (p >= 0.25) return 'Comienza a reunir los elementos esenciales.';
  return 'Tu kit está sin preparar. Comienza con los básicos.';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  closeButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center', alignItems: 'center',
  },
  progressSection: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  progressRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', marginBottom: 8,
  },
  progressLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  progressPercent: { fontSize: 22, fontWeight: '800' },
  progressBar: {
    height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  progressHint: { fontSize: 11, color: '#6b7280', marginTop: 6, fontStyle: 'italic' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  categorySection: { marginTop: 16 },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 8,
  },
  categoryIcon: { fontSize: 16, marginRight: 6 },
  categoryTitle: {
    flex: 1, fontSize: 12, fontWeight: '700',
    color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8,
  },
  categoryCount: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  item: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  itemChecked: { backgroundColor: '#f0fdf4' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#d1d5db',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: '#10b981', borderColor: '#10b981' },
  itemLabel: { fontSize: 14, color: '#111827', fontWeight: '600' },
  itemLabelChecked: {
    color: '#065f46', textDecorationLine: 'line-through', fontWeight: '500',
  },
  itemDescription: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 16 },
  footer: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 20, marginTop: 16, gap: 8,
  },
  footerText: { fontSize: 11, color: '#6b7280', flex: 1, lineHeight: 16 },
});
