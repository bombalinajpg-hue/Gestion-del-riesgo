/**
 * Ruta /cuenta — Cuenta del usuario.
 *
 * Tercera pestaña del bottom nav. Muestra los datos de la cuenta
 * autenticada con Firebase y permite cerrar sesión.
 *
 * Para la versión actual no hay edición de perfil ni login con Google
 * (trabajo futuro). Si el usuario no tiene sesión, la pantalla lo
 * redirige a /login automáticamente — esto no debería pasar porque
 * el AuthGate en _layout.tsx ya maneja la redirección global, pero
 * se deja como defensa.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomNavBar from "../components/BottomNavBar";
import { useAuth } from "../context/AuthContext";
import { resendEmailVerification } from "../src/services/firebaseAuth";

export default function CuentaScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  // Al entrar a la pantalla refrescamos el user desde Firebase para
  // que `emailVerified` refleje la última realidad. Firebase no avisa
  // al cliente cuando el backend marca el correo como verificado, por
  // eso lo forzamos aquí.
  useFocusEffect(
    useCallback(() => {
      void refreshUser();
    }, [refreshUser]),
  );

  const handleResendVerification = async () => {
    setResending(true);
    try {
      await resendEmailVerification();
      Alert.alert(
        "Correo enviado",
        "Te reenviamos el correo de verificación. Revisa tu bandeja (y la carpeta de spam).",
      );
    } catch (e) {
      Alert.alert(
        "No se pudo reenviar",
        e instanceof Error ? e.message : "Inténtalo más tarde.",
      );
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerified = async () => {
    setChecking(true);
    try {
      await refreshUser();
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      "Cerrar sesión",
      "¿Seguro que quieres cerrar tu sesión? Tus reportes seguirán guardados en el servidor.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            try {
              await signOut();
              // El AuthGate redirige a /login automáticamente.
            } catch (e) {
              Alert.alert(
                "No se pudo cerrar sesión",
                e instanceof Error ? e.message : "Intenta de nuevo.",
              );
              setSigningOut(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.titleBar}>
        <View style={styles.titleIconWrap}>
          <MaterialIcons name="person" size={22} color="#ffffff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mi cuenta</Text>
          <Text style={styles.titleSubtitle}>
            Sesión y datos del estudio
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollRoot}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {user && (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <MaterialIcons name="person" size={36} color="#0f766e" />
            </View>
            <Text style={styles.displayName}>
              {user.displayName || "Usuario EvacuApp"}
            </Text>
            <Text style={styles.email}>{user.email}</Text>

            <View style={styles.divider} />

            <Row
              icon="fingerprint"
              label="ID de usuario"
              value={user.uid.slice(0, 12) + "…"}
            />
            <Row
              icon="verified-user"
              label="Autenticación"
              value="Correo y contraseña"
            />
            <View style={styles.row}>
              <MaterialIcons
                name={user.emailVerified ? "mark-email-read" : "mark-email-unread"}
                size={20}
                color={user.emailVerified ? "#059669" : "#c2410c"}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Correo verificado</Text>
                <Text
                  style={[
                    styles.rowValue,
                    { color: user.emailVerified ? "#059669" : "#c2410c" },
                  ]}
                >
                  {user.emailVerified ? "✅ Verificado" : "⚠️ Sin verificar"}
                </Text>
              </View>
            </View>
            {!user.emailVerified && (
              <View style={styles.verifyActions}>
                <TouchableOpacity
                  style={[styles.verifyBtn, resending && { opacity: 0.5 }]}
                  onPress={handleResendVerification}
                  disabled={resending}
                >
                  <MaterialIcons name="send" size={16} color="#0f766e" />
                  <Text style={styles.verifyBtnText}>
                    {resending ? "Enviando…" : "Reenviar correo"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.verifyBtn, checking && { opacity: 0.5 }]}
                  onPress={handleCheckVerified}
                  disabled={checking}
                >
                  <MaterialIcons name="refresh" size={16} color="#0f766e" />
                  <Text style={styles.verifyBtnText}>
                    {checking ? "Comprobando…" : "Ya verifiqué"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sobre la aplicación</Text>
          <Row
            icon="location-on"
            label="Municipio"
            value="Santa Rosa de Cabal · Risaralda"
          />
          <Row
            icon="science"
            label="Fuente de los datos"
            value="Estudio Detallado ALDESARROLLO (2025)"
          />
          <Row
            icon="map"
            label="Sistema de referencia"
            value="MAGNA-SIRGAS · CTM12"
          />
        </View>

        <TouchableOpacity
          style={[styles.signOutBtn, signingOut && { opacity: 0.5 }]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
        >
          <MaterialIcons name="logout" size={20} color="#b91c1c" />
          <Text style={styles.signOutText}>
            {signingOut ? "Cerrando sesión..." : "Cerrar sesión"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Pasantía de grado · Ingeniería Catastral y Geodesia{"\n"}
          Universidad Distrital Francisco José de Caldas · 2026
        </Text>
      </ScrollView>

      <BottomNavBar active="cuenta" />
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <MaterialIcons name={icon} size={20} color="#64748b" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f5f9" },
  // Header estético con fondo teal (acento de la paleta),
  // ícono en chip translúcido y título + subtítulo con buena jerarquía.
  // Reemplaza el header blanco plano sin aire que reportó la usuaria.
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: "#0f766e",
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  titleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  titleSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
    marginTop: 2,
    fontWeight: "500",
  },
  scrollRoot: { flex: 1 },
  // Respeta el BottomNavBar (~64) + safe-area bottom. Sin esto la
  // última acción ("Cerrar sesión") quedaba tapada y el usuario no
  // podía interactuar con ella.
  content: { padding: 16, paddingBottom: 110, gap: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  displayName: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginTop: 10 },
  email: { fontSize: 13, color: "#64748b", marginTop: 2 },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    alignSelf: "stretch",
    marginVertical: 14,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  rowLabel: { fontSize: 11, color: "#64748b" },
  rowValue: { fontSize: 14, color: "#0f172a", fontWeight: "500", marginTop: 1 },
  verifyActions: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "stretch",
    marginTop: 10,
  },
  verifyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ccfbf1",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  verifyBtnText: {
    color: "#0f766e",
    fontWeight: "700",
    fontSize: 12,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  signOutText: { color: "#b91c1c", fontSize: 14, fontWeight: "700" },
  footer: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 4,
  },
});
