/**
 * Barra de navegación inferior con 3 tabs: Inicio · Visor · Cuenta.
 *
 * Implementación minimalista con `TouchableOpacity` + `router.replace` para
 * que cada pestaña sea independiente (no mantiene stack por tab; cada
 * tab es una pantalla top-level). Para cuando el proyecto crezca, se
 * puede migrar a `<Tabs>` de expo-router; por ahora esta implementación
 * es suficiente y evita mover el árbol de rutas.
 *
 * Se renderiza dentro de cada pantalla que la requiera (Inicio, Visor,
 * Cuenta). No se inyecta vía layout para no tocar la estructura de
 * navegación existente.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "inicio" | "visor" | "cuenta";

interface Props {
  active: Tab;
}

const TABS: {
  key: Tab;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  route: Href;
}[] = [
  { key: "inicio", label: "Inicio", icon: "home", route: "/" },
  { key: "visor", label: "Visor", icon: "layers", route: "/visor" },
  { key: "cuenta", label: "Cuenta", icon: "person", route: "/cuenta" },
];

export default function BottomNavBar({ active }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => {
              if (!isActive) router.replace(tab.route);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <MaterialIcons
              name={tab.icon}
              size={24}
              color={isActive ? "#0f766e" : "#94a3b8"}
            />
            <Text
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
    fontWeight: "500",
  },
  labelActive: {
    color: "#0f766e",
    fontWeight: "700",
  },
});
