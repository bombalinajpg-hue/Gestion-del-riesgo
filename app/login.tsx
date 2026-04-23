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

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
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
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Si ya hay sesión (p. ej. abriste la app y Firebase restauró la sesión
  // persistida), redirigimos a Home sin que el usuario tenga que hacer nada.
  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [user, router]);

  // Validación local ANTES de Firebase — sin esto, contraseñas cortas
  // caían en el error genérico de Firebase "auth/weak-password" y el
  // usuario veía "correo o contraseña incorrectos", confuso.
  const validateInputs = (): string | null => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return "Ingresa tu correo electrónico.";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!emailOk) return "El correo no parece válido. Revisa el formato.";
    if (!password) return "Ingresa tu contraseña.";
    if (mode === "signup") {
      if (password.length < 6) return "La contraseña debe tener mínimo 6 caracteres.";
      if (password !== passwordConfirm) return "Las contraseñas no coinciden.";
      if (!firstName.trim()) return "Ingresa tu nombre.";
      if (!lastName.trim()) return "Ingresa tu apellido.";
    }
    return null;
  };

  const submit = async () => {
    const validationError = validateInputs();
    if (validationError) {
      Alert.alert("Revisa los datos", validationError);
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
        await signUp(email.trim(), password, fullName || undefined);
        // Tras signup el usuario queda logueado y el useEffect de
        // `user` lo empuja al Home. La verificación del correo NO
        // bloquea el acceso: solo se pedirá al intentar enviar un
        // reporte ciudadano (ReportModal / MissingPersonsModal).
        Alert.alert(
          "Cuenta creada",
          `Te enviamos un correo de verificación a ${email.trim()}. Necesitarás confirmarlo para enviar reportes ciudadanos; el resto de la app está disponible ahora.`,
        );
      }
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
    <ImageBackground
      source={require("../assets/images/brand/login-background.png")}
      style={styles.bg}
      resizeMode="cover"
    >
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
            <Image
              source={require("../assets/images/brand/brand-logotipo.png")}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityLabel="EvacuApp"
            />
            <Text style={styles.subtitle}>
              {isSignup ? "Crea tu cuenta" : "Inicia sesión para continuar"}
            </Text>
          </View>

          <View style={styles.card}>
            {isSignup && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Nombre</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Tu nombre"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="words"
                    autoComplete="given-name"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Apellido</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Tu apellido"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="words"
                    autoComplete="family-name"
                  />
                </View>
              </>
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

            {isSignup && (
              <View style={styles.field}>
                <Text style={styles.label}>Confirmar contraseña</Text>
                <TextInput
                  style={styles.input}
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="Repite tu contraseña"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
              </View>
            )}

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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: 20 },
  brandLogo: { width: 220, height: 220 },
  subtitle: {
    color: "#0f172a", fontSize: 15, marginTop: 2, fontWeight: "700",
    textShadowColor: "rgba(255,255,255,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.96)", padding: 20, borderRadius: 16, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
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
    color: "#0f172a", fontSize: 11, textAlign: "center",
    marginTop: 24, paddingHorizontal: 16, lineHeight: 16, fontWeight: "600",
    textShadowColor: "rgba(255,255,255,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
