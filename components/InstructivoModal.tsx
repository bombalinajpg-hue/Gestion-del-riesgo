import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  Dimensions, Image, Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View
} from 'react-native';
import { useRouteContext } from '../context/RouteContext';

const INSTRUCTIVO_KEY = 'instructivo_visto_v4';
const { width: SW } = Dimensions.get('window');
const IMG_W = SW - 80;

// Las imágenes se definen como funciones require() para que React Native
// las cargue bajo demanda — solo la imagen del paso actual está en memoria.
// Cargar las 14 imágenes simultáneamente causaba crash en Android por memoria.
const getImagen = (key: string) => {
  switch (key) {
    case 'brujula':            return require('../assets/tutorial/brujula.png');
    case 'capas':              return require('../assets/tutorial/capas.png');
    case 'evacuar':            return require('../assets/tutorial/evacuar.png');
    case 'iniciar_evacuacion': return require('../assets/tutorial/iniciar_evacuacion.png');
    case 'inicio_de_la_ruta':  return require('../assets/tutorial/inicio_de_la_ruta.png');
    case 'instituciones':      return require('../assets/tutorial/instituciones.png');
    case 'mapa':               return require('../assets/tutorial/mapa.png');
    case 'menu':               return require('../assets/tutorial/menu.png');
    case 'modo_desplazamiento':return require('../assets/tutorial/modo_de_desplazamiento.png');
    case 'punto_encuentro':    return require('../assets/tutorial/punto_encuentro.png');
    case 'riesgo':             return require('../assets/tutorial/riesgo.png');
    case 'telefono':           return require('../assets/tutorial/telefono.png');
    case 'tipo_emergencia':    return require('../assets/tutorial/tipo_de_emergencia.png');
    case 'ubicacion':          return require('../assets/tutorial/ubicacion.png');
    default:                   return require('../assets/tutorial/mapa.png');
  }
};

// ─── Pasos del tour — imagen referenciada por clave, no por objeto ────────────
const PASOS = [
  {
    seccion: '👋 Bienvenida',
    titulo: '¡Bienvenido/a a Rutas de Evacuación!',
    descripcion: 'Esta app te ayuda a encontrar la ruta más segura para evacuar durante emergencias en Santa Rosa de Cabal.\n\nA continuación te mostramos todas las funciones disponibles.',
    imagenKey: 'riesgo',
  },
  {
    seccion: '🛠️ Funciones del mapa',
    titulo: '☰ Menú de configuración',
    descripcion: 'Toca el botón ☰ en la esquina superior izquierda para abrir el menú lateral donde configurarás tu evacuación.',
    imagenKey: 'menu',
  },
  {
    seccion: '🛠️ Funciones del mapa',
    titulo: '⬡ Cambiar tipo de mapa',
    descripcion: 'Toca el botón de capas en la esquina superior derecha para cambiar entre mapa Estándar, Satélite e Híbrido.',
    imagenKey: 'capas',
  },
  {
    seccion: '🛠️ Funciones del mapa',
    titulo: '🧭 Brújula',
    descripcion: 'Cuando el mapa no esté orientado al norte, aparece la brújula indicando la dirección norte en todo momento.',
    imagenKey: 'brujula',
  },
  {
    seccion: '🛠️ Funciones del mapa',
    titulo: '⊙ Centrar en mi ubicación',
    descripcion: 'Toca este botón para centrar el mapa en tu posición GPS actual.',
    imagenKey: 'ubicacion',
  },
  {
    seccion: '🛠️ Funciones del mapa',
    titulo: '📞 Llamar al 123',
    descripcion: 'En cualquier momento puedes tocar este botón para llamar directamente a la línea nacional de emergencias.',
    imagenKey: 'telefono',
  },
  {
    seccion: '🛠️ Funciones del mapa',
    titulo: '🏃 Calcular ruta de evacuación',
    descripcion: 'Toca el botón rojo con el ícono de persona corriendo para acceder directamente al menú de configuración de tu evacuación.',
    imagenKey: 'evacuar',
  },
  {
    seccion: '🎨 Zonas de amenaza',
    titulo: '🗺️ Mapas de zonas de riesgo',
    descripcion: 'Al seleccionar un tipo de emergencia, el mapa muestra las zonas de amenaza con diferentes colores según el nivel de riesgo.',
    imagenKey: 'mapa',
  },
  {
    seccion: '🗺️ Cómo calcular tu ruta',
    titulo: '🚨 Paso 1 — Tipo de emergencia',
    descripcion: 'Abre el menú tocando 🏃 y selecciona el tipo de emergencia activa. El mapa mostrará automáticamente las zonas de riesgo correspondientes.',
    imagenKey: 'tipo_emergencia',
  },
  {
    seccion: '🗺️ Cómo calcular tu ruta',
    titulo: '🚶 Paso 2 — Modo de desplazamiento',
    descripcion: 'Elige cómo te vas a desplazar hacia el punto seguro:\n\n🚶 A pie  ·  🚴 Bicicleta  ·  🚗 Carro\n\nEsto afecta el cálculo de la ruta óptima.',
    imagenKey: 'modo_desplazamiento',
  },
  {
    seccion: '🗺️ Cómo calcular tu ruta',
    titulo: '📍 Paso 3 — Punto de inicio',
    descripcion: 'Elige desde dónde inicias la evacuación:\n\n📍 Mi ubicación — usa tu GPS actual\n🗺️ Elegir en mapa — toca un punto manualmente en el mapa y confírmalo',
    imagenKey: 'inicio_de_la_ruta',
  },
  {
    seccion: '🗺️ Cómo calcular tu ruta',
    titulo: '🏁 Paso 4 — Punto de encuentro',
    descripcion: 'Elige a dónde evacuar:\n\n📍 Punto más cercano — automático\n🌳 Parques y zonas verdes\n🏟️ Coliseos y canchas\n\nO selecciona una institución en la siguiente sección.',
    imagenKey: 'punto_encuentro',
  },
  {
    seccion: '🗺️ Cómo calcular tu ruta',
    titulo: '🏥 Paso 4 (alt.) — Instituciones',
    descripcion: 'También puedes dirigirte a una institución:\n\n🏥 Hospitales y clínicas\n👮 CAI y policía\n🚒 Bomberos\n⛪ Parroquias\n🏫 Escuelas\n\nSeleccionar una institución excluye el punto de encuentro y viceversa.',
    imagenKey: 'instituciones',
  },
  {
    seccion: '🗺️ Cómo calcular tu ruta',
    titulo: '🚀 Paso 5 — Iniciar evacuación',
    descripcion: 'Una vez configurado todo, cierra el menú y toca el botón rojo "INICIAR EVACUACIÓN".\n\nVerás:\n🔴 Tramo rojo — dentro de la zona de peligro\n🔵 Tramo azul — ruta segura al destino\n⏱️ Distancia y tiempo estimado',
    imagenKey: 'iniciar_evacuacion',
  },
  {
    seccion: '✅ ¡Listo!',
    titulo: '✅ ¡Ya sabes usar la app!',
    descripcion: 'En una emergencia real, mantén la calma y sigue la ruta indicada hacia el punto seguro.\n\nPuedes volver a ver esta guía tocando "Ver guía" en el menú lateral.',
    imagenKey: 'mapa',
  },
];

// ─── Componente principal ─────────────────────────────────────────────────────
export default function InstructivoModal() {
  const [visible, setVisible] = useState(false);
  const [paso, setPaso] = useState(0);
  const [noMostrarMas, setNoMostrarMas] = useState(false);
  const { instructivoTrigger } = useRouteContext();

  useEffect(() => {
    AsyncStorage.getItem(INSTRUCTIVO_KEY)
      .then((value) => { if (value !== 'never') setVisible(true); })
      .catch(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (instructivoTrigger === 0) return;
    setPaso(0);
    setNoMostrarMas(false);
    setVisible(true);
  }, [instructivoTrigger]);

  const handleCerrar = async () => {
    if (noMostrarMas) {
      await AsyncStorage.setItem(INSTRUCTIVO_KEY, 'never');
    } else {
      await AsyncStorage.removeItem(INSTRUCTIVO_KEY);
    }
    setVisible(false);
    setPaso(0);
    setNoMostrarMas(false);
  };

  const handleSiguiente = () => {
    if (paso < PASOS.length - 1) setPaso(paso + 1);
    else handleCerrar();
  };

  const p = PASOS[paso];
  const esUltimo = paso === PASOS.length - 1;
  const esPrimero = paso === 0;
  const progreso = ((paso + 1) / PASOS.length) * 100;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerLabel}>{p.seccion}</Text>
            <TouchableOpacity onPress={handleCerrar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Barra de progreso */}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progreso}%` }]} />
          </View>
          <Text style={styles.progressText}>{paso + 1} de {PASOS.length}</Text>

          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Imagen — solo la del paso actual se carga en memoria */}
            <View style={styles.imgContainer}>
              <Image
                source={getImagen(p.imagenKey)}
                style={styles.img}
                resizeMode="contain"
              />
            </View>

            {/* Título y descripción */}
            <Text style={styles.titulo}>{p.titulo}</Text>
            <Text style={styles.descripcion}>{p.descripcion}</Text>

          </ScrollView>

          {/* Navegación */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, esPrimero && styles.navBtnDisabled]}
              onPress={() => setPaso(paso - 1)}
              disabled={esPrimero}
            >
              <MaterialIcons name="arrow-back" size={18} color={esPrimero ? '#ccc' : '#073b4c'} />
              <Text
                style={[styles.navBtnText, esPrimero && styles.navBtnTextDisabled]}
                numberOfLines={1}
              >
                Anterior
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navBtnPrimary, esUltimo && styles.navBtnFin]}
              onPress={handleSiguiente}
            >
              <Text style={styles.navBtnPrimaryText} numberOfLines={1}>
                {esUltimo ? '¡Comenzar!' : 'Siguiente'}
              </Text>
              <MaterialIcons name={esUltimo ? 'check' : 'arrow-forward'} size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Footer: no mostrar más + saltar */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setNoMostrarMas(!noMostrarMas)}
            >
              <View style={[styles.checkbox, noMostrarMas && styles.checkboxActive]}>
                {noMostrarMas && <MaterialIcons name="check" size={14} color="#ffffff" />}
              </View>
              <Text style={styles.checkLabel} numberOfLines={1}>
                No volver a mostrar
              </Text>
            </TouchableOpacity>

            {!esUltimo && (
              <TouchableOpacity onPress={handleCerrar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.skipText}>Saltar</Text>
              </TouchableOpacity>
            )}
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxHeight: '92%',
    overflow: 'hidden',
    elevation: 12,
  },
  header: {
    backgroundColor: '#073b4c',
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLabel: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  progressBar: { height: 4, backgroundColor: '#f0f0f0' },
  progressFill: { height: 4, backgroundColor: '#06d6a0' },
  progressText: { fontSize: 11, color: '#999', textAlign: 'right', paddingRight: 16, paddingTop: 4 },
  imgContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  img: {
    width: IMG_W,
    height: IMG_W * 0.6,
    borderRadius: 12,
  },
  titulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#073b4c',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 6,
  },
  descripcion: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0',
  },
  navBtnDisabled: { borderColor: '#f0f0f0' },
  navBtnText: { fontSize: 13, color: '#073b4c', fontWeight: '500' },
  navBtnTextDisabled: { color: '#ccc' },
  navBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 20, backgroundColor: '#118ab2',
  },
  navBtnFin: { backgroundColor: '#06d6a0' },
  navBtnPrimaryText: { fontSize: 13, color: '#ffffff', fontWeight: '700' },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 4,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, marginRight: 12 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 2, borderColor: '#118ab2',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxActive: { backgroundColor: '#118ab2', borderColor: '#118ab2' },
  checkLabel: { fontSize: 12, color: '#555' },
  skipText: { fontSize: 12, color: '#aaa', textDecorationLine: 'underline' },
});
