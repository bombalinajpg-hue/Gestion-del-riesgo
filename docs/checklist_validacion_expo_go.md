# Checklist de validación UIX — Expo Go

Pre-requisito para compilar APK: **todos los ítems deben pasar en dispositivo físico con Expo Go** antes de disparar un nuevo build EAS.

## Tab Inicio
- [ ] HomeScreen se ve normal.
- [ ] Bottom nav visible.
- [ ] Botón 123 flotante sobre la tab bar.

## Tab Visor
- [ ] Cambias de tab con un solo toque.
- [ ] Mapa centrado en Santa Rosa.
- [ ] Chip superior "Emergencia: Ninguna" tocable.
- [ ] FAB catastro en esquina inferior-derecha.
- [ ] Tocar chip "Emergencia" → modal con 4 opciones → seleccionar "Avenida torrencial" funciona.
- [ ] Activar 3 toggles → se ven las capas + leyenda inferior-izquierda.
- [ ] Tocar "Cuantificación del riesgo" → modal con cifras sin truncar ("Edificaciones" completo, "Personas" completo), scroll fluido.

## Tab Cuenta
- [ ] Datos del usuario visibles.
- [ ] Info del estudio visible.
- [ ] Botón rojo "Cerrar sesión" funcional.

## Flujo Evacua (desde Tab Inicio)
- [ ] CTA "Calcular ruta" abre modal Evacua.
- [ ] Modal abre con defaults preseleccionados: GPS como origen + refugio más cercano como destino.
- [ ] Preguntas 2 y 3 grises (deshabilitadas) hasta elegir emergencia.
- [ ] Al elegir emergencia, preguntas 2 y 3 se activan.
- [ ] Botón "Empezar" queda habilitado inmediatamente al elegir emergencia (por los defaults ya preseleccionados).
- [ ] Flujo total: **2 taps** desde "Calcular ruta" hasta iniciar la ruta (elegir emergencia + "Empezar").
