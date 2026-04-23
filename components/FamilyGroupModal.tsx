/**
 * Modal de grupo familiar.
 *
 * Tres vistas:
 *   - Sin grupo: botones "Crear" o "Unirse"
 *   - Formulario de crear o unirse (según elección)
 *   - Grupo activo: lista de miembros con nombre, último estado y
 *     botón para compartir mi ubicación y copiar el código.
 */

import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  buildShareMessage,
  createGroup,
  getAllGroups,
  getGroup,
  joinGroup,
  leaveGroup,
  updateMyLocation,
} from "../src/services/familyGroupsService";
import { apiMe } from "../src/services/apiMe";
import type { FamilyGroup } from "../src/types/v4";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Mode = "menu" | "create" | "join" | "view";

export default function FamilyGroupModal({ visible, onClose }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("menu");
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<FamilyGroup | null>(null);
  // `myUserId` es el UUID del user en nuestra DB (viene de /v1/me),
  // el MISMO valor que el backend guarda en `GroupMember.user_id`.
  // Con él identificamos cuál de los miembros del grupo soy "yo".
  // Antes usábamos `getDeviceId()` (id local del dispositivo), pero
  // después del refactor los `deviceId` en FamilyMember guardan
  // el user_id del backend — y si `getDeviceId()` devolvía vacío,
  // la comparación fallaba y nadie tenía badge "Tú". Usamos null
  // hasta cargar para no falsos negativos.
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // `autoSwitchToView`: al abrir el modal por primera vez y si ya hay
  // un grupo, saltamos directo a la vista del grupo en lugar de
  // mostrar el menú vacío. Pero tras crear/unirse, queremos que el
  // usuario vuelva al menú (con el hero "Mantén unida a tu familia")
  // para que vea el grupo recién creado listado — no al detalle del
  // grupo, que es confuso justo después de salir del formulario.
  const reload = async (opts: { autoSwitchToView?: boolean } = {}) => {
    const all = await getAllGroups();
    setGroups(all);
    // Cargamos mi UUID en paralelo. Si falla (sin internet, backend
    // caído), dejamos null y el badge "Tú" no se pinta — es mejor
    // que pintarlo en un miembro equivocado.
    try {
      const me = await apiMe();
      setMyUserId(me.id);
    } catch (e) {
      console.warn("[FamilyGroupModal] no se pudo cargar /me:", e);
      setMyUserId(null);
    }
    if (opts.autoSwitchToView && all.length > 0 && mode === "menu") {
      setActiveGroup(all[0]);
      setMode("view");
    }
  };

  // Polling cada 20 s mientras el modal esté abierto y viendo un grupo.
  // Trae el detalle fresco del backend (estados y ubicaciones de todos
  // los miembros) sin que el usuario tenga que cerrar y reabrir. Se
  // detiene automáticamente al cerrar el modal o al salir de "view".
  useEffect(() => {
    if (!visible || mode !== "view" || !activeGroup) return;
    const code = activeGroup.code;
    let cancelled = false;
    const tick = async () => {
      try {
        const fresh = await getGroup(code);
        if (!cancelled && fresh) setActiveGroup(fresh);
      } catch {}
    };
    const interval = setInterval(tick, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [visible, mode, activeGroup?.code]);

  useEffect(() => {
    if (!visible) {
      setMode("menu");
      return;
    }
    reload({ autoSwitchToView: true });
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          {(mode === "create" || mode === "join") && (
            <TouchableOpacity
              onPress={() => setMode("menu")}
              style={styles.headerBtn}
            >
              <MaterialIcons name="arrow-back" size={22} color="#374151" />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Grupo familiar</Text>
            <Text style={styles.subtitle}>
              {mode === "view"
                ? activeGroup?.name
                : "Encuentra a tu familia en emergencias"}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <MaterialIcons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>

        {mode === "menu" && (
          <MenuView
            groups={groups}
            onChooseGroup={(g) => {
              setActiveGroup(g);
              setMode("view");
            }}
            onCreate={() => setMode("create")}
            onJoin={() => setMode("join")}
          />
        )}

        {mode === "create" && (
          <CreateForm
            onCreated={async () => {
              // Tras crear (y compartir/"más tarde") volvemos al menú
              // principal con el hero. Ahí el usuario ve el grupo
              // listado y puede entrar al detalle tocándolo si quiere.
              setMode("menu");
              await reload();
            }}
          />
        )}

        {mode === "join" && (
          <JoinForm
            onJoined={async () => {
              // Al unirse tiene sentido ir al detalle del grupo — el
              // usuario quiere ver quién más está ahí.
              const all = await getAllGroups();
              setGroups(all);
              try {
                const me = await apiMe();
                setMyUserId(me.id);
              } catch (e) {
                console.warn("[FamilyGroupModal] no se pudo cargar /me:", e);
              }
              if (all.length > 0) {
                setActiveGroup(all[0]);
                setMode("view");
              } else {
                setMode("menu");
              }
            }}
          />
        )}

        {mode === "view" && activeGroup && (
          <GroupView
            group={activeGroup}
            myUserId={myUserId}
            onLeft={async () => {
              setActiveGroup(null);
              setMode("menu");
              await reload();
            }}
            onUpdated={async () => {
              await reload();
              if (activeGroup) {
                const g = (await getAllGroups()).find(
                  (x) => x.code === activeGroup.code,
                );
                if (g) setActiveGroup(g);
              }
            }}
            onOpenOnMap={(code) => {
              onClose();
              router.push({ pathname: "/visor", params: { familyCode: code } });
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ────────────────── MenuView ──────────────────

function MenuView({
  groups,
  onChooseGroup,
  onCreate,
  onJoin,
}: {
  groups: FamilyGroup[];
  onChooseGroup: (g: FamilyGroup) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.menuContent}>
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>👨‍👩‍👧‍👦</Text>
        <Text style={styles.heroTitle}>Mantén unida a tu familia</Text>
        <Text style={styles.heroText}>
          Crea un grupo con un código corto. Cada miembro ingresa el código para
          unirse. Así pueden compartir ubicación y estado durante una
          emergencia.
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.bigBtn, { backgroundColor: "#10b981" }]}
          onPress={onCreate}
        >
          <MaterialIcons name="group-add" size={28} color="#fff" />
          <Text style={styles.bigBtnText}>Crear grupo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bigBtn, { backgroundColor: "#3b82f6" }]}
          onPress={onJoin}
        >
          <MaterialIcons name="vpn-key" size={28} color="#fff" />
          <Text style={styles.bigBtnText}>Unirme</Text>
        </TouchableOpacity>
      </View>

      {groups.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Mis grupos</Text>
          {groups.map((g) => (
            <TouchableOpacity
              key={g.code}
              style={styles.groupRow}
              onPress={() => onChooseGroup(g)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.groupName}>{g.name}</Text>
                <Text style={styles.groupMeta}>
                  {g.members.length} miembro(s) · código {g.code}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ────────────────── CreateForm ──────────────────

function CreateForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [myName, setMyName] = useState("");

  const canSubmit = name.trim().length > 1 && myName.trim().length > 1;

  const handleCreate = async () => {
    try {
      const g = await createGroup({ name, myName });
      Alert.alert(
        "Grupo creado",
        `Tu código es: ${g.code}\n\nCompártelo con tu familia para que se unan.`,
        [
          {
            text: "Compartir ahora",
            onPress: async () => {
              try {
                await Share.share({ message: buildShareMessage(g) });
              } catch {}
              await onCreated();
            },
          },
          { text: "Más tarde", onPress: () => onCreated() },
        ],
      );
    } catch {
      Alert.alert("Error", "No se pudo crear el grupo.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.formContent}>
      <Text style={styles.label}>Nombre del grupo</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Familia Cataño"
        value={name}
        onChangeText={setName}
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Tu nombre</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Angie"
        value={myName}
        onChangeText={setMyName}
        placeholderTextColor="#9ca3af"
      />
      <TouchableOpacity
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        onPress={handleCreate}
        disabled={!canSubmit}
      >
        <Text style={styles.submitBtnText}>Crear grupo</Text>
      </TouchableOpacity>
      <Text style={styles.disclaimer}>
        El código es único y seguro. Solo quienes tengan el código pueden unirse
        al grupo.
      </Text>
    </ScrollView>
  );
}

// ────────────────── JoinForm ──────────────────

function JoinForm({ onJoined }: { onJoined: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [myName, setMyName] = useState("");

  const canSubmit = code.trim().length === 6 && myName.trim().length > 1;

  const handleJoin = async () => {
    try {
      const g = await joinGroup({ code, myName });
      Alert.alert("¡Unido al grupo!", `Ya eres parte de "${g.name}".`);
      await onJoined();
    } catch {
      Alert.alert("Error", "No se pudo unir al grupo.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.formContent}>
      <Text style={styles.label}>Código del grupo (6 caracteres)</Text>
      <TextInput
        style={[
          styles.input,
          {
            letterSpacing: 4,
            fontSize: 18,
            fontWeight: "700",
            textAlign: "center",
          },
        ]}
        placeholder="ABC123"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
        autoCapitalize="characters"
        maxLength={6}
        placeholderTextColor="#d1d5db"
      />
      <Text style={styles.label}>Tu nombre</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Angie"
        value={myName}
        onChangeText={setMyName}
        placeholderTextColor="#9ca3af"
      />
      <TouchableOpacity
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        onPress={handleJoin}
        disabled={!canSubmit}
      >
        <Text style={styles.submitBtnText}>Unirme al grupo</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ────────────────── GroupView ──────────────────

function GroupView({
  group,
  myUserId,
  onLeft,
  onUpdated,
  onOpenOnMap,
}: {
  group: FamilyGroup;
  // Null mientras carga — durante esa ventana no pintamos badge "Tú"
  // para no pintarlo equivocadamente en un miembro que no soy yo.
  myUserId: string | null;
  onLeft: () => Promise<void>;
  onUpdated: () => Promise<void>;
  onOpenOnMap: (code: string) => void;
}) {
  const [sharingLocation, setSharingLocation] = useState(false);

  const handleShareCode = async () => {
    try {
      await Share.share({ message: buildShareMessage(group) });
    } catch {}
  };

  const handleShareLocation = async () => {
    setSharingLocation(true);
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await updateMyLocation(group.code, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        status: "safe",
      });
      Alert.alert(
        "Ubicación compartida",
        "Tu ubicación se actualizó en el grupo. Todos los miembros podrán verla la próxima vez que abran el grupo familiar.",
      );
      await onUpdated();
    } catch {
      Alert.alert("Error", "No se pudo obtener tu ubicación.");
    } finally {
      setSharingLocation(false);
    }
  };

  const handleLeave = () => {
    Alert.alert("Salir del grupo", "¿Estás segura de salir de este grupo?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: async () => {
          await leaveGroup(group.code);
          await onLeft();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.groupContent}>
      {/* Código compartible */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Código del grupo</Text>
        <Text style={styles.codeValue}>{group.code}</Text>
        <TouchableOpacity
          style={[styles.codeBtn, { backgroundColor: "#25d366", marginTop: 4 }]}
          onPress={handleShareCode}
        >
          <MaterialIcons name="share" size={16} color="#fff" />
          <Text style={[styles.codeBtnText, { color: "#fff" }]}>
            Compartir por WhatsApp
          </Text>
        </TouchableOpacity>
      </View>

      {/* Botón compartir ubicación */}
      <TouchableOpacity
        style={[styles.shareLocBtn, sharingLocation && { opacity: 0.6 }]}
        onPress={handleShareLocation}
        disabled={sharingLocation}
      >
        <MaterialIcons name="my-location" size={22} color="#fff" />
        <Text style={styles.shareLocText}>
          {sharingLocation ? "Actualizando..." : "Compartir mi ubicación"}
        </Text>
      </TouchableOpacity>

      {/* Lista de miembros */}
      <Text style={styles.sectionLabel}>Miembros ({group.members.length})</Text>
      {group.members.map((m) => {
        // `deviceId` en FamilyMember guarda el user_id del backend
        // (ver familyGroupsService.memberFromApi). Solo pintamos "Tú"
        // cuando ya cargamos nuestro UUID — sin él, mejor no pintar
        // que pintar en la persona equivocada.
        const isMe = myUserId !== null && m.deviceId === myUserId;
        const statusEmoji =
          m.status === "safe"
            ? "✅"
            : m.status === "evacuating"
              ? "🏃"
              : m.status === "need_help"
                ? "🆘"
                : "❓";
        const statusLabel =
          m.status === "safe"
            ? "A salvo"
            : m.status === "evacuating"
              ? "Evacuando"
              : m.status === "need_help"
                ? "Necesita ayuda"
                : "Sin datos";
        const hasLocation = m.lat !== undefined && m.lng !== undefined;
        return (
          <TouchableOpacity
            key={m.deviceId}
            style={styles.memberRow}
            onPress={hasLocation ? () => onOpenOnMap(group.code) : undefined}
            disabled={!hasLocation}
            activeOpacity={hasLocation ? 0.7 : 1}
            accessibilityRole={hasLocation ? "button" : undefined}
            accessibilityLabel={hasLocation ? `Ver ubicación de ${m.name} en el mapa` : undefined}
          >
            <View style={styles.memberAvatar}>
              <Text style={styles.memberInitial}>
                {m.name.substring(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={styles.memberName}>{m.name}</Text>
                {isMe && <Text style={styles.meBadge}>Tú</Text>}
              </View>
              <Text style={styles.memberStatus}>
                {statusEmoji} {statusLabel}
                {m.lastUpdatedAt && ` · ${relativeTime(m.lastUpdatedAt)}`}
              </Text>
              {hasLocation && (
                <Text style={styles.memberLoc}>
                  📍 {m.lat!.toFixed(4)}, {m.lng!.toFixed(4)} · toca para ver en el mapa
                </Text>
              )}
            </View>
            {hasLocation && (
              <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
            )}
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
        <Text style={styles.leaveBtnText}>Salir del grupo</Text>
      </TouchableOpacity>

      <Text style={styles.disclaimer}>
        ⚠️ En esta versión, los datos del grupo se guardan localmente en cada
        dispositivo. Para sincronización entre miembros en tiempo real, el
        proyecto puede extenderse con un backend como Firebase o Supabase.
      </Text>
    </ScrollView>
  );
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 11, color: "#6b7280", marginTop: 1 },
  menuContent: { padding: 20 },
  hero: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  heroEmoji: { fontSize: 40, marginBottom: 8 },
  heroTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  heroText: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  actionRow: { flexDirection: "row", gap: 10 },
  bigBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    gap: 6,
  },
  bigBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  groupName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  groupMeta: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  formContent: { padding: 20, paddingBottom: 48 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
  },
  submitBtn: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },
  submitBtnDisabled: { backgroundColor: "#d1d5db" },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  disclaimer: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 14,
    lineHeight: 16,
    fontStyle: "italic",
  },
  groupContent: { padding: 20, paddingBottom: 48 },
  codeCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#10b981",
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  codeValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 6,
    marginVertical: 6,
  },
  codeActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  codeBtn: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
    alignItems: "center",
  },
  codeBtnText: { fontSize: 12, color: "#374151", fontWeight: "600" },
  shareLocBtn: {
    marginTop: 16,
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  shareLocText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  memberRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    gap: 12,
    alignItems: "center",
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
  },
  memberInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0369a1",
  },
  memberName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  meBadge: {
    marginLeft: 6,
    fontSize: 10,
    backgroundColor: "#eef2ff",
    color: "#4338ca",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    fontWeight: "700",
    overflow: "hidden",
  },
  memberStatus: { fontSize: 12, color: "#374151", marginTop: 2 },
  memberLoc: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  leaveBtn: {
    marginTop: 24,
    padding: 12,
    alignItems: "center",
  },
  leaveBtnText: { fontSize: 13, color: "#dc2626", fontWeight: "600" },
});
