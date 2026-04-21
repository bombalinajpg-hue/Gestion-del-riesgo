/**
 * Augmentation de tipos para `@firebase/auth` en React Native.
 *
 * Problema que resuelve:
 *   Firebase v12 estructura sus `exports` con `"types": "./dist/auth-public.d.ts"`
 *   en el nivel raíz del objeto condicional. TypeScript matchea esa
 *   condición ANTES de evaluar la nested `react-native.types`
 *   (`./dist/rn/index.rn.d.ts`), incluso con `customConditions: ["react-native"]`.
 *   Resultado: `getReactNativePersistence` no aparece en los tipos
 *   visibles aunque sí exista en runtime.
 *
 * Fix: declaramos manualmente el export faltante. Esto se MERGEA con
 * los tipos reales de `@firebase/auth` (interface merging de módulos
 * ambientes), así que TS sigue viendo todos los demás exports
 * (`createUserWithEmailAndPassword`, `initializeAuth`, etc.) más el
 * que acá agregamos.
 *
 * Importante: el `import type` de Persistence está en el TOP del
 * archivo, fuera del `declare module`. Ponerlo dentro crearía una
 * referencia circular que rompe el merge.
 *
 * Referencias:
 *   · https://github.com/firebase/firebase-js-sdk/issues/7961
 *   · https://github.com/firebase/firebase-js-sdk/issues/8312
 */

import type { Persistence } from "@firebase/auth";

declare module "@firebase/auth" {
  /** Persistencia basada en AsyncStorage — mantiene la sesión entre
   * cierres de app en React Native. Solo disponible en el build de RN. */
  export function getReactNativePersistence(
    storage: unknown,
  ): Persistence;
}
