/**
 * Servicio de clima — Open-Meteo.
 *
 * Open-Meteo es un servicio meteorológico GRATUITO, sin API key, sin límite
 * práctico de peticiones. Usa múltiples modelos (ECMWF, GFS, ICON...) y en
 * Colombia tiene ~11 km de resolución — suficiente para contexto operativo.
 *
 * ¿Por qué Open-Meteo y no IDEAM?
 *   - IDEAM no expone una API REST pública estable.
 *   - OpenWeatherMap requiere API key y tiene cuotas.
 *   - Open-Meteo es usado en producción por proyectos gubernamentales europeos
 *     y tiene cobertura mundial homogénea.
 *
 * Para ALGUNOS fines (alertas oficiales, pronóstico a 48h de avenida
 * torrencial), IDEAM sigue siendo la referencia — pero su API pública no
 * es ampliamente disponible hoy. Cuando lo esté, este servicio se puede
 * extender con un provider paralelo.
 *
 * Relevancia para el proyecto:
 *   - Lluvia actual y acumulada en la última hora → input operativo para
 *     decidir si emitir alerta de avenida torrencial.
 *   - Temperatura y humedad → contexto para hipotermia/golpe de calor
 *     en caso de evacuación prolongada.
 *   - Código de condición (WMO) → ícono y descripción legible.
 */

const SANTA_ROSA = { lat: 4.8686, lng: -75.6215 };

export interface CurrentWeather {
  temperatureC: number;
  humidityPct: number;
  precipitationMmLastHour: number;
  rainMmLastHour: number;
  weatherCode: number;
  weatherDescription: string;
  weatherIcon: string; // emoji
  windSpeedKmh: number;
  /** Nivel derivado de riesgo hidrometeorológico local */
  riskLevel: 'normal' | 'atento' | 'elevado' | 'critico';
  fetchedAt: string; // ISO
  /** Fuente textual para el disclaimer */
  source: string;
}

/** Decodificación WMO weather_code → emoji + descripción en español */
function describeWeatherCode(code: number): { icon: string; desc: string } {
  // https://open-meteo.com/en/docs — WMO codes
  if (code === 0) return { icon: '☀️', desc: 'Despejado' };
  if (code >= 1 && code <= 3) return { icon: '⛅', desc: 'Parcialmente nublado' };
  if (code === 45 || code === 48) return { icon: '🌫️', desc: 'Niebla' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', desc: 'Llovizna' };
  if (code >= 61 && code <= 63) return { icon: '🌧️', desc: 'Lluvia' };
  if (code >= 65 && code <= 67) return { icon: '🌧️', desc: 'Lluvia intensa' };
  if (code >= 71 && code <= 77) return { icon: '❄️', desc: 'Nieve' };
  if (code >= 80 && code <= 82) return { icon: '🌦️', desc: 'Chubascos' };
  if (code >= 95 && code <= 99) return { icon: '⛈️', desc: 'Tormenta eléctrica' };
  return { icon: '🌤️', desc: 'Condiciones variables' };
}

/**
 * Deriva un nivel de riesgo hidrometeorológico a partir de las
 * observaciones actuales. Umbrales basados en criterios operativos
 * de UNGRD para zonas andinas colombianas — ajustables.
 *
 *   - normal:  sin lluvia significativa
 *   - atento:  llovizna sostenida, suelo potencialmente saturado
 *   - elevado: lluvia moderada (>5mm/h) — atención preventiva
 *   - critico: lluvia intensa (>15mm/h) o tormenta — riesgo alto de
 *              avenida torrencial y movimiento en masa
 */
function deriveRiskLevel(
  rainMmLastHour: number,
  weatherCode: number
): CurrentWeather['riskLevel'] {
  const isThunder = weatherCode >= 95 && weatherCode <= 99;
  if (isThunder || rainMmLastHour >= 15) return 'critico';
  if (rainMmLastHour >= 5) return 'elevado';
  if (rainMmLastHour >= 1) return 'atento';
  return 'normal';
}

export async function fetchCurrentWeather(
  lat: number = SANTA_ROSA.lat,
  lng: number = SANTA_ROSA.lng
): Promise<CurrentWeather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m' +
    '&timezone=America%2FBogota';

  try {
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`);
    const data = await resp.json();

    const c = data.current ?? {};
    const code = Number(c.weather_code ?? 0);
    const rain = Number(c.rain ?? c.precipitation ?? 0);
    const desc = describeWeatherCode(code);

    return {
      temperatureC: Number(c.temperature_2m ?? 0),
      humidityPct: Number(c.relative_humidity_2m ?? 0),
      precipitationMmLastHour: Number(c.precipitation ?? 0),
      rainMmLastHour: rain,
      weatherCode: code,
      weatherDescription: desc.desc,
      weatherIcon: desc.icon,
      windSpeedKmh: Number(c.wind_speed_10m ?? 0),
      riskLevel: deriveRiskLevel(rain, code),
      fetchedAt: new Date().toISOString(),
      source: 'Open-Meteo · modelos ECMWF/GFS',
    };
  } catch (err) {
    console.warn('[weatherService] Error al consultar Open-Meteo:', err);
    return null;
  }
}

/**
 * Versión cacheada — si hay un dato reciente (<15 min), lo devuelve sin
 * reconsultar. Útil para que la UI no sature la API en cada render.
 */
let lastFetch: CurrentWeather | null = null;

export async function getCachedWeather(
  lat?: number,
  lng?: number,
  maxAgeMs: number = 15 * 60 * 1000
): Promise<CurrentWeather | null> {
  if (lastFetch) {
    const age = Date.now() - new Date(lastFetch.fetchedAt).getTime();
    if (age < maxAgeMs) return lastFetch;
  }
  const fresh = await fetchCurrentWeather(lat, lng);
  if (fresh) lastFetch = fresh;
  return fresh;
}
