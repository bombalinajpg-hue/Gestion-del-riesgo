# v4.3 — Pantalla de inicio + 6 módulos con Expo Router

Reestructura la navegación: en vez de entrar directo al mapa, la app ahora
abre una **pantalla de inicio (Home)** con tarjetas para cada módulo.

## Estructura nueva

```
app/
├── _layout.tsx           ← Stack raíz + RouteProvider
├── index.tsx             ← HomeScreen (pantalla inicial)
├── map.tsx               ← Mapa con Drawer interno
├── emergency.tsx         ← Durante la emergencia
├── community.tsx         ← Participación ciudadana
├── training.tsx          ← Capacitación (5 lecciones)
├── prepare.tsx           ← Preparación (kit + plan)
└── statistics.tsx        ← Datos abiertos
screens/
├── HomeScreen.tsx
├── EmergencyScreen.tsx
├── CommunityScreen.tsx
├── TrainingScreen.tsx
├── PrepareScreen.tsx
└── StatisticsScreen.tsx
```

## Archivos para AGREGAR al proyecto

Copia TODO el contenido de `app/` y `screens/` a tu proyecto.

Los archivos de `app/` REEMPLAZAN los que tengas. En particular:
- `app/_layout.tsx` — NUEVO (tu layout actual probablemente no tiene el Stack completo)
- `app/index.tsx` — REEMPLAZA (si ya existe, hacía entrar directo al mapa)
- `app/map.tsx` — NUEVO (el mapa ahora es una pantalla separada)

## Archivos de tu proyecto que NO cambian

- Todos los `components/` del proyecto (MapViewContainer, MainMenu, modales, etc.)
- `context/RouteContext.tsx` (el de v4.2 sigue funcionando)
- Todos los `src/services/` y `src/utils/`
- `data/`

## Qué hacer después de copiar

1. Verifica que tienes instalado `expo-router` y `@react-navigation/drawer`:

```bash
npx expo install expo-router @react-navigation/drawer
```

2. Reinicia con cache limpio:

```bash
npx expo start --clear
```

## Flujo de navegación

- **Home** ← pantalla inicial de la app
- Toca "Calcular ruta" o card de Rutas → `/map` (drawer con selección)
- Toca card de Emergencia → `/emergency` (acciones rápidas)
- Toca card de Participación → `/community` (reportes + familia + desaparecidos)
- Toca card de Capacitación → `/training` (5 lecciones UNGRD)
- Toca card de Prepárate → `/prepare` (kit 72h + plan familiar)
- Toca card de Estadísticas → `/statistics` (datos del municipio)
- Botón 123 flotante siempre visible en Home

## Características del diseño

- **Hero oscuro** con nombre de la app y badge "SANTA ROSA DE CABAL"
- **CTA principal turquesa** para la acción más común (calcular ruta)
- **Grid 2x3** con cada módulo en su color distintivo
- **Status card** que muestra progreso del kit + grupo familiar
- **Alert bar** roja que aparece solo si hay alertas activas cerca
- **Badge con número** en cards que tienen conteos activos (ej. desaparecidos)
- **Botón 123** flotante rojo que NUNCA desaparece

## Notas académicas

Este cambio de arquitectura tiene valor para la pasantía:
- Demuestra uso de Expo Router (estándar moderno)
- Separa claramente responsabilidades por pantalla
- Mejora UX: el usuario nuevo ya no se pierde en la pantalla del mapa
- Escalable: agregar un nuevo módulo es solo crear una pantalla + tarjeta