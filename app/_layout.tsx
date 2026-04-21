/**
 * Layout principal de la app con Expo Router.
 *
 * Estructura de navegación:
 *   app/
 *   ├── _layout.tsx        ← este archivo (Stack raíz + Providers + guard)
 *   ├── index.tsx          ← HomeScreen (pantalla inicial — protegida)
 *   ├── login.tsx          ← Login / registro (pública)
 *   ├── map.tsx            ← Pantalla del mapa (con drawer interno)
 *   ├── emergency.tsx      ← Acciones durante emergencia
 *   ├── community.tsx      ← Participación ciudadana
 *   ├── training.tsx       ← Capacitación
 *   ├── prepare.tsx        ← Preparación preventiva
 *   └── statistics.tsx     ← Estadísticas y datos
 *
 * El guard de sesión redirige:
 *   · Usuario null + ruta != login → /login
 *   · Usuario con sesión + ruta == login → /
 */

import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../context/AuthContext";
import { RouteProvider } from "../context/RouteContext";
import { api } from "../src/services/api";
import { useMunicipio } from "../src/hooks/useMunicipio";

/** Guard de sesión — vive dentro de AuthProvider para leer user/loading
 * y decide qué pantalla renderizar. Mostramos un splash mientras se
 * resuelve la sesión persistida, para evitar flashes de /login cuando
 * el usuario ya está logueado y Firebase solo tarda unos ms en
 * recuperar la sesión desde AsyncStorage. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Preload del municipio activo al arrancar la app — el fetch es
  // público (sin auth) y deja listo `getActiveMunicipioId()` para que
  // `reportsService` y otros servicios lo usen en sync.
  useMunicipio();

  const inAuthScreen = segments[0] === "login";
  const needsRedirectToLogin = !loading && !user && !inAuthScreen;
  const needsRedirectToHome = !loading && !!user && inAuthScreen;

  useEffect(() => {
    if (needsRedirectToLogin) {
      router.replace("/login");
    } else if (needsRedirectToHome) {
      router.replace("/");
    }
  }, [needsRedirectToLogin, needsRedirectToHome, router]);

  // Sync con el backend: cuando el user queda logueado, disparamos un
  // `GET /v1/me` para que el backend haga el upsert del user en la DB.
  // Sin esto, Firebase reconoce al usuario pero el backend nunca se
  // entera hasta la primera request autenticada — y puede nunca
  // ocurrir si el usuario no envía reportes.
  useEffect(() => {
    if (!user) return;
    void api.get("/me").catch((e) => {
      console.warn("[AuthGate] sync GET /v1/me falló:", e);
    });
  }, [user]);

  // Mientras se resuelve la sesión O se redirige, pintamos splash.
  // Esto evita el flash del Home antes de llegar al login (y viceversa).
  if (loading || needsRedirectToLogin || needsRedirectToHome) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#ef476f" />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RouteProvider>
          <StatusBar style="auto" />
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: "slide_from_right",
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="login" options={{ animation: "fade" }} />
              <Stack.Screen name="map" />
              <Stack.Screen name="emergency" />
              <Stack.Screen name="community" />
              <Stack.Screen name="training" />
              <Stack.Screen name="prepare" />
              <Stack.Screen name="statistics" />
              <Stack.Screen name="about" />
            </Stack>
          </AuthGate>
        </RouteProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#073b4c",
    justifyContent: "center",
    alignItems: "center",
  },
});
