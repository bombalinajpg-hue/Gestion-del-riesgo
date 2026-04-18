/**
 * scripts/build-graph.js
 *
 * Construye el grafo vial de Santa Rosa de Cabal descargando los datos
 * de OpenStreetMap vía Overpass API, lo enriquece con las categorías de
 * amenaza de tus GeoJSON, y genera `data/graph.json` listo para bundling.
 *
 * Uso:
 *   node scripts/build-graph.js
 *
 * Salida:
 *   data/graph.json         — grafo listo para cargar en la app
 *   data/graph.meta.json    — conteos y estadísticas (para el informe)
 *
 * Este script corre UNA SOLA VEZ (o cuando cambie la red vial de OSM).
 * El resultado se commitea al repo y se incluye en el APK.
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

// Velocidades medias (m/s) por tipo de vía y perfil. Son estimaciones
// razonables para ciudad colombiana intermedia. Ajustables.
const SPEEDS = {
  'foot-walking': {
    footway: 1.2,
    path: 1.0,
    pedestrian: 1.3,
    residential: 1.3,
    tertiary: 1.3,
    secondary: 1.3,
    primary: 1.3,
    trunk: 1.3,
    service: 1.2,
    track: 1.0,
    default: 1.2,
  },
  'cycling-regular': {
    cycleway: 4.5,
    path: 3.5,
    residential: 4.0,
    tertiary: 4.5,
    secondary: 5.0,
    primary: 5.5,
    service: 3.5,
    track: 3.0,
    default: 4.0,
  },
  'driving-car': {
    residential: 8.0, // 29 km/h
    tertiary: 11.0, // 40 km/h
    secondary: 13.0, // 47 km/h
    primary: 16.0, // 58 km/h
    trunk: 19.0,
    service: 5.5,
    track: 4.0,
    motorway: 25.0,
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

function pointInPolygon(point, ring) {
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function pointInFeatureCollection(point, fc) {
  // Devuelve la categoría encontrada (si la feature trae `Categoria`) o null
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const cat = f.properties?.Categoria ?? f.properties?.categoria ?? null;
    if (f.geometry.type === 'Polygon') {
      if (pointInPolygon(point, f.geometry.coordinates[0])) return cat;
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates) {
        if (pointInPolygon(point, poly[0])) return cat;
      }
    }
  }
  return null;
}

function categoryRank(c) {
  if (c === 'Alta') return 3;
  if (c === 'Media') return 2;
  if (c === 'Baja') return 1;
  return 0;
}

function maxCategory(a, b) {
  return categoryRank(a) >= categoryRank(b) ? a : b;
}

function getSpeed(profile, highway) {
  const table = SPEEDS[profile];
  return table[highway] ?? table.default;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[build-graph] Descargando datos OSM de ${AREA.name}...`);
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
      // Mid-point para etiquetar amenaza
      const midLat = (fromNode.lat + toNode.lat) / 2;
      const midLon = (fromNode.lon + toNode.lon) / 2;

      const baseEdge = {
        from: fromId,
        to: toId,
        lengthMeters: length,
        highway,
        mid: { lat: midLat, lng: midLon },
        noCar,
      };
      edgesRaw.push(baseEdge);
      if (!oneway) {
        edgesRaw.push({ ...baseEdge, from: toId, to: fromId });
      }
    }
  }

  // ─── Enriquecer con amenaza ─────────────────────────────────────────────
  console.log('[build-graph] Cargando capas de amenaza...');
  const dataDir = path.join(__dirname, '..', 'data');

  const readFC = (file) => {
    const p = path.join(dataDir, file);
    if (!fs.existsSync(p)) {
      console.warn(`[build-graph]   WARN: ${file} no existe — se omitirá`);
      return { features: [] };
    }
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  };

  const inund = readFC('amenaza_inundacion.json');
  const mm = readFC('amenaza_movimiento_en_masa.json');
  const at = readFC('amenaza_avenida_torrencial.json');

  console.log('[build-graph] Etiquetando aristas con categoría de amenaza...');
  let tagged = 0;
  for (const edge of edgesRaw) {
    const hazard = {};
    const cInund = pointInFeatureCollection(edge.mid, inund);
    const cMM = pointInFeatureCollection(edge.mid, mm);
    const cAT = pointInFeatureCollection(edge.mid, at);
    if (cInund) hazard.inundacion = cInund;
    if (cMM) hazard.movimiento_en_masa = cMM;
    if (cAT) hazard.avenida_torrencial = cAT;
    if (Object.keys(hazard).length > 0) {
      edge.hazardByType = hazard;
      tagged++;
    }
  }
  console.log(`[build-graph]   ${tagged} aristas etiquetadas con al menos una amenaza`);

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
        ...(e.hazardByType ? { hazardByType: e.hazardByType } : {}),
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

  const outPath = path.join(dataDir, 'graph.json');
  fs.writeFileSync(outPath, JSON.stringify(graph));
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[build-graph] ✓ Grafo guardado en ${outPath} (${sizeKb} KB)`);
  console.log(`[build-graph]   nodos: ${nodes.length}, aristas: ${edges.length}`);

  const metaPath = path.join(dataDir, 'graph.meta.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ...graph.meta,
        sizeKb: +sizeKb,
        taggedEdges: tagged,
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
