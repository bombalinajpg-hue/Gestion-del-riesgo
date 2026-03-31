import axios from 'axios';

const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjQwOTUyNDJiZjFhYzQzMzc5ZmE0MDMxMGU5NmRmNjY1IiwiaCI6Im11cm11cjY0In0=';

export type POIFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_tags?: { name?: string; amenity?: string; leisure?: string };
    category_ids?: Record<string, { category_name: string }>;
  };
};

const CATEGORY_IDS = [201, 207, 603, 602, 166];

const CATEGORY_ICONS: Record<number, { label: string; color: string }> = {
  201: { label: '🏥', color: '#e63946' },
  207: { label: '💊', color: '#2a9d8f' },
  602: { label: '🚒', color: '#e76f51' },
  603: { label: '👮', color: '#264653' },
  166: { label: '🌳', color: '#57cc99' },
};

export const getCategoryIcon = (feature: POIFeature): { label: string; color: string } => {
  if (feature.properties.category_ids) {
    for (const id of Object.keys(feature.properties.category_ids)) {
      const numId = parseInt(id);
      if (CATEGORY_ICONS[numId]) return CATEGORY_ICONS[numId];
    }
  }
  return { label: '📍', color: '#aaa' };
};

export const fetchPOIs = async (
  latitude: number,
  longitude: number
): Promise<POIFeature[]> => {
  try {
    const response = await axios.post(
      'https://api.openrouteservice.org/pois',
      {
        request: 'list',
        geometry: {
          geojson: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          buffer: 1500,
        },
        filters: {
          category_ids: CATEGORY_IDS,
        },
        limit: 50,
        sortby: 'distance',
      },
      {
        headers: {
          Authorization: ORS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json, application/geo+json',
        },
      }
    );
    return response.data.features ?? [];
  } catch (e: any) {
    console.warn('Error fetching POIs:', e.response?.data ?? e.message);
    return [];
  }
};