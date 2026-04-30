# Estado del proyecto EvacuApp — 2026-04-24 (madrugada)

Documento preparado como referencia para retomar el trabajo y redactar productos finales. Combina análisis, diagnóstico y roadmap pendiente.

---

## 1.1 Análisis — ¿Qué es la app hoy?

**EvacuApp** es una app móvil Android/iOS (con fallback web vía Expo) que calcula y guía rutas de evacuación seguras en Santa Rosa de Cabal (Risaralda) frente a tres amenazas naturales: **inundación, movimiento en masa y avenida torrencial** del río San Eugenio. Está pensada para ciudadanía común (sin entrenamiento técnico) y para uso en condiciones adversas (sin internet, GPS débil).

**Qué la diferencia de alternativas genéricas (Google Maps, Waze):**

1. **Conoce la amenaza.** No enruta por el camino más corto sino por el más **seguro**: penaliza aristas que cruzan zonas de amenaza Alta/Media y evita tramos con riesgo predial o vulnerabilidad estructural.
2. **Funciona offline.** Todo el grafo vial OSM de Santa Rosa, las capas de amenaza y el cálculo Dijkstra/A\* corren en el dispositivo — no depende de antenas que pueden caer durante emergencia real.
3. **Integra catastro.** Cuantifica en COP el riesgo de edificaciones y predios por tipo de fenómeno (valor catastral, área construida, ocupación).
4. **Tiene participación ciudadana.** Reportes de bloqueos/inundación local/puntos de encuentro saturados, grupos familiares con ubicación compartida, personas desaparecidas.

## 1.2 Diagnóstico profundo — ¿Qué funciona, qué no?

### ✅ Lo que **funciona confirmado** (probado en APK preview 2026-04-24)

- Login/signup con Firebase Auth + verificación de correo + flujo Home directo sin onboarding intermedio.
- Cálculo automático de ruta de evacuación al tocar "Empezar" desde el flujo Evacua.
- Visualización de capas de amenaza sobre mapa base satelital.
- Reporte ciudadano con gate de verificación de correo.
- Grupo familiar con código compartible + actualización de ubicación en backend + polling 20s.
- Modal de Cuantificación del riesgo muestra datos (tras fix de `flexShrink`).
- Bottom nav (Inicio / Visor / Cuenta) cambia entre pantallas con transición `fade`.
- Type-check TypeScript limpio (0 errores).
- Backend desplegado en Railway con Firebase Admin SDK, env vars rotadas, rate limiting activo.

### ⚠️ Bugs conocidos abiertos tras validar APK

1. **Escala del mapa al elegir punto de inicio manual.** Cuando el usuario toca "Elegir en el mapa", la cámara muestra todo Risaralda/Quindío en lugar de Santa Rosa. El `initialRegion` está bien definido (4.8751, -75.6271, deltas 0.012) pero se sobrescribe en algún momento al navegar desde Home.
2. **Datos sensibles en Cuantificación del riesgo.** Muestra desglose de `niños / adultos mayores / personas con discapacidad`. La usuaria pidió eliminarlos por sensibilidad. Queda solo: Edificaciones, Personas (ocupación máxima).
3. **Callout de pines en Visor sin opciones.** Al tocar un pin de punto de encuentro o institución, debería abrirse `RefugeDetailsModal` con botones "Ir aquí" (calcular ruta) y "Vista 360" (Street View). Hoy solo abre `QuickEvacuateSheet` directo — pierde la opción de Street View.
4. **Posibles bugs adicionales reportados al probar el APK** (pendientes de listar por la usuaria).

### 🟢 Limitaciones de diseño aceptadas

- **Clustering de reportes se hace local y en backend.** El backend clusteriza globalmente vía `POST /alerts/recompute`, pero la app hace clustering local también para feedback inmediato. Inevitable mientras el backend no implemente websockets.
- **Verificación de correo no bloquea login.** Solo bloquea envío de reportes ciudadanos. Decisión consciente de la usuaria: UX más amigable.
- **Ubicación compartida con grupo es snapshot + polling de 20 s**, no tiempo real via websocket. Aceptable para MVP.
- **Cobertura geográfica limitada a Santa Rosa de Cabal**. El bbox catastral y el grafo son específicos del municipio. Extender a otros municipios requeriría re-ingesta.

## 1.3 Estado actual de la aplicación

### Stack técnico

**Frontend:** Expo SDK ~54 / React Native 0.81 / React 19 / expo-router 6 / TypeScript (strict) / react-native-maps / Firebase Auth JS SDK 12 / AsyncStorage / Turf.js / @mapbox/polyline / Axios.

**Backend:** FastAPI 0.115 / Python 3.12 / SQLAlchemy async 2.0 + GeoAlchemy2 / PostgreSQL con PostGIS / Alembic (migraciones) / Firebase Admin SDK / slowapi (rate limiting) / asyncpg. Hosteado en **Railway**; base de datos en **Supabase** (Postgres con PostGIS).

**Herramientas:** EAS Build (APK Android), EAS Secrets (env vars en build), Railway Variables (env vars runtime), Firebase Console (Auth + service account), Google Cloud Console (Maps SDK Android).

### Datos offline bundleados en la app

- `graph.json` (3.3 MB): ~6.500 nodos y ~13.300 aristas viales de Santa Rosa (OSM).
- Amenazas (~1.5 MB): inundación, movimiento en masa, avenida torrencial — GeoJSON con categorías Alta/Media/Baja.
- Catastro (~12 MB): 12 capas del estudio ALDESARROLLO (predios, vulnerabilidad edificaciones/obras/personas, riesgo por fenómeno, elementos expuestos, pendiente, exposición catastral).

### Código por volumen (líneas aproximadas)

| Zona | Líneas | Observación |
|---|---|---|
| `components/MapViewContainer.tsx` | 1.457 | Más grande. Orquesta routing, picking, overlays y modales del mapa de Evacua. Candidato #1 a refactor. |
| `screens/HomeScreen.tsx` | ~820 | Crecido por bloque emergencias y FirstRunGuide |
| `components/MapVisorContainer.tsx` | ~470 | Visor geográfico con catastro, familiar, pins |
| `components/QuickEvacuateSheet.tsx` | ~700 | Encuesta 3 preguntas pre-mapa |
| Algoritmos ruteo (`src/algorithms/*.ts`) | ~1.200 | Dijkstra, A\*, MultiSource, TDD, catastroCostFactors |
| Backend `app/routers/*.py` | ~800 | 6 routers: health, me, municipios, reports, alerts, family_groups |

### Seguridad (post-sesión 2026-04-23)

- ✅ Firebase service account **rotada** (llave anterior en git history es inválida).
- ✅ Nueva llave solo como env var en Railway — nunca en repo.
- ✅ `/alerts/recompute` requiere header `X-Admin-Secret` (hmac compare).
- ✅ Rate limits en endpoints spam-eables: `/family-groups` (10/min), `/family-groups/join` (20/min), `/members/me` (60/min), `/reports` (10/min).
- ✅ Geo-fence en PATCH ubicación familia (ST_Contains vs bbox del municipio).
- ✅ `.gitignore` blindado contra credenciales.
- ✅ Google Maps API key en `app.json` (repo público, pero **debe tener restricciones** por package + SHA-1 en GCP Console — pendiente de confirmar que están aplicadas).
- ✅ Guard `__DEV__` previene mock de ubicación accidental en APK prod.

---

## 2. ¿Se lograron los objetivos del proyecto?

### Objetivo general

Desarrollar una aplicación móvil inteligente (EvacuApp) que calcule y guíe rutas de evacuación seguras en Santa Rosa de Cabal considerando amenazas naturales y análisis catastral, con participación ciudadana y funcionalidad offline.

**→ LOGRADO.** La app tiene cálculo de rutas ponderado por amenaza, integra catastro, permite reportes ciudadanos, y funciona offline. Hay una APK compilable que corre.

### Objetivos específicos y su estado

| Objetivo | Estado | Evidencia |
|---|---|---|
| Algoritmo de ruteo ponderado por amenaza | ✅ Logrado | [src/algorithms/aStar.ts](src/algorithms/aStar.ts), [timeDependentDijkstra.ts](src/algorithms/timeDependentDijkstra.ts); penalizaciones Baja 1×/Media 4×/Alta 8× |
| Integrar vulnerabilidad y exposición catastral | ✅ Logrado | [src/algorithms/catastroCostFactors.ts](src/algorithms/catastroCostFactors.ts) + 12 capas en `data/catastro/` |
| Participación ciudadana (reportes, desaparecidos, alertas) | ✅ Logrado | [components/ReportModal.tsx](components/ReportModal.tsx), [MissingPersonsModal.tsx](components/MissingPersonsModal.tsx); clustering en [reportsService.ts](src/services/reportsService.ts) |
| Grupos familiares sincronizados | ✅ Logrado con limitación | [components/FamilyGroupModal.tsx](components/FamilyGroupModal.tsx) con polling 20s (no tiempo real websocket) |
| Módulos capacitación + preparación + estadísticas | ✅ Logrado | [screens/TrainingScreen.tsx](screens/TrainingScreen.tsx), [PrepareScreen.tsx](screens/PrepareScreen.tsx), [StatisticsScreen.tsx](screens/StatisticsScreen.tsx) |
| Validación SUS con 5 usuarios piloto | ⏳ Pendiente | `docs/sus_form_content.md` existe (formulario) pero no hay resultados recopilados |
| APK distribuible vía QR | 🟡 En curso | APK preview compila; falta APK production final |

### Limitaciones encontradas

1. **Validación SUS real no se completó** durante el desarrollo. Los resultados del estudio de usabilidad dependen de tiempo con usuarios reales en Santa Rosa — es la única "prueba" del objetivo cumplida solo parcialmente. Queda como recomendación futura.
2. **Escalado geográfico.** La app está amarrada al bbox de Santa Rosa. Llevarla a otro municipio exige re-ingesta del grafo, re-cálculo de amenazas, re-carga de catastro. No es un limitante del diseño — es scope decidido.
3. **Tiempo real de ubicación de familia.** Se implementó con polling 20s (snapshot rítmico) en lugar de websocket. Suficiente para MVP académico, no apto para operaciones profesionales de rescate.
4. **Datos de catastro con PII indirecta.** La primera versión mostraba números desagregados de niños/adultos mayores/personas con discapacidad en riesgo. Se quitan por sensibilidad ética. Implica que el análisis de exposición queda en el plano agregado (no individual).
5. **Dependencia de APIs externas.** Google Maps Android, OpenRouteService (fallback), Firebase Auth — si alguna cambia condiciones o quiebra, afecta funcionalidad. Firebase y Google Maps son los más críticos.
6. **Backend sin alta disponibilidad.** Railway single instance. Si cae, los reportes/grupo familiar dejan de funcionar (el cálculo de ruta local sigue siempre).
7. **No hay roles de administrador.** La protección de `/recompute` es con un shared secret, no con usuarios staff. Escala mal si se quieren varios admins.
8. **Bug de escala del mapa en picking manual** (mencionado arriba) — persiste en el APK actual.

---

## 3. Errores de forma y de fondo más importantes pendientes

Priorizados. Los 🔴 deben resolverse antes de entregar APK final; los 🟡 son calidad pero no bloqueantes; los 🟢 son v2.

### 🔴 Fondo (funcionalidad crítica)

1. **Escala del mapa al elegir punto de inicio manual** — muestra todo el departamento. Fix sugerido: forzar `animateToRegion(initialRegion)` cuando `seleccionandoPunto === true && !routeCoords.length`.
2. **Datos sensibles en Cuantificación del riesgo** — quitar desglose de niños/mayores/discapacidad en [ExposicionCatastralModal.tsx](components/ExposicionCatastralModal.tsx).
3. **Callout de pines en Visor incompleto** — conectar `RefugeDetailsModal` al `onPress` de los markers en [MapVisorContainer.tsx](components/MapVisorContainer.tsx) para dar acceso a "Ir aquí" + "Vista 360".
4. **Bugs nuevos del APK** — pendientes de que la usuaria los liste tras descansar.

### 🟡 Forma (calidad visible)

5. **`console.log/warn/error` activos en APK production** — 33 llamadas. Agregar `babel-plugin-transform-remove-console` o guard `__DEV__`.
6. **Código muerto: `app/onboarding.tsx` + `screens/OnboardingScreen.tsx`** — ya no se usan tras quitar el redirect; borrarlos del bundle.
7. **`MapViewContainer.tsx` con 1.457 líneas** — refactor a submódulos (ruteo, picking, overlays, modales). Post-APK.
8. **Duplicación `handleQuickEvacuate` Home vs Visor** — extraer a un hook `useLaunchEvacuation()`. Post-APK.
9. **Duplicación backend `_point_wkt()` / `coords_to_latlng()`** en routers. Post-APK.
10. **Logo 220×220 en login** — puede verse grande en teléfonos pequeños. Validar en dispositivo real.
11. **Resolución de `splash.png` y `login-background.png` (853×1844)** menor al recomendado. Se verá pixelado en AMOLED 1440p. Regenerar.
12. **Ícono genérico `medical-services` para Cruz Roja** — cosmético.

### 🟡 Seguridad (post-APK pero importante)

13. **CORS del backend en `"*"`** — si montan dashboard web después, endurecer con lista de dominios.
14. **Google Maps API key en repo público** — confirmar que en Google Cloud Console tenga restricciones por package `com.ctglobal.rutasevacuacion` + SHA-1 de keystore. **Si no, la key se puede abusar desde otras apps y generar facturas.** Crítico verificar.
15. **No hay backup automático de la DB Supabase** — si el user final se va, los reportes se pierden. Configurar snapshots periódicos (Supabase los ofrece en plan pago).
16. **`sendEmailVerification` silencioso** — try/catch vacío en [firebaseAuth.ts](src/services/firebaseAuth.ts). Acepta que funciona porque la usuaria confirmó que sí le llegó, pero en producción masiva habría casos donde no.

### 🟢 Bajos / cosméticos

- `Alert.alert` donde podrían ser toasts.
- Comentarios JSDoc que siguen diciendo "refugio" (los strings UI ya dicen "punto de encuentro").
- 55 `useEffect` sin auditoría individual de cleanups.
- Fallback a OpenRouteService hardcoded en `localRouter.ts`.
- Grafo sin versionado/checksum.

---

## 4. Plan al retomar la sesión

1. **Listar bugs del APK** que la usuaria viene a reportar.
2. **Resolver los 🔴 pendientes (#1, #2, #3)** — son rápidos (15–30 min cada uno).
3. **Borrar código muerto** del onboarding.
4. **Aplicar `babel-plugin-transform-remove-console`** para producción.
5. **Verificar restricciones de Google Maps API Key** en Google Cloud Console.
6. **Commit + push** (todo lo de esta sesión sigue sin committear por instrucción de la usuaria).
7. **Compilar APK preview** nuevamente para validar fixes.
8. **Correr el checklist** completo de [docs/checklist_validacion_expo_go.md](docs/checklist_validacion_expo_go.md).
9. **APK production final** (4 h aprox en cola EAS free).
10. **Recopilar resultados SUS** con usuarios piloto (depende de agenda de la usuaria).
11. **Redactar productos finales** usando [docs/outline-productos-finales.md](docs/outline-productos-finales.md).
