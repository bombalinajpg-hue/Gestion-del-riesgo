# Guía de deploy — Railway + EAS Build APK

Checklist para llegar de "proyecto local" a "APK instalable con backend
en producción". Sigue los pasos en orden. Si algo falla, **no saltes**
al siguiente — vuelve atrás y arregla antes.

Tiempo estimado total: 4–6 horas con buffer para errores.

---

## Parte 1 — Deploy del backend a Railway

### 1.1 Crear cuenta y proyecto

1. Abre https://railway.app → **Login con GitHub** (lo más rápido).
2. Arriba a la derecha: **+ New Project** → **Empty Project**.
3. Ponle nombre "evacuapp-backend" (solo para que lo reconozcas).

### 1.2 Agregar PostgreSQL con PostGIS

1. Dentro del proyecto: **+ New** → **Database** → **Add PostgreSQL**.
2. Railway crea el servicio. Entra al servicio **Postgres**.
3. En la pestaña **Variables** copia el valor de `DATABASE_URL`
   (será algo como `postgresql://postgres:XXXX@hopper.proxy.rlwy.net:PORT/railway`).
   Lo vas a necesitar en el paso 1.4.
4. Habilita PostGIS. Entra al servicio Postgres → pestaña **Data** →
   **Query**. Pega y ejecuta:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   SELECT postgis_version();
   ```
   Debería devolver algo como `"3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1"`.
   Si falla con "permission denied", ve a Settings del servicio Postgres
   y activa **"Super user"** para tu rol, o contacta soporte de Railway.

### 1.3 Conectar el repositorio y deployar el backend

1. En el proyecto: **+ New** → **GitHub Repo** → autoriza Railway a leer
   tus repos → elige el repo `rutas` (o como se llame el tuyo).
2. Railway detectará el Dockerfile en `backend/Dockerfile`.
   Entra al servicio del backend recién creado → **Settings**:
   - **Root directory**: `backend`
   - **Build command**: (vacío, usa Dockerfile)
   - **Start command**: (vacío, usa el CMD del Dockerfile)
   - **Health check path**: `/v1/health/live`
   - **Health check timeout**: `30s`

### 1.4 Configurar variables de entorno

En el servicio del backend → pestaña **Variables** → agrega estas (usa
"New Variable" una por una):

| Nombre | Valor |
|---|---|
| `DATABASE_URL` | Pega el valor copiado en 1.2 |
| `APP_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `CORS_ORIGINS` | `*` _(para el demo; ver nota abajo)_ |
| `FIREBASE_CREDENTIALS_JSON` | Ver paso 1.5 |

**Nota sobre CORS**: `*` es permisivo pero funciona para APK Android
(que no envía cabeceras de origen estrictas). Para producción real
cambiar a los orígenes concretos.

### 1.5 Firebase credentials como variable

1. En local, abre `backend/firebase-credentials.json`.
2. **Comprime todo el contenido a una línea** (elimina saltos de línea).
   En PowerShell:
   ```powershell
   (Get-Content backend/firebase-credentials.json -Raw) -replace "`r`n","" -replace "`n","" | Set-Clipboard
   ```
   Eso copia el JSON comprimido al portapapeles.
3. En Railway → Variables → crea `FIREBASE_CREDENTIALS_JSON` y pega el
   contenido del portapapeles como valor.
   ⚠️ **NO** subas el archivo por el UI de Railway. Solo la variable.

### 1.6 Redeploy y verificar

1. Railway debería estar buildeando automáticamente. Mira la pestaña
   **Deployments** — el log debe mostrar `[start] Corriendo migrations...`
   y luego `Uvicorn running on http://0.0.0.0:PORT`.
2. Cuando el deploy está **Active**:
   - Railway te da una URL pública tipo `https://evacuapp-backend-production.up.railway.app`.
     La encuentras en **Settings → Networking → Public Networking**. Si
     no hay una, click **Generate Domain**.
3. Pruebas desde tu navegador:
   - `https://TU-URL/v1/health/live` → `{"status":"ok"}` ✅
   - `https://TU-URL/v1/health` → incluye `postgis` ✅
   - `https://TU-URL/docs` → Swagger UI de FastAPI ✅

Si alguna falla, revisa los logs de Railway del servicio backend.

### 1.7 Seed del municipio Santa Rosa

Las migraciones crean las tablas vacías. El municipio "Santa Rosa de
Cabal" y los refugios/instituciones base se cargan con un script.

1. En Railway, abre el servicio del backend → pestaña **Settings** →
   busca un botón/sección para correr comandos (Railway CLI o shell).
   Alternativamente, instala Railway CLI local:
   ```
   npm install -g @railway/cli
   railway login
   railway link   # elige el proyecto
   ```
2. Corre el seed:
   ```
   railway run --service backend python scripts/seed_municipio.py
   ```
   Esto inserta Santa Rosa de Cabal + importa `data/destinos.json`,
   `data/instituciones.json` y los polígonos de amenaza.

---

## Parte 2 — Compilar el APK

### 2.1 Apuntar la app al backend de producción

Edita `eas.json` para que el perfil `preview` inyecte la URL pública.
Abre `eas.json` y reemplaza el objeto `preview` por:

```json
"preview": {
  "distribution": "internal",
  "env": {
    "EXPO_PUBLIC_API_URL": "https://TU-URL-DE-RAILWAY"
  },
  "android": {
    "buildType": "apk"
  }
}
```

**IMPORTANTE**: `buildType: "apk"` le dice a EAS que produzca un `.apk`
directo (instalable al toque). Sin esto genera un `.aab` (App Bundle)
que solo sirve para subir a Play Store.

### 2.2 Instalar EAS CLI y loguearte

```
npm install -g eas-cli
eas login
```

Usa el mismo email con el que creaste el proyecto en Expo (el que
tiene el `projectId` que ya está en `app.json` — `22b3622b-...`).

### 2.3 Primer build (genera credenciales de firma)

```
eas build --platform android --profile preview
```

- La primera vez pregunta si quieres que EAS genere un keystore
  Android. Di **Yes** (así no tienes que manejar claves tú misma).
- Te da una URL tipo `https://expo.dev/accounts/X/projects/Y/builds/ZZZ`.
  Úsala para ver el progreso.
- Tiempo típico: **10–30 minutos** según cola de free tier.

### 2.4 Descargar y distribuir

Cuando el build termine:

1. La URL del build tiene un botón **Install** → genera un **QR code**
   apuntando a la URL de descarga directa del APK.
2. **Este QR es el que muestras para la sustentación**. Cualquiera lo
   escanea con Android y descarga el APK.
3. Alternativa: copia el link de **Download** y pégalo donde quieras
   (correo, documento, WhatsApp).

### 2.5 QA en Android físico

Instala el APK en un Android real y prueba:

- [ ] Login con tu cuenta Firebase funciona.
- [ ] Onboarding aparece primera vez.
- [ ] Home carga sin errores, no muestra "1 reporte cerca" si no hay data.
- [ ] Tap en "Evacua" abre el sheet con 3 preguntas.
- [ ] Calcular ruta (GPS + closest) dibuja polyline y auto-centra.
- [ ] Crear reporte funciona → sube al backend.
- [ ] En Visor, activar capas funciona sin crashear.
- [ ] Crear grupo familiar → recibe código → desde segundo dispositivo
      unirse con el código → ver al primer miembro.
- [ ] Ir a About → "Cerrar sesión" → vuelve a Login.

### 2.6 Generar segundo usuario de prueba para demo

Para demostrar multi-dispositivo en la sustentación:

1. Abre https://console.firebase.google.com → tu proyecto → **Authentication**
   → **Users** → **Add user**.
2. Crea 1–2 usuarios extra con email/password que recuerdes.
3. En el segundo celular (o emulador), instala el APK y loguéate con
   ese usuario.

---

## Troubleshooting rápido

**Backend en Railway muestra 500 al hacer login en la app**
→ `FIREBASE_CREDENTIALS_JSON` probablemente está mal escapado.
Revisa los logs: busca `FIREBASE_CREDENTIALS_JSON inválido`.
Re-genera el string usando el snippet de PowerShell del paso 1.5.

**Backend arranca pero `/v1/health` da error de PostGIS**
→ Te faltó correr `CREATE EXTENSION postgis` del paso 1.2.

**EAS Build falla con "package manager failed"**
→ Asegúrate de que `package-lock.json` o `pnpm-lock.yaml` está
  comiteado en el repo raíz.

**APK instala pero la app crashea al abrir**
→ Mira los logs con `adb logcat | findstr EvacuApp`. Si dice
  "network request failed", `EXPO_PUBLIC_API_URL` no llegó al build.
  Verifica el `env` en el profile `preview` de `eas.json`.

**La ruta se calcula pero no se ve en el mapa**
→ Confirma que el dispositivo tiene **Google Play Services** (los
  emuladores sin GMS no pintan tiles de Google Maps).

---

## Lo que queda marcado como v1.1

Features que NO van en este APK pero están identificadas:

- Sincronización de **missing persons** en backend (family groups sí sincroniza)
- **Push notifications** (Expo Notifications + FCM)
- **Modo offline robusto** (cola de reportes pendientes)
- **Historial de rutas evacuadas**
- **Dashboard web** para la empresa (análisis de uso)
- **Sync de status** de safety *fuera* del grupo familiar (agregado global)

En la sustentación: explica que el MVP actual ya sincroniza lo más
demostrable (reportes ciudadanos + grupos familiares) y que estas
features están en el roadmap de v1.1.
