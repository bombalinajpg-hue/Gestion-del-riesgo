/**
 * Wrapper del SDK JS de Firebase para la app RN.
 *
 * Responsabilidades:
 *   · Inicializar Firebase una sola vez al arrancar.
 *   · Exponer helpers tipados para login/signup/signOut.
 *   · Persistir la sesión entre cierres de app (AsyncStorage).
 *   · Entregar el ID token fresco a `api.ts` cada vez que haga un request
 *     (Firebase lo rota cada ~1 h; esta capa se encarga del refresh).
 *
 * Firebase JS SDK funciona dentro de Expo Go y no requiere
 * `expo prebuild`. Si en el futuro pasamos a @react-native-firebase/*,
 * esta API pública no cambia — solo reimplementamos los métodos.
 */

// Importamos desde `@firebase/app` y `@firebase/auth` (los paquetes
// internos) en vez de los umbrellas `firebase/app` / `firebase/auth`.
// Razón: en Firebase v12 el umbrella no expone la condición `react-native`
// en su exports map, así que TypeScript y bundlers pierden los helpers
// específicos de RN (`getReactNativePersistence`). El paquete interno
// sí los expone vía su `react-native` condition — con
// `customConditions: ["react-native"]` en tsconfig, TS los resuelve
// correctamente. En runtime, `metro.config.js` usa resolución legacy
// que también llega al build de RN.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, type FirebaseApp } from "@firebase/app";
import {
  createUserWithEmailAndPassword,
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendEmailVerification as firebaseSendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User as FirebaseUser,
} from "@firebase/auth";

// Las tres vars son obligatorias. Si faltan, el init lanza — preferimos
// fallar al arranque antes que en el primer login.
const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function ensureInit(): Auth {
  if (auth) return auth;
  for (const [k, v] of Object.entries(FIREBASE_CONFIG)) {
    if (!v) {
      throw new Error(
        `Falta env var EXPO_PUBLIC_FIREBASE_${k.replace(/([A-Z])/g, "_$1").toUpperCase()}. ` +
          "Copia .env.example → .env y completa los valores de Firebase Console.",
      );
    }
  }
  app = initializeApp(FIREBASE_CONFIG as Record<string, string>);
  // `initializeAuth` con persistencia de AsyncStorage hace que la sesión
  // sobreviva al cierre de la app. Sin esto, cada reapertura obliga a
  // re-loguearse — horrible para uso en emergencia.
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  return auth;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** Refleja `FirebaseUser.emailVerified`. Después de que el usuario
   *  clica el link de verificación desde su correo, Firebase actualiza
   *  el valor en el backend pero NO en el cliente hasta llamar a
   *  `reloadCurrentUser()`. Por eso exponemos `refreshUser()` en
   *  AuthContext para forzar el refresh desde la UI (ej. pantalla de
   *  Cuenta y el gate de ReportModal). */
  emailVerified: boolean;
}

function toAuthUser(u: FirebaseUser): AuthUser {
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    photoURL: u.photoURL,
    emailVerified: u.emailVerified,
  };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const a = ensureInit();
  const cred = await signInWithEmailAndPassword(a, email, password);
  return toAuthUser(cred.user);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthUser> {
  const a = ensureInit();
  const cred = await createUserWithEmailAndPassword(a, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  // Enviamos verificación por correo — el link caduca en ~1 hora.
  // Si el envío falla (p.ej. cuota), no hacemos fail del signup: el
  // usuario siempre puede reintentar desde el overlay "verifica tu
  // correo" con `resendEmailVerification`.
  try {
    await firebaseSendEmailVerification(cred.user);
  } catch {}
  return toAuthUser(cred.user);
}

export async function resendEmailVerification(): Promise<void> {
  const a = ensureInit();
  if (!a.currentUser) throw new Error("No hay sesión activa.");
  await firebaseSendEmailVerification(a.currentUser);
}

export function isEmailVerified(): boolean {
  const a = ensureInit();
  return a.currentUser?.emailVerified ?? false;
}

export async function reloadCurrentUser(): Promise<void> {
  const a = ensureInit();
  if (a.currentUser) await a.currentUser.reload();
}

/** Hace reload del currentUser y devuelve el AuthUser ya actualizado,
 *  o `null` si no hay sesión. Pensado para que AuthContext pueda
 *  refrescar su state tras una verificación de correo. */
export async function reloadAndGetCurrentUser(): Promise<AuthUser | null> {
  const a = ensureInit();
  if (!a.currentUser) return null;
  await a.currentUser.reload();
  return a.currentUser ? toAuthUser(a.currentUser) : null;
}

export async function signOut(): Promise<void> {
  const a = ensureInit();
  await firebaseSignOut(a);
}

export function getCurrentUser(): AuthUser | null {
  const a = ensureInit();
  return a.currentUser ? toAuthUser(a.currentUser) : null;
}

/** Se usa en `api.ts` antes de cada request para inyectar el Bearer.
 * `forceRefresh=false` por default — Firebase devuelve el token cacheado
 * si aún es válido (≤ 1 h) y lo refresca solo cuando va a expirar. */
export async function getCurrentIdToken(
  forceRefresh = false,
): Promise<string | null> {
  const a = ensureInit();
  if (!a.currentUser) return null;
  return a.currentUser.getIdToken(forceRefresh);
}

/** Suscribirse a cambios de sesión (login/logout/refresh). Devuelve la
 * función de unsubscribe — llamarla en el cleanup del useEffect. */
export function onAuthStateChanged(
  cb: (user: AuthUser | null) => void,
): () => void {
  const a = ensureInit();
  return firebaseOnAuthStateChanged(a, (u) => cb(u ? toAuthUser(u) : null));
}
