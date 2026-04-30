# Estado del proyecto EvacuApp — 2026-04-30

Snapshot post-endurecimiento SIG (P0 completado y pusheado en
`feature/app2.0`). Documento de referencia para retomar trabajo y
para los productos finales de pasantía.

> Para el snapshot anterior (estado del 2026-04-24, pre-P0) ver
> [docs/anexos/estado-2026-04-24.md](anexos/estado-2026-04-24.md).
> La diferencia entre ambos documenta la evolución de la metodología
> SIG y es citable en el documento académico final.

---

## 1.1 Análisis — ¿Qué es la app hoy?

**EvacuApp** es una app móvil Android (con backend FastAPI desplegado
en Railway) que calcula y guía rutas de evacuación seguras en Santa
Rosa de Cabal (Risaralda) frente a tres amenazas naturales del río San
Eugenio: **inundación, movimiento en masa y avenida torrencial**.
Diseñada para ciudadanía sin entrenamiento técnico y para condiciones
adversas (sin internet, GPS débil).

**Qué la diferencia de alternativas genéricas (Google Maps, Waze):**

1. **Conoce la amenaza.** No enruta por el camino más corto sino por el
   más **seguro**: penaliza aristas que cruzan polígonos de amenaza
   Alta/Media (con detección por intersección line-polygon real, no
   por punto medio) y evita tramos con vulnerabilidad de obra lineal o
   predios en riesgo adyacente (con buffer geométrico real de 25 m).
2. **Funciona offline.** El grafo vial OSM completo de Santa Rosa, las
   capas de amenaza, los factores catastrales y el cálculo Dijkstra/A\*
   /Time-Dependent corren en el dispositivo — no depende de antenas que
   pueden caer durante una emergencia real.
3. **Datum oficial colombiano.** Backend almacena geometrías en
   EPSG:4686 (MAGNA-SIRGAS) por Resolución IGAC 471/2020. Mediciones
   métricas en EPSG:9377 (CTM12). Las aproximaciones planas en grados
   se eliminaron en P0.
4. **Integra catastro.** Cuantifica en COP el riesgo de edificaciones
   y predios por tipo de fenómeno (valor catastral, área construida,
   ocupación). Clasifica vías por vulnerabilidad de obra lineal.
5. **Tiene participación ciudadana.** Reportes de
   bloqueos/inundación local/puntos saturados, grupos familiares con
   ubicación compartida, personas desaparecidas.

## 1.2 Diagnóstico — ¿Qué funciona, qué no?

### ✅ Funcionando confirmado (validado 2026-04-30 en Expo Go)

- Login/signup con Firebase Auth + verificación de correo + flujo Home
  directo sin onboarding intermedio.
- Cálculo automático de ruta de evacuación al tocar "Empezar" en el
  flujo Evacua. Mediana 1.1 ms / p99 13 ms sobre 13 363 aristas.
- Visualización de capas de amenaza sobre mapa base satelital.
- Reporte ciudadano con gate de verificación de correo.
- Grupo familiar con código compartible + actualización de ubicación
  en backend + polling 20 s.
- Modal de Cuantificación del riesgo (tras quitar PII de
  niños/mayores/discapacidad).
- Bottom nav (Inicio / Visor / Cuenta) con transición `fade`.
- Type-check TypeScript limpio (0 errores).
- Backend desplegado en Railway con Firebase Admin SDK + rate limiting
  + admin secret + geo-fence en PATCH ubicación familia.

### ✅ Endurecimiento SIG completado en P0 (2026-04-30)

- **Backend en SRID 4686** (MAGNA-SIRGAS): models, alembic initial,
  routers, seed_municipio.py.
- **Clustering en CTM12** (`ST_Transform(..., 9377)` con eps en metros
  exactos). Eliminada la aproximación `radius_m / 111_000`.
- **Pipeline del grafo dividido** en dos etapas:
  - `scripts/build-graph.js` (Node) — solo descarga OSM y arma
    topología.
  - `backend/scripts/enrich_graph.py` (Python, shapely + STRtree +
    pyproj) — todos los joins espaciales en EPSG:9377 con
    intersección line-polygon real, buffer geométrico real para
    predios, distancia real al trazado para obras lineales,
    polígono con mayor longitud de intersección para pendiente.
- **Validación cuantitativa** confirma direccionalidad correcta del
  rerouting bajo factores catastrales (ver §1.3).

### ⚠️ Pendientes técnicos / arquitecturales (post-P0)

1. **Grafo en PostGIS + pgrouting (P1).** Hoy el grafo se distribuye
   bundleado en el APK. Migrarlo a la base habilita actualización
   dinámica sin rebuild + ruteo server-side cuando hay conectividad.
2. **Integración IDEAM/CARDER (P2).** El motor TDD ya está preparado
   para consumir un raster `wet_time`, pero falta: sensor/feed del
   nivel del San Eugenio + tabla `river_readings` + escenarios
   pre-corridos en iRIC + endpoint `/v1/hazard/active` + FCM topic.
3. **CORS en `"*"` por default.** Si se monta dashboard web futuro,
   endurecer con allowlist por env. P0 no lo cubrió por scope.
4. **Web platform** (`npm run web`) bloqueado por
   `react-native-maps` sin guard `Platform.OS === 'web'` en
   `screens/StatisticsScreen.tsx`. No bloquea APK, solo el dev en
   navegador.

### 🟢 Limitaciones de diseño aceptadas

- **Clustering local + backend.** El backend clusteriza globalmente
  vía `POST /alerts/recompute` con DBSCAN PostGIS; la app hace
  clustering local también para feedback inmediato. Inevitable
  mientras el backend no implemente websockets.
- **Verificación de correo no bloquea login.** Solo bloquea reportes
  ciudadanos. Decisión consciente: UX más amigable.
- **Ubicación compartida de grupo es snapshot + polling 20 s**, no
  tiempo real via websocket. Aceptable para MVP.
- **Cobertura geográfica = Santa Rosa de Cabal.** Bbox catastral y
  grafo son específicos del municipio. Extender requiere re-ingesta;
  el backend ya soporta multi-municipio en el modelo de datos.

## 1.3 Estado actual

### Stack técnico

**Frontend:** Expo SDK ~54 / React Native 0.81 / React 19 /
expo-router 6 / TypeScript strict / react-native-maps / Firebase Auth
JS SDK 12 / AsyncStorage / Turf.js / @mapbox/polyline / Axios.

**Backend:** FastAPI 0.115 / Python 3.12 / SQLAlchemy async 2.0 +
GeoAlchemy2 / PostgreSQL con PostGIS / Alembic / Firebase Admin SDK /
slowapi / asyncpg. Hosteado en **Railway**; base de datos en
**Supabase** (PostgreSQL + PostGIS).

**Pipeline del grafo:** Node 18+ (build-graph.js, descarga OSM
Overpass) + Python 3.10+ con `uv run` (enrich_graph.py, shapely 2.x
+ STRtree + pyproj). Ver §3 de [docs/arquitectura.md](arquitectura.md).

**Herramientas:** EAS Build (APK Android), EAS Secrets, Railway
Variables, Firebase Console, Google Cloud Console.

### Datos offline bundleados

| Archivo | Tamaño | Contenido |
|---|---|---|
| `graph.json` | 3.7 MB | 6 538 nodos + 13 363 aristas. Hazards por intersección real, Tobler aplicado, `obraLinealVul` y `nearbyRisk` por buffer geométrico. |
| Amenazas (3 archivos) | ~1.5 MB | inundación, movimiento en masa, avenida torrencial. Polígonos con `Categoria` Alta/Media/Baja. |
| `data/catastro/` | ~12 MB | 12 capas del estudio EDAVR ALDESARROLLO 2025 (predios, vulnerabilidad edificaciones/obras/personas, riesgo por fenómeno, elementos expuestos, pendiente, exposición). |

### Validación cuantitativa de la metodología SIG

Resultados de `scripts/validate-routes-catastro.js` (50 rutas × 3
emergencias) tras P0:

| Emergencia | Δ duración (CATAS vs BASE) | % rutas cruzan ElemAlta | % rutas cruzan ObraVulAlta |
|---|---|---|---|
| Avenida torrencial | **+8.1 min** | 19.1 → **8.5 %** (−10.6 pp) | 19.1 → **8.5 %** (−10.6 pp) |
| Inundación | +7.0 min | 0 → 0 % | 18.4 → **12.2 %** (−6.2 pp) |
| Movimiento en masa | +7.2 min | 0 → 0 % | 12.2 → **8.2 %** (−4.0 pp) |

Lectura: con factores catastrales activos el motor reruta lejos de
zonas riesgosas (reduce a la mitad las rutas que cruzan obras
vulnerables o elementos en categoría Alta) a costa de ~7-8 min más
de duración. Direccionalidad correcta, evidencia citable del
Objetivo 5 de la pasantía ("validar funcionamiento mediante pruebas
controladas").

### Código por volumen (líneas aproximadas)

| Zona | Líneas | Observación |
|---|---|---|
| `components/MapViewContainer.tsx` | ~1 460 | Más grande. Orquesta routing, picking, overlays y modales. Candidato #1 a refactor. |
| `screens/HomeScreen.tsx` | ~820 | Crecido por bloque emergencias y FirstRunGuide. |
| `components/QuickEvacuateSheet.tsx` | ~700 | Encuesta 3 preguntas pre-mapa. |
| `components/MapVisorContainer.tsx` | ~470 | Visor geográfico con catastro, familiar, pins. |
| Algoritmos ruteo (`src/algorithms/*.ts`) | ~1 200 | Dijkstra, A\*, MultiSource, TDD, catastroCostFactors. |
| `backend/scripts/enrich_graph.py` | ~370 | Pipeline Etapa 2 — joins espaciales en EPSG:9377. |
| Backend `app/routers/*.py` | ~800 | 6 routers: health, me, municipios, reports, alerts, family_groups. |

### Seguridad aplicada (estado al 2026-04-30)

- ✅ Firebase service account rotada (llave anterior en git history es
  inválida). Solo como env var en Railway.
- ✅ `/alerts/recompute` con header `X-Admin-Secret` (HMAC compare)
  + whitelist `ADMIN_EMAILS` para admins humanos.
- ✅ Rate limits en endpoints spam-eables: `/family-groups` (10/min),
  `/family-groups/join` (20/min), `/members/me` (60/min),
  `/reports` (10/min).
- ✅ Geo-fence en PATCH ubicación familia (`ST_Contains` vs bbox del
  municipio).
- ✅ `.gitignore` blindado contra credenciales.
- ✅ `__DEV__` previene mock de ubicación accidental en APK prod.
- ✅ **Cumplimiento normativo geodésico** (post-P0): EPSG:4686 oficial.
- ⚠️ CORS en `"*"` — endurecer si llega dashboard web.
- ⚠️ Google Maps API key en `app.json` — restricciones por
  package + SHA-1 en GCP Console pendientes de confirmar.

---

## 2. Estado de los objetivos del proyecto

### Objetivo general

Desarrollar una aplicación móvil inteligente (EvacuApp) que calcule y
guíe rutas de evacuación seguras en Santa Rosa de Cabal considerando
amenazas naturales y análisis catastral, con participación ciudadana
y funcionalidad offline.

**→ LOGRADO.** APK compila y ejecuta. Validación cuantitativa
confirma que el motor reruta correctamente bajo factores catastrales.

### Objetivos específicos y su estado

| Objetivo | Estado | Evidencia |
|---|---|---|
| Algoritmo de ruteo ponderado por amenaza | ✅ Logrado | [src/algorithms/aStar.ts](../src/algorithms/aStar.ts), [timeDependentDijkstra.ts](../src/algorithms/timeDependentDijkstra.ts); penalizaciones Baja 1×/Media 4×/Alta 8×; hazards detectados por **intersección line-polygon real** (post-P0). |
| Integrar vulnerabilidad y exposición catastral | ✅ Logrado | [src/algorithms/catastroCostFactors.ts](../src/algorithms/catastroCostFactors.ts) + [backend/scripts/enrich_graph.py](../backend/scripts/enrich_graph.py) con buffer geométrico real (4B) y distancia real al trazado (4A) en EPSG:9377. |
| Pipeline reproducible de construcción del grafo | ✅ Logrado (post-P0) | `npm run rebuild-graph` = `build-graph` (Node, OSM) + `enrich-graph` (Python, shapely+STRtree). Documentado en [docs/arquitectura.md §3](arquitectura.md). |
| Cumplimiento normativo geodésico | ✅ Logrado (post-P0) | Storage en EPSG:4686 (Resolución IGAC 471/2020). Métricas en EPSG:9377 (CTM12). |
| Participación ciudadana (reportes, desaparecidos, alertas) | ✅ Logrado | [components/ReportModal.tsx](../components/ReportModal.tsx), [MissingPersonsModal.tsx](../components/MissingPersonsModal.tsx); clustering en [reportsService.ts](../src/services/reportsService.ts) y [backend/services/clustering.py](../backend/app/services/clustering.py). |
| Grupos familiares sincronizados | ✅ Logrado con limitación | [components/FamilyGroupModal.tsx](../components/FamilyGroupModal.tsx) con polling 20 s (no tiempo real). |
| Módulos capacitación + preparación + estadísticas | ✅ Logrado | [screens/TrainingScreen.tsx](../screens/TrainingScreen.tsx), [PrepareScreen.tsx](../screens/PrepareScreen.tsx), [StatisticsScreen.tsx](../screens/StatisticsScreen.tsx). |
| Validación cuantitativa de la metodología | ✅ Logrado | Tabla §1.3. 50 rutas × 3 emergencias, direccionalidad confirmada (−10.6 pp en avenida torrencial). |
| Validación SUS con usuarios piloto | ⏳ Pendiente | `docs/sus_form_content.md` existe; falta recolección. |
| APK distribuible vía QR | 🟡 En curso | APK preview compila; pendiente APK production final. |

### Limitaciones encontradas

1. **Validación SUS real no se completó.** Depende de tiempo con
   usuarios reales en Santa Rosa.
2. **Escalado geográfico** amarrado al bbox de Santa Rosa.
3. **Tiempo real de ubicación de familia** = polling 20 s, no
   websocket.
4. **Datos catastrales con PII indirecta** retirados por sensibilidad
   ética (niños/mayores/discapacidad). Análisis de exposición queda
   en plano agregado.
5. **Dependencia de APIs externas:** Google Maps, OpenRouteService
   (fallback), Firebase Auth, Overpass (solo en build-graph).
6. **Backend single-instance Railway.** Si cae, reportes y grupo
   familiar dejan de funcionar; el cálculo de ruta local sigue
   siempre.
7. **Roles de admin** = email whitelist + shared secret. No hay
   gestión visual.

---

## 3. Pendientes priorizados

### 🔴 Bloqueantes para entregar APK final

(ninguno conocido al 2026-04-30 — los 🔴 del 2026-04-24 fueron
resueltos en commits e7d8560 y 50151c6.)

### 🟠 Importantes — siguiente sesión

1. **P1 — subir el grafo a PostGIS** + endpoint `GET /v1/graph/{municipio_id}`
   para que el cliente baje el grafo desde DB. Habilita actualización
   sin rebuild de APK. Citable como "topología sobre base oficial".
2. **CORS hardening en backend** — abortar arranque si
   `app_env == "production"` y `cors_origins == "*"`. Lista explícita
   de orígenes para producción.
3. **Recopilar SUS con usuarios piloto** en Santa Rosa. Bloqueado por
   logística, no por código.

### 🟡 Calidad / DX / cosméticos

4. **`console.log/warn/error` activos en APK production** — agregar
   `babel-plugin-transform-remove-console` o guard `__DEV__`.
5. **Web platform fix** — guard `Platform.OS === 'web'` o variante
   `.web.tsx` para `screens/StatisticsScreen.tsx`. Habilita
   `npm run web` para validación rápida.
6. **`MapViewContainer.tsx` con ~1 460 líneas** — refactor a
   submódulos (ruteo, picking, overlays, modales).
7. **Duplicación `_point_wkt()` / `coords_to_latlng()` en routers** —
   extraer a `app/utils/geo.py`.
8. **Verificar restricciones de Google Maps API Key** en GCP Console
   (package + SHA-1).
9. **Grafo sin checksum/versionado** — agregar `graph_hash` que el
   cliente verifique al cargar.
10. **Observabilidad backend mínima** — Sentry o OpenTelemetry,
    structured logs JSON. Hoy es `logging.basicConfig` sin más.

### 🟢 Roadmap largo plazo (P2+)

11. **Integración IDEAM/CARDER** (P2) — feed del nivel del San
    Eugenio + tabla `river_readings` + escenarios iRIC pre-corridos
    + endpoint `/v1/hazard/active` + FCM topic por municipio. Hace
    que la "ruta óptima" cambie cuando suba el río.
12. **Backup automático de Supabase** (plan pago) o snapshots
    manuales programados.
13. **Refactor monorepo** — separar frontend / backend / scripts en
    workspaces si el equipo crece.

---

## 4. Plan al retomar la sesión

1. **P1 incremental** — diseñar el endpoint `/v1/graph/{municipio_id}`
   y la migración del grafo a tablas `graph_nodes` / `graph_edges` en
   PostGIS. Consume el JSON enriquecido como entrada de seed.
2. **CORS hardening** + lista explícita de orígenes para production.
3. **Recopilar resultados SUS** (depende de la usuaria).
4. **APK production final** una vez P1 esté estable, antes de la
   entrega de pasantía.
5. **Redactar productos finales** usando
   [docs/outline-productos-finales.md](outline-productos-finales.md).
   Material técnico nuevo disponible: el split del pipeline, la
   adopción del datum oficial, la validación cuantitativa de
   factores catastrales — todos citables como aporte metodológico
   en el documento académico.
