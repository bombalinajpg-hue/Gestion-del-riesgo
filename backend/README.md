# EvacuApp Backend

API REST para EvacuApp — gestión del riesgo y evacuación.
**Stack**: FastAPI + PostgreSQL + PostGIS + SQLAlchemy async + Firebase Auth.
**Hosting**: Neon (Postgres) + Fly.io (API). Todo gratis.

---

## 📁 Estructura

```
backend/
├─ app/
│  ├─ main.py            → FastAPI entry + middleware + routers
│  ├─ config.py          → settings via pydantic-settings
│  ├─ db.py              → async engine + Base + get_db()
│  ├─ models.py          → SQLAlchemy + PostGIS (todas las tablas)
│  ├─ schemas.py         → Pydantic DTOs
│  ├─ auth.py            → verificación de Firebase ID tokens
│  └─ routers/
│     ├─ health.py       → GET /v1/health
│     ├─ me.py           → GET /v1/me (info del user auth)
│     ├─ municipios.py   → lista/detalle de municipios
│     ├─ reports.py      → POST + GET /v1/reports/near
│     └─ alerts.py       → GET /v1/alerts/near (clusters)
├─ alembic/              → migraciones de schema
├─ scripts/
│  └─ seed_municipio.py  → ingesta de un municipio desde shapefile/geojson
├─ Dockerfile
├─ requirements.txt
└─ .env.example
```

---

## 🚀 Setup local (primera vez)

### 1. Requisitos
- **Docker Desktop** instalado ([descarga](https://www.docker.com/products/docker-desktop)).
- Eso es todo — Postgres + PostGIS + Python los trae el contenedor.

### 2. Configurar Firebase (opcional para dev inicial)
Los endpoints que no requieren auth (`/health`, `/municipios`, `/alerts/near`) funcionan sin esto. Para probar `/me`, `POST /reports`, etc.:

1. [Firebase Console](https://console.firebase.google.com/) → crear proyecto.
2. **Authentication → Sign-in method**: habilitar **Email/Password** y **Google**.
3. **Project Settings → Service Accounts** → *Generate new private key* → descarga un JSON.
4. Guarda ese JSON en `backend/firebase-credentials.json` (ya está en `.gitignore`).

### 3. Levantar todo
Desde la raíz del repo (donde está `docker-compose.yml`):

```bash
docker compose up -d
```

Esto levanta:
- `postgres` en `localhost:5432` (user `rutas`, pwd `dev_password`, db `rutas`).
- `api` en `http://localhost:8000`.

### 4. Aplicar migraciones (crear tablas)

```bash
docker compose exec api alembic upgrade head
```

### 5. Verificar
- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/v1/health
  Debe devolver `{"status":"ok", "postgis":"3.4 USE_GEOS=1 ..."}`.

### 6. Ingestar tu primer municipio

```bash
# Copia los geojson al contenedor o móntalos via volumen.
docker compose exec api python -m scripts.seed_municipio \
  --slug santa-rosa \
  --name "Santa Rosa de Cabal" \
  --hazard inundacion:/app/seed/amenaza_inundacion.geojson \
  --hazard movimiento_en_masa:/app/seed/amenaza_mm.geojson \
  --hazard avenida_torrencial:/app/seed/amenaza_av.geojson \
  --shelters /app/seed/refugios.geojson \
  --institutions /app/seed/instituciones.geojson
```

---

## 🛠 Comandos frecuentes

```bash
# Logs del API en vivo
docker compose logs -f api

# Abrir shell en el contenedor del API
docker compose exec api bash

# Conectarse a la DB con psql
docker compose exec postgres psql -U rutas -d rutas

# Nueva migración autogenerada
docker compose exec api alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones pendientes
docker compose exec api alembic upgrade head

# Rollback a versión anterior
docker compose exec api alembic downgrade -1

# Tests
docker compose exec api pytest

# Lint + format
docker compose exec api ruff check app/
docker compose exec api ruff format app/

# Reset total (borra la DB)
docker compose down -v && docker compose up -d
docker compose exec api alembic upgrade head
```

---

## 🌐 Deploy a producción (gratis)

### Postgres en Neon
1. [neon.tech](https://neon.tech) → crear proyecto.
2. En el dashboard → **SQL Editor** → correr:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Copiar la **Connection string** (formato `postgresql://user:pwd@host/db`).
4. Para usarla con asyncpg, agregarle el driver: `postgresql+asyncpg://user:pwd@host/db`.

### API en Fly.io
1. Instalar `flyctl`: `curl -L https://fly.io/install.sh | sh` (o `iwr https://fly.io/install.ps1 -useb | iex` en PowerShell).
2. `fly auth login`.
3. Desde `backend/`:
   ```bash
   fly launch --no-deploy   # genera fly.toml; contesta no a Postgres (usamos Neon)
   ```
4. Inyectar secrets:
   ```bash
   fly secrets set \
     DATABASE_URL="postgresql+asyncpg://user:pwd@neon.tech/rutas" \
     APP_ENV=production \
     CORS_ORIGINS="https://tu-dominio.com,exp://tu-túnel-expo"

   # Montar el firebase-credentials.json como secret:
   fly secrets set FIREBASE_CREDENTIALS_JSON="$(cat firebase-credentials.json)"
   ```
   *(Habría que pequeño ajuste en `auth.py` para leer de `FIREBASE_CREDENTIALS_JSON` env var cuando el path no existe; lo agregamos al deployar.)*
5. Deploy:
   ```bash
   fly deploy
   ```
6. Primera migración en prod:
   ```bash
   fly ssh console -C "alembic upgrade head"
   ```

---

## 🔑 Auth — cómo la usa la app

La app RN hace login con Firebase SDK y obtiene un **ID token** (JWT). En cada request al backend manda:

```
Authorization: Bearer <ID_TOKEN>
```

El backend (`auth.py`) verifica la firma con `firebase-admin`, extrae `uid` + `email` + `name`, y crea el registro en `users` la primera vez (upsert). Los endpoints reciben el objeto `User` via dependency:

```python
@router.post("/reports")
async def create_report(
    payload: ReportIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
): ...
```

Roles (`citizen`, `staff`, `admin`) se restringen con `require_role`:

```python
@router.get(
    "/admin/stats",
    dependencies=[Depends(require_role(UserRole.admin, UserRole.staff))],
)
```

---

## 🧩 Integración con la app RN (pendiente)

Para que la app consuma este backend, vamos a:

1. Instalar en el app principal:
   ```
   npm install @react-native-firebase/app @react-native-firebase/auth
   ```
2. Nuevo servicio `src/services/api.ts` que envuelve `fetch` con el bearer token automático.
3. Migrar `reportsService.ts`, `missingPersonsService.ts`, `familyGroupsService.ts` para que, en vez de AsyncStorage, llamen al API. AsyncStorage queda como cache offline.

Lo hacemos en el próximo paso cuando este backend esté andando local.

---

## 📊 Schema (resumen)

| Tabla | Descripción | Claves geo |
|---|---|---|
| `municipios` | Unidad territorial base. Todo lo demás vive bajo un municipio. | `bbox POLYGON` |
| `users` | Usuarios autenticados con Firebase. | — |
| `citizen_reports` | Reportes crudos (bloqueo, inundación local, etc.). | `location POINT` |
| `public_alerts` | Clusters de reportes — lo que el mapa muestra. | `centroid POINT` |
| `missing_persons` | Reportes de desaparecidos. | `last_seen POINT` |
| `family_groups` + `group_members` | Grupos familiares y ubicación live. | `last_location POINT` |
| `shelters` | Puntos de encuentro (antes `destinos.json`). | `location POINT` |
| `institutions` | Salud / seguridad / culto / educación. | `location POINT` |
| `hazard_polygons` | Polígonos de amenaza por tipo y categoría. | `geom MULTIPOLYGON` |
| `graph_artifacts` | Referencia al grafo vial precalculado por municipio. | — |

Todas las columnas geo tienen **índice GIST** (`ST_DWithin` es O(log n)).

---

## 🧪 Tests (pendiente)

Estructura sugerida:
```
backend/tests/
├─ conftest.py     → fixtures (db limpia por test, client de httpx)
├─ test_health.py
├─ test_municipios.py
├─ test_reports.py
└─ test_alerts_spatial.py  ← tests de queries espaciales
```

Para tests aislados usamos una DB de test que Alembic crea/tira por sesión. Pendiente de implementar.
