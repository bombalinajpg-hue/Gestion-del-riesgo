/**
 * Layout principal de la app con Expo Router.
 *
 * Estructura de navegación:
 *   app/
 *   ├── _layout.tsx        ← este archivo (Stack raíz + RouteProvider)
 *   ├── index.tsx          ← HomeScreen (pantalla inicial)
 *   ├── map.tsx            ← Pantalla del mapa (con drawer interno)
 *   ├── emergency.tsx      ← Acciones durante emergencia
 *   ├── community.tsx      ← Participación ciudadana
 *   ├── training.tsx       ← Capacitación
 *   ├── prepare.tsx        ← Preparación preventiva
 *   └── statistics.tsx     ← Estadísticas y datos
 *
 * Nota: este layout reemplaza el que tenías para la navegación
 * directa al mapa. El drawer del mapa se mantiene DENTRO de la
 * pantalla /map, no a nivel raíz.
 */

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RouteProvider } from "../context/RouteContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RouteProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="map" />
          <Stack.Screen name="emergency" />
          <Stack.Screen name="community" />
          <Stack.Screen name="training" />
          <Stack.Screen name="prepare" />
          <Stack.Screen name="statistics" />
          <Stack.Screen name="about" />
        </Stack>
      </RouteProvider>
    </SafeAreaProvider>
  );
}