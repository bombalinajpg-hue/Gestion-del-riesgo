// app/_layout.tsx
import { Drawer } from 'expo-router/drawer';
import MainMenu from '../components/MainMenu';
import { RouteProvider } from '../context/RouteContext';

export default function RootLayout() {
  return (
    <RouteProvider>
      <Drawer
        drawerContent={(props) => <MainMenu {...props} />}
        screenOptions={{
          drawerType: 'slide',
          overlayColor: 'rgba(0,0,0,0.5)',
          headerShown: false,
        }}
      >
        {/* Aquí solo ponemos el name de la pantalla principal */}
        <Drawer.Screen name="index" />
      </Drawer>
    </RouteProvider>
  );
}
