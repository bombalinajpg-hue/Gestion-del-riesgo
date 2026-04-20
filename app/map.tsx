/**
 * Pantalla del mapa — ahora con Drawer interno.
 *
 * El Drawer se inicializa AQUÍ (dentro de esta pantalla) en vez de
 * a nivel raíz. Eso permite que el Home sea una pantalla separada
 * y que el drawer solo aparezca dentro del mapa.
 */

import { createDrawerNavigator } from "@react-navigation/drawer";
import MainMenu from "../components/MainMenu";
import MapViewContainer from "../components/MapViewContainer";

const Drawer = createDrawerNavigator();

export default function MapPage() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <MainMenu {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: { width: "80%" },
      }}
    >
      <Drawer.Screen name="MapMain" component={MapViewContainer} />
    </Drawer.Navigator>
  );
}