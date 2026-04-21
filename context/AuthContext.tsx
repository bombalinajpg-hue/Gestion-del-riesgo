/**
 * AuthContext — estado global de autenticación para la app RN.
 *
 * Responsabilidades:
 *   · Suscribirse a cambios de sesión de Firebase (`onAuthStateChanged`)
 *     y reflejarlos en state de React.
 *   · Exponer `signIn`, `signUp`, `signOut` que envuelven los helpers
 *     de `firebaseAuth.ts` y propagan errores con mensajes en español.
 *   · Exponer `loading` para que la UI sepa si aún estamos resolviendo
 *     la sesión persistida (al arrancar, Firebase toma ~300 ms en
 *     cargar la sesión de AsyncStorage).
 *
 * Consumo: cualquier componente puede hacer `const { user, signOut } = useAuth()`.
 * El guard de rutas en `_layout.tsx` redirige a /login cuando `user` es null.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type AuthUser,
  onAuthStateChanged,
  signInWithEmail,
  signOut as firebaseSignOut,
  signUpWithEmail,
} from "../src/services/firebaseAuth";

interface AuthContextValue {
  user: AuthUser | null;
  /** true mientras se resuelve la sesión persistida al arrancar. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Traduce códigos de error de Firebase a mensajes en español
 * entendibles para el usuario. Si llega un código desconocido
 * devolvemos el mensaje original para debug. */
function translateFirebaseError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return "El correo no tiene un formato válido.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Correo o contraseña incorrectos.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con ese correo.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/network-request-failed":
      return "Sin conexión. Verifica tu internet.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera unos minutos.";
    default:
      return err instanceof Error ? err.message : "Ocurrió un error";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `onAuthStateChanged` dispara inmediatamente con `null` al suscribirse
    // si no hay sesión, o con el user si Firebase recuperó la sesión
    // persistida de AsyncStorage. En cualquier caso, apagamos `loading`.
    const unsub = onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmail(email, password);
    } catch (e) {
      throw new Error(translateFirebaseError(e));
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      try {
        await signUpWithEmail(email, password, displayName);
      } catch (e) {
        throw new Error(translateFirebaseError(e));
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await firebaseSignOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
