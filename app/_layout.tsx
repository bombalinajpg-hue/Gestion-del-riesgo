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
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../context/AuthContext";
import { RouteProvider, useRouteContext } from "../context/RouteContext";
import { hasSeenOnboarding } from "../screens/OnboardingScreen";
import { api } from "../src/services/api";
import { clearMeCache } from "../src/services/apiMe";
import { useMunicipio } from "../src/hooks/useMunicipio";

/** Guard de sesión — vive dentro de AuthProvider para leer user/loading
 * y decide qué pantalla renderizar. Mostramos un splash mientras se
 * resuelve la sesión persistida, para evitar flashes de /login cuando
 * el usuario ya está logueado y Firebase solo tarda unos ms en
 * recuperar la sesión desde AsyncStorage. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { resetAll: resetRouteContext } = useRouteContext();
  const segments = useSegments();
  const router = useRouter();
  // Preload del municipio activo al arrancar la app — el fetch es
  // público (sin auth) y deja listo `getActiveMunicipioId()` para que
  // `reportsService` y otros servicios lo usen en sync.
  useMunicipio();

  // Detectamos transición logout (user→null) para limpiar el estado
  // compartido: RouteContext (destino, emergencia, punto, etc.) y la
  // cache de `/v1/me` (UUID interno del user). Sin esto, si el
  // director entra con otra cuenta en el mismo dispositivo, vería
  // rastros de la sesión anterior — malísimo para demo.
  const prevUidRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUid = user?.uid ?? null;
    const prevUid = prevUidRef.current;
    if (prevUid && prevUid !== currentUid) {
      // Cambio de usuario (logout o switch). Resetea todo.
      resetRouteContext();
      clearMeCache();
    }
    prevUidRef.current = currentUid;
  }, [user?.uid, resetRouteContext]);

  // Onboarding: tri-state para distinguir "aún cargando" vs "ya visto"
  // vs "primer lanzamiento". Mientras es null pintamos splash para no
  // flashear el Home antes de redirigir a /onboarding. El estado se
  // resetea cuando cambia el usuario (logout → login de otra cuenta),
  // así un usuario nuevo en el mismo dispositivo sí ve el onboarding.
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user?.uid) {
      setOnboardingSeen(null);
      return;
    }
    let cancelled = false;
    hasSeenOnboarding(user.uid).then((seen) => {
      if (!cancelled) setOnboardingSeen(seen);
    });
    return () => { cancelled = true; };
  }, [user?.uid]);

  const inAuthScreen = segments[0] === "login";
  const inOnboardingScreen = segments[0] === "onboarding";
  // El onboarding se muestra DESPUÉS del login — una vez la sesión está
  // resuelta y antes de cualquier pantalla autenticada. Así el copy
  // puede personalizarse (y no se muestra a usuarios que ya se habían
  // logueado antes con AsyncStorage conservado).
  const needsRedirectToLogin = !loading && !user && !inAuthScreen && !inOnboardingScreen;
  const needsRedirectToHome = !loading && !!user && inAuthScreen;
  const needsRedirectToOnboarding =
    !loading && !!user && onboardingSeen === false && !inOnboardingScreen && !inAuthScreen;
  const needsRedirectAwayFromOnboarding =
    !loading && !!user && onboardingSeen === true && inOnboardingScreen;

  useEffect(() => {
    if (needsRedirectToLogin) {
      router.replace("/login");
    } else if (needsRedirectToOnboarding) {
      router.replace("/onboarding");
    } else if (needsRedirectAwayFromOnboarding) {
      router.replace("/");
    } else if (needsRedirectToHome) {
      router.replace("/");
    }
  }, [
    needsRedirectToLogin,
    needsRedirectToHome,
    needsRedirectToOnboarding,
    needsRedirectAwayFromOnboarding,
    router,
  ]);

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
  // `onboardingSeen === null` significa "aún no leímos AsyncStorage".
  if (
    loading ||
    onboardingSeen === null ||
    needsRedirectToLogin ||
    needsRedirectToHome ||
    needsRedirectToOnboarding ||
    needsRedirectAwayFromOnboarding
  ) {
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
              <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
              <Stack.Screen name="map" />
              <Stack.Screen name="emergency" />
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
