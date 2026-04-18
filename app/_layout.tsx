import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { Drawer } from "expo-router/drawer";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import InstructivoModal from "../components/InstructivoModal";
import MainMenu from "../components/MainMenu";
import { RouteProvider } from "../context/RouteContext";
import destinos from "../data/destinos.json";
import rawGraph from "../data/graph.json";
import { linkDestinations, loadGraph } from "../src/services/graphService";
import { recomputePublicAlerts } from "../src/services/reportsService";

export default function RootLayout() {
  useEffect(() => {
    loadGraph(rawGraph as any);
    // Asigna a cada destino su nodo-del-grafo más cercano
    const linked = linkDestinations(destinos);
    // Guarda linked en un contexto o AsyncStorage para reutilizarlo
    // (ejemplo: almacenar en RouteContext)
    recomputePublicAlerts(); // limpia alertas caducadas
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RouteProvider>
          <Drawer
            drawerContent={(props: DrawerContentComponentProps) => (
              <MainMenu {...props} />
            )}
            screenOptions={{
              drawerType: "front",
              overlayColor: "rgba(0,0,0,0.5)",
              headerShown: false,
            }}
          >
            <Drawer.Screen name="index" options={{ title: "Mapa" }} />
          </Drawer>
          <InstructivoModal />
          <StatusBar style="light" />
        </RouteProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
