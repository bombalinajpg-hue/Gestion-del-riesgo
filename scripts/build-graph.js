/**
 * scripts/build-graph.js
 *
 * Paso 1 del pipeline del grafo: descarga la red vial de Santa Rosa de
 * Cabal desde OpenStreetMap vía Overpass API y arma la topología
 * (nodos, aristas, costos nominales por perfil). NO toca capas de
 * amenaza ni catastrales — eso lo hace `backend/scripts/enrich_graph.py`,
 * que opera con shapely en EPSG:9377 (CTM12) para joins espaciales
 * geométricamente correctos.
 *
 * Pipeline completo:
 *   1) node scripts/build-graph.js              ← este archivo
 *   2) python backend/scripts/enrich_graph.py   ← hazards + catastro
 *
 * Uso:
 *   node scripts/build-graph.js   (o `npm run build-graph`)
 *
 * Salida:
 *   data/graph.json         — grafo base (sin enriquecer)
 *   data/graph.meta.json    — conteos y metadata
 *
 * Este script corre cuando cambia la red vial de OSM. Después de
 * correrlo hay que correr enrich_graph.py para reaplicar Tobler,
 * obras lineales, predios en riesgo y hazards.
 *
 * Dependencias: ninguna externa — usa solo fetch nativo de Node 18+.
 */

/* eslint-disable */
const fs = require('fs');
const path = require('path');

// ─── Configuración ─────────────────────────────────────────────────────────

const AREA = {
  name: 'Santa Rosa de Cabal',
  // Bounding box aproximado del casco urbano + área aledaña
  // Si necesitas más margen, amplía estos valores.
  south: 4.855,
  west: -75.64,
  north: 4.892,
  east: -75.605,
};

// ─── VELOCIDADES ESTIMADAS POR VÍA Y PERFIL ────────────────────────────────
//
// IMPORTANTE: los tiempos de evacuación que calcula la app dependen
// directamente de estos valores. Si son optimistas, la app dice que el
// usuario llega antes del frente de la amenaza cuando en realidad no.
//
// Fuentes usadas para calibrar (orden de preferencia):
//   1. Fruin, J.J. (1971) "Pedestrian Planning and Design" — marcha normal
//      en acera urbana: ~1.34 m/s (se baja a 1.2-1.3 en Colombia por mezcla
//      de edades/cargas; se sube a 1.4+ en pánico según Still 2000).
//   2. ORS (OpenRouteService) defaults para `foot-walking` (5 km/h ≈ 1.39)
//      y `cycling-regular` (15 km/h ≈ 4.17) como sanity check.
//   3. Observación local: velocidades vehiculares sobre vías de Santa Rosa
//      de Cabal son conservadoras por pendientes (8% promedio) y firme
//      irregular — de ahí que `residential` sea 29 km/h y no 50 km/h.
//
// NO son valores derivados de aforos locales: si el proyecto obtiene datos
// (ej. conteos de SIMIT, GPS de buses), actualizar este bloque y
// re-correr `node scripts/build-graph.js` para regenerar `data/graph.json`.
//
// Todo en m/s para que los cálculos del algoritmo (distancia / velocidad)
// salgan directo en segundos sin conversión.
const SPEEDS = {
  'foot-walking': {
    footway: 1.2,       // 4.3 km/h — acera angosta, mixto edades
    path: 1.0,          // 3.6 km/h — sendero sin pavimentar
    pedestrian: 1.3,    // 4.7 km/h — calle peatonal
    residential: 1.3,   // 4.7 km/h — vereda + calle residencial
    tertiary: 1.3,
    secondary: 1.3,
    primary: 1.3,
    trunk: 1.3,
    service: 1.2,
    track: 1.0,
    default: 1.2,
  },
  'cycling-regular': {
    cycleway: 4.5,      // 16 km/h — ciclovía dedicada
    path: 3.5,          // 13 km/h — sendero compartido
    residential: 4.0,   // 14 km/h — calle residencial
    tertiary: 4.5,
    secondary: 5.0,     // 18 km/h
    primary: 5.5,       // 20 km/h
    service: 3.5,
    track: 3.0,
    default: 4.0,
  },
  'driving-car': {
    // Velocidades conservadoras: Santa Rosa de Cabal tiene pendientes
    // pronunciadas (cordillera Central) y el firme en muchas vías
    // secundarias/terciarias no permite sostener el límite legal.
    residential: 8.0,   // 29 km/h
    tertiary: 11.0,     // 40 km/h
    secondary: 13.0,    // 47 km/h
    primary: 16.0,      // 58 km/h
    trunk: 19.0,        // 68 km/h
    service: 5.5,       // 20 km/h
    track: 4.0,         // 14 km/h — destapado
    motorway: 25.0,     // 90 km/h
    default: 8.0,
  },
};

// Tipos de vía que NO admiten vehículo (pero sí peatón/bici)
const NO_CAR = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway']);
// Tipos que no son vías caminables en absoluto
const EXCLUDED = new Set(['motorway_link', 'construction', 'proposed']);

// Consulta Overpass — todas las "highway" dentro del bbox
const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way["highway"](${AREA.south},${AREA.west},${AREA.north},${AREA.east});
);
out body;
>;
out skel qt;
`;

// ─── Utilidades ─────────────────────────────────────────────────────────────

function haversineMeters(a, b) {
  const R = 6371000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function getSpeed(profile, highway) {
  const table = SPEEDS[profile];
  return table[highway] ?? table.default;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[build-graph] Descargando datos OSM de ${AREA.name}...`);
  // User-Agent explícito: Overpass cierra conexiones (406/429) cuando
  // detecta clientes "anónimos" sin UA propio — Node 24 no lo añade
  // por defecto al fetch nativo. Mandamos un identificador claro
  // siguiendo la guía de la wiki de OSM.
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'EvacuApp/1.0 (https://github.com/Bombalina-hue/rutas; contacto: direccion@ctglobal.com.co)',
      'Accept': 'application/json',
    },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });
  if (!response.ok) {
    throw new Error(`Overpass respondió ${response.status}`);
  }
  const data = await response.json();

  // Index de nodos OSM por id
  const osmNodes = new Map();
  for (const el of data.elements) {
    if (el.type === 'node') {
      osmNodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // Ways → aristas
  const ways = data.elements.filter((el) => el.type === 'way' && el.tags?.highway);
  console.log(`[build-graph] ${osmNodes.size} nodos OSM, ${ways.length} ways`);

  // Construir grafo: un nodo del GRAFO = un nodo OSM que aparece en alguna way
  // útil (dos o más ways lo usan → intersección, o extremo de way). Para
  // simplificar, tomamos TODOS los nodos de las ways — es un grafo más denso
  // pero perfectamente manejable (<10k nodos).
  const usedNodeIds = new Set();
  const edgesRaw = [];

  for (const way of ways) {
    const highway = way.tags.highway;
    if (EXCLUDED.has(highway)) continue;
    const oneway = way.tags.oneway === 'yes' || way.tags.oneway === '1';
    const noCar = NO_CAR.has(highway);

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const fromId = way.nodes[i];
      const toId = way.nodes[i + 1];
      const fromNode = osmNodes.get(fromId);
      const toNode = osmNodes.get(toId);
      if (!fromNode || !toNode) continue;
      usedNodeIds.add(fromId);
      usedNodeIds.add(toId);

      const length = haversineMeters(
        { lat: fromNode.lat, lon: fromNode.lon },
        { lat: toNode.lat, lon: toNode.lon }
      );

      const baseEdge = {
        from: fromId,
        to: toId,
        lengthMeters: length,
        highway,
        noCar,
      };
      edgesRaw.push(baseEdge);
      if (!oneway) {
        edgesRaw.push({ ...baseEdge, from: toId, to: fromId });
      }
    }
  }

  // ─── Formato final ──────────────────────────────────────────────────────
  const nodes = [];
  const osmIdToGraphId = new Map();
  let nextId = 0;
  for (const osmId of usedNodeIds) {
    const n = osmNodes.get(osmId);
    if (!n) continue;
    osmIdToGraphId.set(osmId, nextId);
    nodes.push({ id: nextId, lat: n.lat, lng: n.lon });
    nextId++;
  }

  const edges = edgesRaw
    .filter((e) => osmIdToGraphId.has(e.from) && osmIdToGraphId.has(e.to))
    .map((e) => {
      const fromId = osmIdToGraphId.get(e.from);
      const toId = osmIdToGraphId.get(e.to);
      const lengthMeters = e.lengthMeters;
      const carSpeed = e.noCar ? 0 : getSpeed('driving-car', e.highway);
      return {
        from: fromId,
        to: toId,
        lengthMeters: +lengthMeters.toFixed(2),
        highway: e.highway,
        costSeconds: {
          'foot-walking': +(lengthMeters / getSpeed('foot-walking', e.highway)).toFixed(2),
          'cycling-regular': +(lengthMeters / getSpeed('cycling-regular', e.highway)).toFixed(2),
          'driving-car': carSpeed === 0 ? Infinity : +(lengthMeters / carSpeed).toFixed(2),
        },
      };
    })
    // Si un perfil tiene Infinity, serializamos a null y lo reconvertimos
    // en runtime — JSON no soporta Infinity.
    .map((e) => ({
      ...e,
      costSeconds: {
        'foot-walking': e.costSeconds['foot-walking'],
        'cycling-regular': e.costSeconds['cycling-regular'],
        'driving-car': isFinite(e.costSeconds['driving-car'])
          ? e.costSeconds['driving-car']
          : null, // vía peatonal
      },
    }));

  // Bounding box real
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const n of nodes) {
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lng < minLng) minLng = n.lng;
    if (n.lng > maxLng) maxLng = n.lng;
  }

  const graph = {
    nodes,
    edges,
    bbox: { minLat, maxLat, minLng, maxLng },
    meta: {
      source: 'overpass',
      builtAt: new Date().toISOString(),
      area: AREA.name,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };

  const dataDir = path.join(__dirname, '..', 'data');
  const outPath = path.join(dataDir, 'graph.json');
  const flatBackupPath = path.join(dataDir, 'graph.flat.backup.json');
  const serialized = JSON.stringify(graph);
  fs.writeFileSync(outPath, serialized);
  // El backup "flat" se reescribe SIEMPRE al final de build-graph para
  // que represente el estado pre-enriquecimiento más reciente. Sin
  // esto, enrich_graph.py podría conservar un backup viejo de OSMs
  // anteriores y la idempotencia se rompe en sutiles formas.
  fs.writeFileSync(flatBackupPath, serialized);
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[build-graph] ✓ Grafo guardado en ${outPath} (${sizeKb} KB)`);
  console.log(`[build-graph] ✓ Backup flat → ${flatBackupPath}`);
  console.log(`[build-graph]   nodos: ${nodes.length}, aristas: ${edges.length}`);
  console.log(`[build-graph]   (sin enriquecer — corre ahora "npm run enrich-graph")`);

  const metaPath = path.join(dataDir, 'graph.meta.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ...graph.meta,
        sizeKb: +sizeKb,
        bbox: graph.bbox,
      },
      null,
      2
    )
  );
  console.log(`[build-graph] ✓ Metadata en ${metaPath}`);
}

main().catch((err) => {
  console.error('[build-graph] ERROR:', err);
  process.exit(1);
});
