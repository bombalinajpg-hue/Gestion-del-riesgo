# Arquitectura EvacuApp

Documento técnico para el capítulo de "Arquitectura del sistema" del documento final y para diagramas de la presentación.

---

## Vista global

```
┌─────────────────────────────────────────────────────────────────┐
│                       CLIENTE (APK Android)                       │
│ ┌──────────────┐  ┌──────────────┐  ┌───────────────┐           │
│ │  HomeScreen  │  │  VisorScreen │  │  CuentaScreen │           │
│ └───────┬──────┘  └───────┬──────┘  └───────┬───────┘           │
│         │                 │                  │                    │
│         └───────┬─────────┴──────────────────┘                    │
│                 │                                                  │
│   ┌─────────────▼─────────────┐    ┌────────────────────┐        │
│   │   RouteContext + Hooks    │    │   AuthContext      │        │
│   │   (useQuickRoutePipeline, │    │  (Firebase Auth)   │        │
│   │    useLocationTracking,   │    └─────────┬──────────┘        │
│   │    useGraphBootstrap)     │              │                    │
│   └─────────────┬─────────────┘              │                    │
│                 │                             │                    │
│   ┌─────────────▼──────────────────────┐    │                    │
│   │   Algorithms (Dijkstra, A*, TDD,   │    │                    │
│   │    MultiSource + catastroCost)     │    │                    │
│   └─────────────┬──────────────────────┘    │                    │
│                 │                             │                    │
│   ┌─────────────▼─────┐     ┌─────────────────▼─────┐            │
│   │  Datos Offline    │     │  Servicios API        │            │
│   │  graph.json 3.7MB │     │  (axios + Firebase    │            │
│   │  amenazas GeoJSON │     │   ID token)           │            │
│   │  catastro 12MB    │     └─────────┬─────────────┘            │
│   └───────────────────┘               │                          │
└───────────────────────────────────────┼──────────────────────────┘
                                         │ HTTPS + Bearer
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND (FastAPI en Railway)                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │   Middleware: CORS + Rate Limiting (slowapi)                │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                              │                                    │
│  ┌────────────┬──────────────┼────────────┬──────────────┐      │
│  │ /health    │ /me + /auth  │ /reports   │ /family-groups│      │
│  │ /municipios│              │ /alerts    │               │      │
│  └────────────┴──────────────┴────────────┴──────────────┘      │
│           │                                    │                  │
│  ┌────────▼────────┐              ┌───────────▼───────────┐     │
│  │  Firebase Admin │              │  SQLAlchemy async +   │     │
│  │  (verify ID     │              │  GeoAlchemy2 PostGIS  │     │
│  │   token)        │              └───────────┬───────────┘     │
│  └─────────────────┘                          │                  │
└────────────────────────────────────────────────┼──────────────────┘
                                                  │
                                                  ▼
                                   ┌─────────────────────────┐
                                   │  PostgreSQL + PostGIS   │
                                   │  (Supabase / Neon)      │
                                   │                         │
                                   │  municipios (bbox geom) │
                                   │  users                  │
                                   │  citizen_reports        │
                                   │  public_alerts          │
                                   │  family_groups          │
                                   │  group_members          │
                                   └─────────────────────────┘
```

---

## 1. Arquitectura del frontend

### Stack

- **Expo SDK ~54** con **React Native 0.81** y **React 19**.
- **expo-router v6** (file-based, stack raíz).
- **TypeScript strict mode** (tsconfig con customConditions `react-native`).
- **react-native-maps** para MapView + Marker + Polyline + Circle.
- **Firebase Auth JS SDK v12** (paquetes internos `@firebase/auth`, `@firebase/app`).
- **AsyncStorage** para persistencia (sesión, onboarding, cache de grupos).
- **Axios** para cliente HTTP.
- **Turf.js** para intersecciones geométricas.
- **@mapbox/polyline** para decodificar rutas codificadas.

### Navegación

```
app/
├── _layout.tsx       ← Stack raíz + AuthProvider + RouteProvider + AuthGate
├── index.tsx         ← HomeScreen (protegida)
├── login.tsx         ← Login + signup (pública)
├── onboarding.tsx    ← [DEPRECADO, pendiente de borrar]
├── map.tsx           ← Pantalla del mapa de Evacua
├── visor.tsx         ← Visor geográfico
├── cuenta.tsx        ← Perfil + verificación correo + logout
├── emergency.tsx     ← Herramientas durante emergencia
├── training.tsx      ← Capacitación (5 lecciones)
├── prepare.tsx       ← Kit 72h + plan familiar
├── statistics.tsx    ← Estadísticas agregadas
└── about.tsx         ← Acerca de + Manual rápido
```

Transiciones: **fade** para tabs (index/visor/cuenta/login/onboarding), **slide_from_right** para el resto del stack (evita race condition de `useLocalSearchParams` al navegar a `/map`).

### Capas

**Context providers:**
- `AuthContext` → `user`, `loading`, `signIn`, `signUp`, `signOut`, `refreshUser`.
- `RouteContext` → estado del flujo de ruta: emergencyType, startMode, startPoint, destino, routeProfile, quickRouteMode, pendingDestKind, blockedRoutes, etc.

**Hooks de negocio:**
- `useQuickRoutePipeline` — orquesta el flujo desde el QuickEvacuateSheet hasta el cálculo en el mapa (Case A: GPS + autoRoute; Case C: destino elegido).
- `useLocationTracking` — GPS con watchPosition + heading + mock en dev.
- `useGraphBootstrap` — carga y singleton del grafo vial.
- `useRoutePlanning` — pipeline: snap → cálculo → validación.
- `useIsochrones` — isócronas multi-fuente desde ubicación actual.
- `useCommunityStatus` — alertas ciudadanas cercanas + polling.
- `useMunicipio` — bootstrap municipio activo al arrancar.

**Servicios:**
- `firebaseAuth` — login, signup, signOut, verificación correo, refresh de user.
- `api` — cliente Axios con timeout 15s, Bearer token Firebase automático.
- `localRouter` — orquesta Dijkstra/A\*/TDD local con fallback a OpenRouteService.
- `reportsService` — clustering local + sincronización backend.
- `familyGroupsService` — CRUD del grupo + updateMyLocation.
- `missingPersonsService` — reporte y listado de desaparecidos.
- `isochroneService`, `graphService`, `poiService`, `weatherService`, `photoStorage`.

**Algoritmos propios (`src/algorithms/`):**
- **Dijkstra** clásico O((n+m) log n) con MinHeap.
- **A\*** con heurística Haversine — usado por defecto para 1→1 punto a punto.
- **Multi-Source Dijkstra** — N orígenes → 1 destino (isócronas, "destino más cercano").
- **Time-Dependent Dijkstra** — para avenida torrencial, donde cada arista tiene costo(t) con propiedad FIFO.
- **catastroCostFactors** — multiplicadores de costo por vulnerabilidad vial y riesgo predial adyacente.

### Datos offline bundleados

| Archivo | Tamaño | Contenido |
|---|---|---|
| `data/graph.json` | 3.7 MB | 6.538 nodos + 13.363 aristas de OSM Santa Rosa, enriquecidas con hazards, pendiente Tobler, vulnerabilidad obras lineales y predios en riesgo cercanos |
| `data/amenaza_inundacion.json` | 932 KB | Polígonos de inundación con categoría |
| `data/amenaza_movimiento_en_masa.json` | 515 KB | Polígonos de movimiento en masa |
| `data/amenaza_avenida_torrencial.json` | 79 KB | Polígonos de avenida torrencial |
| `data/catastro/` | ~12 MB | 12 capas: predios, vulnerabilidad (edificios/obras/personas), riesgo por fenómeno, elementos expuestos, pendiente, exposición |
| `data/destinos.json`, `instituciones.json` | pequeños | Puntos de encuentro + hospitales/policía/bomberos |

`graph.json` no se edita a mano — se construye por el pipeline de dos
etapas descrito en §2.5 (`scripts/build-graph.js` + `backend/scripts/enrich_graph.py`).

---

## 2. Arquitectura del backend

### Stack

- **FastAPI 0.115** + **uvicorn** (async).
- **Python 3.12**.
- **SQLAlchemy 2.0 async** + **GeoAlchemy2** (tipos PostGIS).
- **PostgreSQL** con extensión **PostGIS** (en Supabase o Neon).
- **Alembic** para migraciones.
- **Firebase Admin SDK 6.5** para verificar ID tokens.
- **slowapi 0.1.9** para rate limiting (storage en memoria).
- **asyncpg** (driver async) + **psycopg2-binary** (para Alembic sync).

### Estructura

```
backend/
├── app/
│   ├── main.py               ← FastAPI app + middleware + routers
│   ├── config.py             ← Settings pydantic (env vars)
│   ├── db.py                 ← Engine async + SessionLocal + get_db()
│   ├── models.py             ← SQLAlchemy models con PostGIS
│   ├── schemas.py            ← Pydantic DTOs
│   ├── auth.py               ← Firebase ID token verification
│   ├── rate_limit.py         ← Limiter global slowapi
│   ├── services/
│   │   └── clustering.py     ← DBSCAN espacial para alertas
│   └── routers/
│       ├── health.py         ← GET /v1/health
│       ├── me.py             ← GET /v1/me (upsert user)
│       ├── municipios.py     ← GET /v1/municipios
│       ├── reports.py        ← POST reports + reclustering background
│       ├── alerts.py         ← GET alerts near + POST recompute (admin)
│       └── family_groups.py  ← CRUD grupo + PATCH ubicación + DELETE miembro
├── alembic/
│   └── versions/             ← Migraciones
├── scripts/                  ← Ingesta de municipios (shapefile/GeoJSON)
├── Dockerfile
├── requirements.txt
└── start.sh
```

### Endpoints

| Método | Ruta | Auth | Rate limit | Propósito |
|---|---|---|---|---|
| GET | `/v1/health` | — | — | healthcheck |
| GET | `/v1/me` | Firebase | — | upsert y leer perfil del user |
| GET | `/v1/municipios` | — | — | listar municipios activos |
| GET | `/v1/municipios/{id}` | — | — | detalle con bbox |
| POST | `/v1/reports` | Firebase | 10/min | crear reporte ciudadano + background reclustering |
| GET | `/v1/reports/near` | Firebase | — | reportes cerca de un punto |
| GET | `/v1/alerts` | — | — | alertas del municipio (clusters) |
| GET | `/v1/alerts/near` | — | — | alertas cerca de un punto |
| POST | `/v1/alerts/recompute` | **X-Admin-Secret** | — | re-clustering completo |
| POST | `/v1/family-groups` | Firebase | 10/min | crear grupo + código |
| POST | `/v1/family-groups/join` | Firebase | 20/min | unirse con código |
| GET | `/v1/family-groups/me` | Firebase | — | listar mis grupos |
| GET | `/v1/family-groups/{code}` | Firebase | — | detalle con miembros |
| PATCH | `/v1/family-groups/{code}/members/me` | Firebase + geo-fence | 60/min | actualizar mi ubicación |
| DELETE | `/v1/family-groups/{code}/members/me` | Firebase | — | salir del grupo |

### Modelo de datos

**Política de sistemas de referencia espacial** (post-endurecimiento SIG, 2026-04-30):

- **Storage canónico = EPSG:4686 (MAGNA-SIRGAS)** en todas las columnas
  `Geometry`. Cumple Resolución IGAC 471/2020 (datum oficial Colombia).
- **Wire al cliente RN = lat/lng numérico "tal cual"**. La diferencia
  4686 ↔ 4686 (WGS84) es ~10 cm — invisible al usuario, así no se
  reproyecta en cada `ST_AsGeoJSON`. El cliente es 4686 implícito.
- **Operaciones métricas = EPSG:9377 (CTM12)** vía `ST_Transform(geom, 9377)`
  cuando se necesitan distancias o áreas exactas en metros. Para queries
  de proximidad simples se sigue usando `::geography` con `ST_DWithin`.

```
municipios
├── id (UUID PK)
├── slug (unique)
├── name
├── bbox (Geometry POLYGON 4686) -- usado para geo-fence
├── active
└── created_at

users
├── id (UUID PK)
├── firebase_uid (unique)
├── email
├── display_name
├── photo_url
└── created_at

citizen_reports
├── id (UUID PK)
├── municipio_id (FK)
├── user_id (FK)
├── type (enum: bloqueo_vial, sendero_obstruido, inundacion_local, deslizamiento_local, riesgo_electrico, refugio_saturado, refugio_cerrado, otro)
├── severity (enum: leve, moderada, grave)
├── note
├── location (Geometry POINT 4686)
├── photo_url (opcional)
├── created_at
└── expired_at (soft delete)

public_alerts
├── id (UUID PK)
├── municipio_id (FK)
├── type
├── centroid (Geometry POINT 4686)
├── radius_m
├── aggregated_severity
├── support_count
├── unique_device_count
├── sample_photo_url
├── first_at, last_at

family_groups
├── id (UUID PK)
├── code (unique, 6 chars sin O/0/I/1/L)
├── name
├── municipio_id (FK)
├── created_by_user_id (FK)
└── created_at

group_members
├── id (UUID PK)
├── group_id (FK)
├── user_id (FK)
├── display_name
├── last_location (Geometry POINT 4686)
├── last_status (enum: safe, evacuating, help, unknown)
├── last_seen_at
└── joined_at

missing_persons
├── id (UUID PK)
├── municipio_id (FK)
├── reported_by_user_id (FK)
├── name, description, photo_url
├── last_seen_location (Geometry POINT 4686)
├── contact
├── status (desaparecida / encontrada)
└── created_at
```

### Seguridad aplicada

- **Firebase ID token verification** server-side con `check_revoked=True`.
- **SQL injection safe**: todas las queries son parametrizadas (SQLAlchemy ORM + `text()` con bind params). No hay concatenación de strings en queries.
- **Rate limiting**: `slowapi` con storage en memoria + key por IP remota (ajustable a Redis si se escala horizontalmente).
- **`/alerts/recompute`** protegido con **admin secret** (comparación HMAC-safe con `hmac.compare_digest`).
- **Validación geo-fence** en PATCH ubicación familia: `ST_Contains(municipio.bbox, point)` → 422 si GPS fuera del bbox. Fail-permissive si bbox es NULL (data legacy).
- **Firebase service account** como env var en Railway (no en disco, no en git).
- **CORS** configurable por env var (default `"*"` para dev).
- **Soft-delete** en reportes (`expired_at`) para audit trail.
- **Cumplimiento normativo geodésico**: storage canónico en EPSG:4686
  (MAGNA-SIRGAS, Resolución IGAC 471/2020). Mediciones métricas en
  EPSG:9377 (CTM12, sistema proyectado oficial nacional, unidades en
  metros) o vía `::geography` para `ST_DWithin`. Sin aproximaciones
  planas en grados.

### Deploy

- **Railway**: hospedaje del servicio FastAPI. Configurado con Dockerfile (build context = root, incluye `data/` para seed).
- **Variables de entorno en Railway**: `DATABASE_URL`, `FIREBASE_CREDENTIALS_JSON`, `ADMIN_SECRET`, `APP_ENV`, `LOG_LEVEL`, `CORS_ORIGINS`.
- **Base de datos**: Supabase (Postgres con PostGIS preinstalado). Requiere `search_path=public,extensions` para que PostGIS funcione (fix en `db.py` con event listener Alembic).
- **Migraciones**: Alembic contra la misma DB. Se corren con `scripts/` o en start.

### Observabilidad

Minimal: `logging.basicConfig` + 9 log calls a nivel INFO/WARNING en los routers críticos. No hay structured logging ni APM. Aceptable para MVP.

---

## 3. Pipeline del grafo vial (offline)

`data/graph.json` se construye por un pipeline de **dos etapas** —
una en Node y otra en Python. Esta separación es deliberada: cada
herramienta hace lo que mejor sabe.

```
node scripts/build-graph.js              ← Etapa 1 — topología
        ↓
data/graph.json (flat) + data/graph.flat.backup.json
        ↓
uv run backend/scripts/enrich_graph.py   ← Etapa 2 — joins espaciales
        ↓
data/graph.json (enriched)
```

Atajo: `npm run rebuild-graph` corre las dos en orden.

### Etapa 1 — `scripts/build-graph.js`

Descarga la red vial de Santa Rosa de Cabal desde **OpenStreetMap vía
Overpass API** (con User-Agent explícito; Node 24 sin UA recibe 406)
y arma la topología base:

- **Nodos:** un nodo del grafo por cada nodo OSM en alguna way útil
  (intersección o vértice intermedio de la geometría).
- **Aristas:** un par dirigido por cada segmento; doble si la way no
  es `oneway`.
- **Costos nominales por perfil** (`foot-walking` / `cycling-regular`
  / `driving-car`) calculados como `lengthMeters / SPEED[highway]`,
  con velocidades calibradas para Santa Rosa: vías residenciales
  29 km/h vs los 50 km/h del límite legal — la cordillera Central
  impone pendientes ~8 % y firme irregular.
- También gestiona `data/graph.flat.backup.json`: lo reescribe siempre
  al terminar para evitar que un backup de un OSM anterior contamine
  la siguiente etapa.

NO toca capas de amenaza ni catastrales.

### Etapa 2 — `backend/scripts/enrich_graph.py`

Hace todos los joins espaciales con **shapely 2.x + STRtree + pyproj**,
operando en **EPSG:9377** (CTM12 / MAGNA-SIRGAS proyectado, oficial
Colombia, unidades en metros). Reproyección de las geometrías de cada
capa a 9377 una sola vez al cargar; los joins por arista usan el
árbol espacial para `O(log n)` en cada capa — necesario porque
13 363 aristas × 8 capas con hasta 270 polígonos serían ~28 M
comparaciones sin índice.

| Factor | Método |
|---|---|
| **Hazards** (3 emergencias × 3 categorías) | Line-polygon intersection. Si la arista cruza polígonos de distinta categoría, gana la severidad **MAX** (Alta > Media > Baja). |
| **3A — Pendiente** | Polígono de `pendiente_grados.geojson` con **mayor longitud de intersección** con la arista (no por mid-point). Función de Tobler `W = 6 · exp(−3.5 · |S+0.05|) km/h` reemplaza `costSeconds.foot-walking`; el plano original se preserva en `costSecondsFlat` para idempotencia y comparación BASE vs CATAS. |
| **4A — Vulnerabilidad obras lineales** | `line.distance(geom)` ≤ 15 m sobre el trazado completo, no haversine al mid-point. La obra más cercana define `obraLinealVul` (Alta/Media/Baja). |
| **4B — Predios en riesgo cercanos** | Buffer geométrico real `line.buffer(25)` con `intersects()` contra el polígono completo del predio. Cuenta agrupado por `(emergencia, categoría)` en `nearbyRisk`. |

`uv run` con metadata PEP 723 inline en el script instala
`shapely + pyproj` en un venv efímero la primera vez (~1 s) y cachea.
No requiere venv manual ni `pip install`.

### Por qué dos etapas y no PostGIS server-side

A corto plazo: el grafo se distribuye empaquetado en el APK porque el
ruteo corre offline (objetivo de diseño). PostGIS quedaría inútil sin
internet. La Etapa 2 podría reemplazarse por queries `ST_Intersects`
+ `ST_Buffer` server-side si se migra el grafo a la base de datos —
está en el roadmap como P1 (pgrouting + endpoint dinámico).

### Cuándo re-correr

- Cambia la red vial de OSM (barrios nuevos, vías agregadas).
- Cambian las capas oficiales de amenaza, catastro o el EDAVR.
- Se ajustan parámetros: `OBRA_LINEAL_BUFFER_M`, `PREDIO_RISK_BUFFER_M`,
  `RANGO_A_GRADOS`, factores de Tobler.

### Validación cuantitativa

`scripts/validate-routes-catastro.js` ejecuta 50 rutas × 3 emergencias
en dos configuraciones (BASE = grafo plano sin penalty; CATAS = Tobler
+ 4A + 4B activos) y reporta cuántas cruzan elementos en categoría Alta
o vías con vulnerabilidad Alta. Resultado tras P0 (2026-04-30):

| Emergencia | Δ duración | % rutas cruzan ElemAlta | % rutas cruzan ObraVulAlta |
|---|---|---|---|
| Avenida torrencial | +8.1 min | 19.1 → 8.5 % (−10.6 pp) | 19.1 → 8.5 % (−10.6 pp) |
| Inundación | +7.0 min | 0 → 0 % | 18.4 → 12.2 % (−6.2 pp) |
| Movimiento en masa | +7.2 min | 0 → 0 % | 12.2 → 8.2 % (−4.0 pp) |

Performance del benchmark (`scripts/benchmark-routing.js`, 100 rutas):
Dijkstra mediana **1.1 ms** / p99 **13 ms** sobre 13 363 aristas.

### Referencias normativas y científicas

- **Resolución IGAC 471/2020** — adopta MAGNA-SIRGAS / CTM12 como
  sistema oficial colombiano.
- **Decreto 1807/2014** — estudios detallados de riesgo como
  determinante de ordenamiento territorial.
- **Tobler, W. (1993)** — *Three presentations on geographical
  analysis and modeling*. NCGIA Technical Report 93-1.
- **ALDESARROLLO (2025)** — EDAVR río San Eugenio, Santa Rosa de
  Cabal. Fuente de los polígonos de pendiente, obras lineales y
  riesgo predial. Escala 1:1 000.

---

## 4. Flujo crítico: cálculo de ruta de evacuación

```
1. HomeScreen → "Evacua" (botón rojo)
   └── abre QuickEvacuateSheet

2. QuickEvacuateSheet (3 preguntas)
   ├── Q1: ¿Qué emergencia? (inundación / movimiento en masa / avenida)
   ├── Q2: ¿Desde dónde sales? (GPS / elegir en el mapa)
   └── Q3: ¿A qué destino? (más cercano / isócronas / institución específica)
   └── "Empezar" → handleQuickEvacuate en HomeScreen

3. HomeScreen.handleQuickEvacuate
   ├── setea RouteContext (emergencyType, startMode, destinoMode, pendingDestKind)
   ├── setea quickRouteMode=true
   └── router.push("/map", { autoRoute: "1" }) o { autoOpen: "pickStart" }

4. MapViewContainer (mount)
   ├── lee useLocalSearchParams (autoRoute / autoOpen)
   ├── inicializa useLocationTracking (GPS)
   ├── inicializa useGraphBootstrap (carga grafo)
   └── inicializa useQuickRoutePipeline

5. useQuickRoutePipeline
   ├── Case A (GPS + autoRoute=1): cuando hay location + graphReady + startMode=gps
   │  ├── pendingDestKind=closest → calcularRuta(markAsEvacuando=true)
   │  ├── pendingDestKind=heatmap → activa IsochroneOverlay + picking
   │  └── pendingDestKind=instituciones → activa overlay instituciones
   └── Case C (destino elegido en quickRouteMode): dispara calcularRuta

6. useRoutePlanning.calcularRuta
   ├── snap del origen (findNodeInGraph con tolerancia)
   ├── snap del destino (findClosestViaGraph si es "closest")
   ├── selecciona algoritmo según emergencyType:
   │  ├── avenida_torrencial → Time-Dependent Dijkstra (timing iRIC-Nays2DH)
   │  ├── otros → A* con costo ponderado por amenaza + catastro
   ├── construye polilínea con coordenadas
   ├── calcula resumen (distancia, tiempo)
   └── setea routeCoords + rutaSugerida/evacuando

7. MapView renderiza
   ├── Polyline azul (ruta segura)
   ├── Polyline roja (tramo en zona peligrosa, si lo hay)
   ├── Marker origen + destino
   └── Banner con tiempo/distancia + botón Street View + "Abrir en Google Maps"
```

Tiempos típicos de cálculo en dispositivo: 20–80 ms para rutas de 1–3 km.

---

## 5. Flujo: grupo familiar con ubicación compartida

```
1. Home → botón "Familia" (emergencia tools)
   └── abre FamilyGroupModal

2. FamilyGroupModal
   ├── si no hay grupos → menu (Crear | Unirme)
   ├── si hay grupos → lista de grupos
   └── al seleccionar uno → GroupView

3. GroupView
   ├── muestra código + botón compartir WhatsApp
   ├── muestra miembros con último estado y ubicación
   ├── botón "Compartir mi ubicación"
   │  └── Location.getCurrentPositionAsync + PATCH /members/me
   │     (backend valida geo-fence vs bbox municipio)
   └── polling cada 20s → GET /family-groups/{code}

4. Al tocar un miembro con ubicación
   └── router.push("/visor", { familyCode: CODE })

5. MapVisorContainer detecta familyCode param
   ├── getFamilyGroup(code) → lista miembros
   ├── renderiza pins azules por miembro con ubicación
   ├── animateToRegion al bbox de todos los miembros
   └── polling 20s del grupo
```
