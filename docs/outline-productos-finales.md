# Outline de productos finales — EvacuApp

Guía para redactar: manual de usuario, documento final y presentación. Incluye estructura sugerida + pistas de qué poner en cada sección + referencias al código.

---

## 1. Manual de usuario

### Audiencia

Ciudadanos de Santa Rosa de Cabal (adultos, no necesariamente tecnológicos). Ideal: tono directo, ilustraciones por pantalla, máximo 20 páginas A5 para impresión.

### Estructura sugerida

**Portada + índice + glosario rápido** (punto de encuentro / amenaza / ruta segura).

**Capítulo 1: Instalación y primer uso**
- Descarga del APK (QR + link).
- Permisos que pide (ubicación, cámara, notificaciones).
- Registro: correo + contraseña + nombre + apellido. "Te enviamos un correo de verificación; debes confirmarlo para hacer reportes ciudadanos, pero puedes usar todo lo demás sin verificar."
- Primer arranque: aparece el tour **FirstRunGuide** con 5 pantallas — puedes saltarlo o ver el recorrido.

**Capítulo 2: La pantalla de inicio**
- Hero con mi municipio (Santa Rosa de Cabal) y botón "Acerca de".
- **CTA principal rojo "Evacua"** → flujo de evacuación en 2 taps.
- Fila "Durante la emergencia": Mi estado, Familia, Desaparecido, Reportar.
- Tarjetas "Todas las herramientas": Capacitación, Prepárate.
- Bloque "Líneas de emergencia": 123, Bomberos (119), Defensa Civil (144), Cruz Roja (132).

**Capítulo 3: Calcular una ruta de evacuación (flujo Evacua)**
- Paso 1: toca el botón rojo "Evacua".
- Paso 2: elige el tipo de emergencia (Inundación, Movimiento en masa, Avenida torrencial). Los defaults se activan automáticamente: tu ubicación GPS como origen, punto de encuentro más cercano como destino.
- Paso 3: toca "Empezar". La app calcula la ruta más segura.
- En el mapa: verás tu ruta en azul, cualquier tramo en zona de peligro en rojo. Tiempo estimado y distancia en el banner superior.
- Puedes: Cancelar, abrir en Google Maps (con los puntos clave de tu ruta respetados), ver el destino en Street View.

**Capítulo 4: Explorar riesgos en el Visor geográfico**
- Qué muestra: mapa de Santa Rosa con capas de amenaza y catastro.
- Seleccionar tipo de emergencia con el chip superior (Previsualizar escenario).
- Botón de capas (🏛️ esquina inferior derecha) abre el panel con toggles: Elementos expuestos, Predios por riesgo, Pendiente del terreno, Puntos de encuentro, Instituciones.
- Ver "Cuantificación del riesgo" → modal con cifras agregadas de edificaciones, personas en ocupación máxima, valor catastral, valor de mercado, áreas.
- Tocar un pin de punto de encuentro o institución → abre modal con "Ir aquí" y "Vista 360".
- Botones flotantes: centrar en mi ubicación, limpiar mapa, cambiar tipo de mapa.

**Capítulo 5: Grupo familiar**
- Crear grupo: desde Home → Familia → "Crear nuevo grupo" → le pones nombre y confirmas → recibes código de 6 caracteres.
- Compartir código por WhatsApp con los familiares.
- Unirse a un grupo: Familia → "Unirme" → pegas el código.
- Compartir tu ubicación: dentro del grupo, botón "Compartir mi ubicación" → confirmas → se envía al backend y los demás miembros la ven en hasta 20 segundos.
- Tocar un miembro con ubicación → abres el Visor centrado en ese miembro con pins azules de todo el grupo.
- Tu estado: "A salvo", "Evacuando", "Necesito ayuda" (cambia desde "Mi estado").

**Capítulo 6: Reportar incidentes ciudadanos**
- Desde Home → "Reportar".
- Tipos: bloqueo vial, sendero obstruido, inundación puntual, deslizamiento, riesgo eléctrico, punto de encuentro saturado/cerrado, otro.
- Requiere haber verificado tu correo (si no, aparece la pantalla de "Verifica tu correo").
- Puedes adjuntar foto y describir el incidente.
- Si otros 2 vecinos reportan un problema cercano, el sistema agrupa en una "alerta ciudadana" visible para todos.

**Capítulo 7: Persona desaparecida**
- Home → "Desaparecido" → "Nuevo reporte".
- Adjuntar: foto, nombre, descripción, última ubicación, contacto.
- Requiere correo verificado.
- Marcar como "Encontrada" cuando aparezca.

**Capítulo 8: Capacitación y preparación**
- Capacitación: 5 lecciones con recomendaciones UNGRD.
- Prepárate: kit de 72 horas + plan familiar.

**Capítulo 9: Mi cuenta**
- Ver tus datos (nombre, correo, ID de usuario).
- Estado del correo verificado (✅ o ⚠️).
- Botón "Reenviar correo" / "Ya verifiqué".
- Cerrar sesión.

**Capítulo 10: Problemas comunes (FAQ)**
- "No me llega el correo" → revisar spam, reenviar desde Cuenta.
- "El mapa sale gris" → la app necesita datos, intenta con WiFi o revisa la clave de Google Maps (solo relevante si quien compila el APK olvidó la key).
- "La ruta no aparece" → verifica que el GPS tenga señal y que estés dentro de Santa Rosa (el grafo cubre solo el municipio).
- "No puedo reportar" → aparece gate de verificación. Verifica tu correo desde el link que te enviamos.
- "El grupo familiar no se actualiza" → el polling es cada 20 segundos, da un poco de tiempo.

**Capítulo 11: Contacto de soporte**
- Correo del equipo, link al repositorio (si es abierto), agradecimientos a UNGRD, Defensa Civil, ALDESARROLLO, CTGlobal, Universidad Distrital.

---

## 2. Documento final (informe de grado)

### Estructura académica sugerida (25–60 páginas)

**1. Resumen** (1 página)
Objetivo, método, resultados, conclusión — versión corta para jurados y bibliotecas.

**2. Introducción**
Contexto del riesgo de desastre en Santa Rosa de Cabal. Por qué una app móvil y no una solución puramente institucional. Brecha que llena EvacuApp frente a Google Maps/Waze.

**3. Marco teórico y legal**
- Gestión del riesgo en Colombia: UNGRD, Defensa Civil, Decreto 1807/2014, Política Nacional de Gestión del Riesgo de Desastres.
- Conceptos: amenaza, vulnerabilidad, exposición, riesgo. Fórmula clásica R = f(A, V, E).
- Ruteo en grafos con pesos dinámicos: Dijkstra, A\*, Time-Dependent Dijkstra. Propiedad FIFO.
- Modelación hidráulica 2D (iRIC-Nays2DH) — qué produce: rasters de tirante (profundidad) y tiempo de llegada del frente.
- Avalúos masivos y catastro multipropósito: contexto de la especialidad de Ingeniería Catastral y Geodesia.
- Usabilidad: System Usability Scale (SUS). Rango de puntuación.

**4. Antecedentes**
- Apps comparables: Google Maps Platform for Emergency, Waze Community, apps de gestión del riesgo de FEMA (EEUU), GDACS. Qué les falta para el contexto colombiano.
- Estudios previos de rutas de evacuación: [referencias que tengas].

**5. Caso de estudio: río San Eugenio**
- Ubicación, cuenca, amenaza dominante (inundación por crecida + movimientos en masa en ladera + avenida torrencial esporádica).
- Estudio Detallado de Amenaza, Vulnerabilidad y Riesgo (EDAVR) de ALDESARROLLO 2025: metodología, productos (geoJSON de amenazas y riesgos), resolución, escala.
- Alianza con CTGlobal: rol en la integración catastral.

**6. Objetivos**
- General (citar del anteproyecto).
- Específicos (los 5–7 que vimos en el ToC).

**7. Metodología**
- Arquitectura cliente-servidor (ver [arquitectura.md](arquitectura.md)).
- Pipeline de datos: OSM overpass → grafo flat → carga en app.
- Pipeline de amenazas: shapefiles de ALDESARROLLO → GeoJSON → bundle en app.
- Pipeline de catastro: base predial → cruces espaciales con capas de riesgo → `exposicion_catastral.json`.
- Algoritmos: Dijkstra clásico, A\* con Haversine, Multi-Source Dijkstra para isócronas, Time-Dependent Dijkstra para avenida torrencial. Función de costo = tiempo base × factor_amenaza × factor_catastro.
- Stack tecnológico: React Native/Expo (frontend), FastAPI + PostGIS (backend), Firebase Auth.

**8. Implementación**
- Frontend (ver [arquitectura.md](arquitectura.md)).
- Backend (ver [arquitectura.md](arquitectura.md)).
- Decisiones de diseño:
  - Offline-first: por qué el grafo se bundlea y no se consulta por API.
  - Fallback a OpenRouteService: qué hace, cuándo se usa.
  - Clustering local + remoto: por qué se duplica.
  - Snapshot 20s vs websocket para grupo familiar: decisión de MVP.
- Seguridad: rotación de credenciales Firebase, admin secret, rate limiting, geo-fence.

**9. Validación y resultados**
- Benchmark de algoritmos: tiempos de cálculo en dispositivo (ver `scripts/benchmark-routing.js` y `data/benchmark_routing.csv`).
- Validación de rutas con capas catastrales: `scripts/validate-routes-catastro.js` y `data/validacion_catastro.csv`.
- Pruebas SUS: cuestionario `docs/sus_form_content.md`. Si se recopilan resultados, incluirlos: N usuarios, puntaje promedio, desglose por pregunta.
- Checklist de validación UIX en `docs/checklist_validacion_expo_go.md` — ¿qué items pasaron, cuáles no?
- Screenshots de la app.

**10. Discusión**
- Qué se logró: rutas seguras calculadas offline con amenaza + catastro integrado, grupo familiar, reportes.
- Qué quedó pendiente: validación SUS completa, escalamiento a otros municipios, tiempo real con websocket.
- Compromiso ética: exclusión de métricas individuales sensibles (niños, discapacidad) en la cuantificación pública.

**11. Conclusiones y recomendaciones**
- La app demuestra que es viable integrar modelación de amenaza + catastro en una herramienta ciudadana.
- Recomendaciones para adopción institucional: municipio, alcaldía, Defensa Civil.
- Trabajo futuro: extender a otros municipios, integrar alertas push, dashboard staff.

**12. Bibliografía**
UNGRD, ALDESARROLLO, Decreto 1807/2014, papers de ruteo TDD, SUS original Brooke 1996.

**13. Anexos**
- Código fuente (link repositorio).
- APK descargable (link + QR).
- Manual de usuario (el documento 1 de esta lista).
- Capturas de pantalla.
- Diagramas de arquitectura (de [arquitectura.md](arquitectura.md)).
- Resultados SUS crudos (si se recopilan).

---

## 3. Presentación (sustentación)

### Formato: 12–15 slides para 15–20 minutos. Dejar Q&A abierto.

**Slide 1 — Portada**
Logo EvacuApp + título + autora + directora + universidad + fecha.

**Slide 2 — Problema**
Santa Rosa de Cabal en mapa + foto de una emergencia real reciente (si hay) + una línea: *"Cuando una emergencia ocurre, los ciudadanos no tienen una herramienta que conozca el terreno, las amenazas locales y los refugios cercanos."*

**Slide 3 — Brecha**
Tabla: Google Maps vs Waze vs EvacuApp → 3 columnas. Solo EvacuApp: conoce amenaza, funciona offline, integra catastro.

**Slide 4 — Objetivo general**
Una frase. Algo como "Desarrollar una aplicación móvil inteligente que calcule rutas de evacuación seguras en Santa Rosa de Cabal ponderando amenazas naturales y análisis catastral, con participación ciudadana y funcionalidad offline."

**Slide 5 — Caso de estudio**
Mapa del río San Eugenio + EDAVR ALDESARROLLO 2025 + 3 amenazas. Alianza CTGlobal.

**Slide 6 — Arquitectura**
Diagrama de [arquitectura.md](arquitectura.md) sección "Vista global". Flecha cliente → backend → DB.

**Slide 7 — Algoritmos de ruteo**
Ecuación: `costo(arista) = tiempo_base × factor_amenaza × factor_catastro`. Tabla de factores (Baja 1×, Media 4×, Alta 8×). Menciona Dijkstra, A\* y Time-Dependent Dijkstra con breve justificación.

**Slide 8 — Demo screens**
4 capturas: Home, flujo Evacua, ruta pintada, Visor con capas.

**Slide 9 — Participación ciudadana**
Flujo: reporte → clustering → alerta ciudadana visible. Grupo familiar con código compartible.

**Slide 10 — Seguridad y privacidad**
- Verificación de correo para reportes.
- Geo-fence en ubicación familia (previene spoofing).
- Rotación de credenciales backend.
- Decisión ética: excluir métricas individuales sensibles.

**Slide 11 — Validación**
- Benchmark rutas: tiempos 20–80 ms en dispositivo.
- Validación catastral: N predios cruzados, coherencia con EDAVR.
- SUS (si hay resultados): puntaje + desglose.
- Screenshots de APK funcionando.

**Slide 12 — Logros vs objetivos**
Tabla ✅ / ⏳ de cada objetivo específico.

**Slide 13 — Limitaciones**
3–4 bullets: cobertura geográfica, tiempo real vs snapshot, validación SUS parcial, dependencia de APIs externas.

**Slide 14 — Trabajo futuro**
Recomendaciones: adopción institucional, extender a otros municipios, dashboard staff, integrar push notifications para alertas oficiales, testing con más usuarios.

**Slide 15 — Agradecimientos + QR APK**
UNGRD, Defensa Civil, ALDESARROLLO, CTGlobal, Universidad Distrital, director/a. Al centro: QR para descargar APK. Correo de contacto.

### Recomendaciones de oratoria

- Empieza con la historia de una emergencia real cercana (5 segundos) — pone contexto humano antes del tech.
- Demo en vivo si puedes (teléfono conectado a proyector) — abrir la app, tocar Evacua, mostrar ruta calculándose. El *"wow moment"*.
- Si no puedes demo en vivo, ten video de 30 s en loop.
- Cerrar con "¿Preguntas?" y esperar — no rellenes el silencio.

---

## 4. Otros productos que puede pedir la U

- **Video demo** de 2 minutos (graba con pantalla del teléfono + narración).
- **Póster académico** de 1 hoja A1 — misma info que slides 1, 3, 6, 11.
- **Artículo corto** (6–8 páginas IEEE) si quieres publicar — resumen del documento final.
- **Código en GitHub público** con README bueno, screenshots, link al APK, link al video.

---

## Checklist antes de sustentar

- [ ] APK production compilado y probado en al menos 2 teléfonos distintos.
- [ ] QR con link al APK impreso.
- [ ] Manual de usuario impreso + PDF.
- [ ] Documento final encuadernado + PDF.
- [ ] Presentación .pptx y .pdf en USB y nube.
- [ ] Video demo en loop listo como backup.
- [ ] Internet del salón confirmado (por si la demo necesita red).
- [ ] Resultados SUS listos (si se hicieron).
- [ ] Firma digital del director en el acta.
