// Config de Metro bundler para Expo.
//
// Único ajuste: deshabilitar `unstable_enablePackageExports` y agregar
// `.cjs` a las extensiones resolvibles. Esto es necesario para que
// Firebase JS SDK v11+ se resuelva correctamente en React Native:
//
//   · Firebase usa el campo `exports` de su package.json para servir
//     distintos builds (node / browser / rn). Metro por default ignora
//     `exports` y usa `main`, lo que en v11 resuelve al build de browser
//     y pierde exports específicos de RN como `getReactNativePersistence`.
//   · Deshabilitar `unstable_enablePackageExports` fuerza a Metro a usar
//     el mecanismo de resolución legacy que sí funciona con Firebase.
//
// Referencia: https://github.com/firebase/firebase-js-sdk/issues/7961

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("cjs");
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
