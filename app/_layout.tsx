// app/_layout.tsx
import { Drawer } from 'expo-router/drawer';
import InstructivoModal from '../components/InstructivoModal';
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
        <Drawer.Screen name="index" />
      </Drawer>
      <InstructivoModal />
    </RouteProvider>
  );
}