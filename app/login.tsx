/**
 * Pantalla de login / registro.
 *
 * Formulario simple con email + password + (opcional) nombre para signup.
 * Un toggle cambia entre "Iniciar sesión" y "Crear cuenta" para que sea
 * una sola pantalla en vez de dos rutas separadas.
 *
 * Redirige a `/` (Home) automáticamente cuando `user` deja de ser null —
 * el useEffect del AuthProvider dispara en cuanto Firebase confirma el
 * login. La navegación la hacemos con `router.replace` para que el
 * usuario no pueda "volver" al login con el back button.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const router = useRouter();
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Si ya hay sesión (p. ej. abriste la app y Firebase restauró la sesión
  // persistida), redirigimos a Home sin que el usuario tenga que hacer nada.
  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [user, router]);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Faltan datos", "Completa correo y contraseña.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim() || undefined);
      }
      // El useEffect de `user` se encarga del router.replace.
    } catch (e) {
      Alert.alert(
        mode === "signin" ? "No se pudo iniciar sesión" : "No se pudo crear la cuenta",
        e instanceof Error ? e.message : "Error desconocido",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View style={styles.logoBadge}>
              <MaterialIcons name="shield" size={32} color="#fff" />
            </View>
            <Text style={styles.title}>
              Evacu<Text style={{ color: "#ffd166" }}>App</Text>
            </Text>
            <Text style={styles.subtitle}>
              {isSignup ? "Crea tu cuenta" : "Inicia sesión para continuar"}
            </Text>
          </View>

          <View style={styles.card}>
            {isSignup && (
              <View style={styles.field}>
                <Text style={styles.label}>Nombre (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Tu nombre"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="tucorreo@ejemplo.com"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={isSignup ? "Mínimo 6 caracteres" : "Tu contraseña"}
                placeholderTextColor="#94a3b8"
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
            </View>

            <TouchableOpacity
              style={[styles.primary, submitting && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  {isSignup ? "Crear cuenta" : "Iniciar sesión"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchMode}
              onPress={() => setMode(isSignup ? "signin" : "signup")}
            >
              <Text style={styles.switchModeText}>
                {isSignup
                  ? "¿Ya tienes cuenta? Inicia sesión"
                  : "¿No tienes cuenta? Regístrate"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerNote}>
            EvacuApp — Santa Rosa de Cabal. Tus reportes ayudan a toda la
            comunidad durante emergencias.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#073b4c" },
  scroll: { flexGrow: 1, padding: 20, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: 28 },
  logoBadge: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: "#ef476f",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#ef476f", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  title: {
    color: "#fff", fontSize: 36, fontWeight: "900",
    letterSpacing: -0.5, marginTop: 16,
  },
  subtitle: { color: "#a5b4fc", fontSize: 14, marginTop: 4 },
  card: {
    backgroundColor: "#fff", padding: 20, borderRadius: 16, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", color: "#475569", letterSpacing: 0.3 },
  input: {
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: "#0f172a", backgroundColor: "#f8fafc",
  },
  primary: {
    backgroundColor: "#dc2626", paddingVertical: 14, borderRadius: 12,
    alignItems: "center", marginTop: 6,
    shadowColor: "#dc2626", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.4 },
  switchMode: { alignItems: "center", paddingVertical: 6 },
  switchModeText: { color: "#4338ca", fontSize: 13, fontWeight: "600" },
  footerNote: {
    color: "#94a3b8", fontSize: 11, textAlign: "center",
    marginTop: 24, paddingHorizontal: 16, lineHeight: 16,
  },
});
