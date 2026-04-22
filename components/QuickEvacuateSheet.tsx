/**
 * Sheet de evacuación rápida — tres preguntas visibles en un mismo
 * modal: emergencia, origen y destino. Reemplaza la antigua cadena de
 * Alert.alert que encadenaba cada pregunta por separado.
 *
 * Modos:
 *  · modo estándar (desde Home) → muestra las 3 preguntas. Si el
 *    destino elegido es "institución o punto de encuentro" despliega
 *    una lista scrollable con ambos tipos mezclados para que el
 *    usuario escoja uno específico. Solo entonces se habilita
 *    "Empezar".
 *  · modo "locked" (desde Visor "Ir aquí") → el destino ya viene
 *    resuelto desde el caller (pin tocado en Visor). El sheet muestra
 *    sólo las preguntas 1 y 2; la 3 se reemplaza por un banner con el
 *    destino fijo. "Empezar" redirige al mapa y la ruta se auto-calcula.
 *
 * Accesibilidad: status bar transparente en Android (los notches
 * devices no dejaban ver el handle del sheet porque el modal se
 * dibujaba detrás del status bar). maxHeight respeta safe-area top y
 * un scroll interno habilita sheets largos en pantallas cortas.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { EmergencyType } from "../src/types/graph";
import type { Destino, Institucion } from "../src/types/types";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type HazardKey = Exclude<EmergencyType, "ninguna">;
export type StartSource = "gps" | "manual";
// ★ v4.5: destino preelegido en la encuesta. Se propaga al MapView y
// determina si la ruta se autocalcula (closest) o si el usuario aún
// debe escoger un destino en el mapa (heatmap / instituciones).
export type DestChoice = "closest" | "heatmap" | "instituciones";

export interface LockedDestination {
  name: string;
  kind: "shelter" | "institucion";
  shelter?: Destino;
  institucion?: Institucion;
}

export interface ConfirmPayload {
  emergency: HazardKey;
  start: StartSource;
  destChoice: DestChoice | "locked";
  // Solo poblado cuando el usuario escogió un item específico desde la
  // lista (destChoice === "instituciones") o cuando venía "locked".
  shelter?: Destino;
  institucion?: Institucion;
}

interface EmergencyOption {
  value: HazardKey;
  label: string;
  emoji: string;
  color: string;
  bg: string;
}

const EMERGENCIES: EmergencyOption[] = [
  { value: "inundacion", label: "Inundación", emoji: "🌊", color: "#1d4ed8", bg: "#dbeafe" },
  { value: "movimiento_en_masa", label: "Movimiento en masa", emoji: "⛰️", color: "#b45309", bg: "#fef3c7" },
  { value: "avenida_torrencial", label: "Avenida torrencial", emoji: "🌪️", color: "#b91c1c", bg: "#fee2e2" },
];

interface StartOption {
  value: StartSource;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  description: string;
}

const STARTS: StartOption[] = [
  { value: "gps", label: "Mi ubicación", icon: "my-location", description: "Usa el GPS ahora mismo" },
  { value: "manual", label: "Elegir en el mapa", icon: "touch-app", description: "Toca un punto tú" },
];

interface DestOption {
  value: DestChoice;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  description: string;
}

// Tres caminos para el destino:
//  · closest       → el algoritmo elige el refugio más seguro/cercano.
//  · heatmap       → muestra isócronas y el usuario toca un refugio.
//  · instituciones → despliega lista mezclada de instituciones y puntos
//    de encuentro para elegir uno específico.
const DESTS: DestOption[] = [
  { value: "closest", label: "Refugio más cercano", icon: "near-me", description: "Auto: el más seguro" },
  { value: "heatmap", label: "Elegir en el mapa", icon: "layers", description: "Con mapa de tiempos" },
  { value: "instituciones", label: "Institución o punto de encuentro", icon: "local-hospital", description: "Elige uno de la lista" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (payload: ConfirmPayload) => void;
  /** Lista de puntos de encuentro para el selector "instituciones". */
  puntosEncuentro?: Destino[];
  /** Lista de instituciones (hospitales, policía, bomberos, etc.). */
  instituciones?: Institucion[];
  /** Si viene poblado, el sheet fija el destino y oculta la pregunta 3.
   *  Úsalo cuando el caller ya resolvió el destino (ej: "Ir aquí" sobre
   *  un pin específico en el Visor). */
  lockedDestination?: LockedDestination | null;
}

export default function QuickEvacuateSheet({
  visible,
  onClose,
  onConfirm,
  puntosEncuentro = [],
  instituciones = [],
  lockedDestination = null,
}: Props) {
  const insets = useSafeAreaInsets();
  const [emergency, setEmergency] = useState<HazardKey | null>(null);
  const [start, setStart] = useState<StartSource | null>(null);
  const [dest, setDest] = useState<DestChoice | null>(null);
  // Item específico elegido del selector cuando dest === "instituciones".
  const [chosenShelter, setChosenShelter] = useState<Destino | null>(null);
  const [chosenInstitucion, setChosenInstitucion] = useState<Institucion | null>(null);

  // Al cerrar y reabrir, queremos estado limpio — si el usuario vio la
  // hoja a medio llenar y cerró, no debería encontrarla igual al volver.
  useEffect(() => {
    if (!visible) {
      setEmergency(null);
      setStart(null);
      setDest(null);
      setChosenShelter(null);
      setChosenInstitucion(null);
    }
  }, [visible]);

  // Lista mezclada de refugios + instituciones cuando el usuario escoge
  // "institución o punto de encuentro". Ordenada alfabéticamente para
  // que el usuario pueda escanearla rápido.
  const destList = useMemo(() => {
    type Item =
      | { kind: "shelter"; item: Destino; name: string; icon: "place"; color: "#059669" }
      | { kind: "institucion"; item: Institucion; name: string; icon: "local-hospital"; color: "#b45309" };
    const items: Item[] = [
      ...puntosEncuentro.map(
        (p): Item => ({ kind: "shelter", item: p, name: p.nombre, icon: "place", color: "#059669" }),
      ),
      ...instituciones.map(
        (i): Item => ({
          kind: "institucion",
          item: i,
          name: i.nombre,
          icon: "local-hospital",
          color: "#b45309",
        }),
      ),
    ];
    items.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return items;
  }, [puntosEncuentro, instituciones]);

  // Modo locked: salta la pregunta 3 y sólo exige emergencia + origen.
  // Modo estándar: si dest === "instituciones", además hay que haber
  // elegido un item específico de la lista.
  const locked = lockedDestination !== null;
  const specificPicked = chosenShelter !== null || chosenInstitucion !== null;
  const canConfirm =
    emergency !== null &&
    start !== null &&
    (locked
      ? true
      : dest !== null && (dest !== "instituciones" || specificPicked));

  const handleConfirm = () => {
    if (!emergency || !start) return;
    if (locked && lockedDestination) {
      onConfirm({
        emergency,
        start,
        destChoice: "locked",
        shelter: lockedDestination.shelter,
        institucion: lockedDestination.institucion,
      });
      return;
    }
    if (!dest) return;
    onConfirm({
      emergency,
      start,
      destChoice: dest,
      shelter: chosenShelter ?? undefined,
      institucion: chosenInstitucion ?? undefined,
    });
  };

  // Cap del sheet: no puede pasar del safe-area top menos un margen
  // (para que el handle siempre sea visible). En Android sin notch los
  // insets.top pueden venir en 0: usamos un fallback fijo de 24.
  const maxSheetHeight = SCREEN_HEIGHT - Math.max(insets.top, 24) - 16;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // statusBarTranslucent evita que en Android el sheet se dibuje
      // detrás de la status bar sin respetar su altura. Combinado con
      // `maxSheetHeight` garantiza que el handle siempre esté visible.
      statusBarTranslucent={Platform.OS === "android"}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            {
              maxHeight: maxSheetHeight,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <MaterialIcons name="directions-run" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {locked ? "Calcular ruta" : "Evacuación rápida"}
              </Text>
              <Text style={styles.subtitle}>
                {locked
                  ? `Destino fijo: ${lockedDestination?.name}`
                  : "Te llevamos al refugio más seguro y cercano"}
              </Text>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionTitle}>1. ¿Qué emergencia?</Text>
            <View style={styles.row}>
              {EMERGENCIES.map((opt) => {
                const selected = emergency === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.card,
                      { backgroundColor: opt.bg, borderColor: selected ? opt.color : "transparent" },
                    ]}
                    onPress={() => setEmergency(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={opt.label}
                  >
                    <Text style={styles.cardEmoji}>{opt.emoji}</Text>
                    <Text style={[styles.cardLabel, { color: opt.color }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>2. ¿Desde dónde sales?</Text>
            <View style={styles.row}>
              {STARTS.map((opt) => {
                const selected = start === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.startCard,
                      { borderColor: selected ? "#dc2626" : "#e5e7eb" },
                      selected && styles.startCardSelected,
                    ]}
                    onPress={() => setStart(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={opt.label}
                  >
                    <MaterialIcons
                      name={opt.icon}
                      size={24}
                      color={selected ? "#dc2626" : "#475569"}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.startLabel,
                          selected && { color: "#dc2626" },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.startDescription}>{opt.description}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {locked ? (
              // En modo locked la pregunta 3 se reemplaza por un banner
              // informativo con el destino ya fijado.
              <>
                <Text style={styles.sectionTitle}>3. Destino</Text>
                <View style={styles.lockedBanner}>
                  <MaterialIcons
                    name={lockedDestination?.kind === "institucion" ? "local-hospital" : "place"}
                    size={22}
                    color="#dc2626"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lockedBannerLabel}>Seleccionado</Text>
                    <Text style={styles.lockedBannerName}>{lockedDestination?.name}</Text>
                  </View>
                  <MaterialIcons name="check-circle" size={22} color="#10b981" />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>3. ¿A qué destino?</Text>
                <View style={styles.destCol}>
                  {DESTS.map((opt) => {
                    const selected = dest === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.destCard,
                          { borderColor: selected ? "#dc2626" : "#e5e7eb" },
                          selected && styles.startCardSelected,
                        ]}
                        onPress={() => {
                          setDest(opt.value);
                          // Cambiar de opción limpia la selección específica
                          // — si el usuario había elegido un hospital y luego
                          // cambia a "refugio más cercano", no arrastramos
                          // ese item.
                          if (opt.value !== "instituciones") {
                            setChosenShelter(null);
                            setChosenInstitucion(null);
                          }
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={opt.label}
                      >
                        <MaterialIcons
                          name={opt.icon}
                          size={22}
                          color={selected ? "#dc2626" : "#475569"}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.startLabel,
                              selected && { color: "#dc2626" },
                            ]}
                          >
                            {opt.label}
                          </Text>
                          <Text style={styles.startDescription}>{opt.description}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Al elegir "instituciones", desplegamos la lista
                    mezclada. El usuario elige un item y ese destino se
                    manda como parte del payload al caller. */}
                {dest === "instituciones" && (
                  <View style={styles.destListWrap}>
                    <Text style={styles.destListHelp}>
                      Selecciona un lugar específico
                    </Text>
                    {destList.map((entry) => {
                      const selected =
                        (entry.kind === "shelter" && chosenShelter === entry.item) ||
                        (entry.kind === "institucion" && chosenInstitucion === entry.item);
                      return (
                        <TouchableOpacity
                          key={`${entry.kind}-${entry.name}`}
                          style={[
                            styles.destListRow,
                            selected && styles.destListRowSelected,
                          ]}
                          onPress={() => {
                            if (entry.kind === "shelter") {
                              setChosenShelter(entry.item as Destino);
                              setChosenInstitucion(null);
                            } else {
                              setChosenInstitucion(entry.item as Institucion);
                              setChosenShelter(null);
                            }
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={entry.name}
                        >
                          <MaterialIcons name={entry.icon} size={18} color={entry.color} />
                          <Text
                            style={[
                              styles.destListName,
                              selected && { color: "#dc2626", fontWeight: "800" },
                            ]}
                            numberOfLines={1}
                          >
                            {entry.name}
                          </Text>
                          {selected && (
                            <MaterialIcons name="check" size={18} color="#dc2626" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <TouchableOpacity
              style={[styles.primary, !canConfirm && styles.primaryDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
              accessibilityRole="button"
              accessibilityLabel="Empezar evacuación"
              accessibilityState={{ disabled: !canConfirm }}
            >
              <MaterialIcons
                name="directions-run"
                size={20}
                color={canConfirm ? "#fff" : "#9ca3af"}
              />
              <Text
                style={[
                  styles.primaryText,
                  !canConfirm && { color: "#9ca3af" },
                ]}
              >
                Empezar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancel}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  // `flexShrink: 1` es clave: sin él, el ScrollView dentro de un
  // contenedor con `maxHeight` no se hace scrolleable cuando el
  // contenido excede el tope — se recorta el final (p.ej. el botón
  // "Empezar" queda tapado). Con flexShrink el ScrollView ajusta su
  // altura al espacio restante y activa scroll.
  scroll: { flexShrink: 1 },
  // Padding inferior para que el último botón (Cancelar) no quede
  // pegado al borde del sheet cuando scrolleas hasta abajo.
  scrollContent: { paddingBottom: 8 },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 18,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  card: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    gap: 6,
    minHeight: 80,
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 28 },
  cardLabel: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  startCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: "#fff",
  },
  startCardSelected: { backgroundColor: "#fef2f2" },
  destCol: { flexDirection: "column", gap: 8 },
  destCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: "#fff",
  },
  // Lista de instituciones/puntos de encuentro que se despliega al
  // elegir la 3ra opción. NO tiene maxHeight — el ScrollView exterior
  // del sheet se encarga del scroll. Antes con maxHeight=240 los
  // items desbordaban visualmente y se pisaban con los botones
  // Empezar/Cancelar.
  destListWrap: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
  },
  destListHelp: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  destListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
  },
  destListRowSelected: {
    backgroundColor: "#fef2f2",
  },
  destListName: { flex: 1, fontSize: 13, color: "#0f172a", fontWeight: "600" },
  // Banner para el modo locked — muestra el destino fijo con check.
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#dc2626",
    backgroundColor: "#fef2f2",
  },
  lockedBannerLabel: {
    fontSize: 10,
    color: "#dc2626",
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  lockedBannerName: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "700",
    marginTop: 2,
  },
  startLabel: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  startDescription: { fontSize: 11, color: "#64748b", marginTop: 1 },
  primary: {
    marginTop: 20,
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryDisabled: {
    backgroundColor: "#e5e7eb",
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.3 },
  cancel: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
});
