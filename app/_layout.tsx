import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import InstructivoModal from '../components/InstructivoModal';
import MainMenu from '../components/MainMenu';
import { RouteProvider } from '../context/RouteContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RouteProvider>
          <Drawer
            drawerContent={(props: DrawerContentComponentProps) => <MainMenu {...props} />}
            screenOptions={{
              drawerType: 'front',
              overlayColor: 'rgba(0,0,0,0.5)',
              headerShown: false,
            }}
          >
            <Drawer.Screen name="index" options={{ title: 'Mapa' }} />
          </Drawer>
          <InstructivoModal />
          <StatusBar style="light" />
        </RouteProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
