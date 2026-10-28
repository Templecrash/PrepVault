const text = (value, max = 12000) => typeof value === 'string' ? value.slice(0, max) : '';
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
export async function fetchPublicJson(url, fetchImpl = fetch) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || !['api.open-meteo.com', 'geocoding-api.open-meteo.com', 'api.weather.gc.ca', 'api.weather.gov'].includes(endpoint.hostname)) throw new Error('Unsupported provider');
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)' }, redirect: 'error', signal: AbortSignal.timeout(6500) });
  if (!response.ok || Number(response.headers.get('content-length')) > 4_000_000 || !response.body) { await response.body?.cancel(); throw new Error('Provider unavailable'); }
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 4_000_000) { await reader.cancel(); throw new Error('Provider response too large'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function normalizeForecast(data) {
  const localStamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) && Number.isFinite(Date.parse(value));
  if (!data?.current || !Number.isFinite(data.current.temperature_2m) || !localStamp(data.current.time) || !Array.isArray(data.hourly?.time) || !data.hourly.time.length || data.hourly.time.some(value => !localStamp(value)) || !Array.isArray(data.daily?.time) || !/^\d{4}-\d{2}-\d{2}$/.test(data.daily.time[0] || '') || !Array.isArray(data.hourly.temperature_2m) || data.hourly.temperature_2m.length !== data.hourly.time.length) throw new Error('Incomplete forecast');
  const c = data.current; const d = data.daily; const h = data.hourly;
  const daily = d.time.slice(0, 16).map((date, index) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Incomplete forecast');
    return { date, high: finite(d.temperature_2m_max?.[index]), low: finite(d.temperature_2m_min?.[index]), rain: finite(d.rain_sum?.[index]), snow: finite(d.snowfall_sum?.[index]), precipitationProbability: finite(d.precipitation_probability_max?.[index]), sunrise: text(d.sunrise?.[index]), sunset: text(d.sunset?.[index]), uvIndex: finite(d.uv_index_max?.[index]), weatherCode: finite(d.weather_code?.[index]), windGusts: finite(d.wind_gusts_10m_max?.[index]) };
  });
  return { status: 'ready', source: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/', timezone: text(data.timezone, 100),
    current: { time: c.time, temperature: c.temperature_2m, feelsLike: finite(c.apparent_temperature), humidity: finite(c.relative_humidity_2m), precipitation: finite(c.precipitation), weatherCode: finite(c.weather_code), windSpeed: finite(c.wind_speed_10m), windGusts: finite(c.wind_gusts_10m), windDirection: finite(c.wind_direction_10m) },
    today: daily[0], daily,
    hourly: h.time.slice(0, 48).map((time, i) => ({ time, temperature: finite(h.temperature_2m?.[i]), precipitation: finite(h.precipitation?.[i]), precipitationProbability: finite(h.precipitation_probability?.[i]), windSpeed: finite(h.wind_speed_10m?.[i]), windGusts: finite(h.wind_gusts_10m?.[i]), weatherCode: finite(h.weather_code?.[i]) })),
  };
}
export function normalizeGovernmentAlerts(data, countryCode, now = Date.now()) {
  if (!['CA', 'US'].includes(countryCode) || data?.type !== 'FeatureCollection' || !Array.isArray(data?.features) || data.features.length > 100 || data.links?.some(link => link.rel === 'next') || data.pagination?.next || (Number.isFinite(data.numberMatched) && data.numberMatched > data.features.length)) throw new Error('Incomplete alert response');
  const unique = new Map();
  for (const feature of data.features) {
    const p = feature?.properties; if (!p || typeof p !== 'object' || !['string', 'number'].includes(typeof feature.id) || !String(feature.id)) throw new Error('Invalid alert');
    let alert;
    if (countryCode === 'CA') {
      if (!p.alert_name_en || !p.alert_text_en || !stamp(p.expiration_datetime)) throw new Error('Invalid Canadian alert');
      if (Date.parse(p.expiration_datetime) <= now || /ended|cancel/i.test(p.status_en || '')) continue;
      alert = { id: text(String(feature.id), 250), event: text(p.alert_name_en, 200), headline: text(`${p.alert_name_en} · ${p.feature_name_en || 'Selected area'}`, 500), severity: text(p.risk_colour_en || p.alert_type, 100), description: text(p.alert_text_en), instruction: '', area: text(p.feature_name_en, 1000), onset: stamp(p.validity_datetime), expires: p.expiration_datetime, url: 'https://weather.gc.ca/' };
    } else {
      if (!p.event || !stamp(p.expires) || !['Actual', 'Exercise', 'System', 'Test', 'Draft'].includes(p.status)) throw new Error('Invalid US alert');
      if (Date.parse(p.expires) <= now || p.status !== 'Actual' || p.messageType === 'Cancel') continue;
      const id = text(String(feature.id), 500);
      alert = { id, event: text(p.event, 200), headline: text(p.headline || p.event, 500), severity: text(p.severity, 100), description: text(p.description), instruction: text(p.instruction), area: text(p.areaDesc, 1000), onset: stamp(p.onset || p.effective), expires: p.expires, url: id.startsWith('https://api.weather.gov/alerts/') ? id : 'https://www.weather.gov/' };
    }
    unique.set(`${alert.event}:${alert.description}:${alert.expires}`, alert);
  }
  return [...unique.values()];
}
export async function loadConditions({ latitude, longitude, countryCode }, { fetchImpl = fetch, now = Date.now } = {}) {
  const fetchedAt = new Date(now()).toISOString();
  const query = new URLSearchParams({ latitude, longitude, timezone: 'auto', forecast_days: '16', current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m', hourly: 'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code', daily: 'temperature_2m_max,temperature_2m_min,rain_sum,snowfall_sum,precipitation_probability_max,sunrise,sunset,uv_index_max,weather_code,wind_gusts_10m_max' });
  const weatherPromise = fetchPublicJson(`https://api.open-meteo.com/v1/forecast?${query}`, fetchImpl).then(normalizeForecast).catch(() => ({ status: 'unavailable', source: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/', error: 'The forecast could not be checked. Try again shortly.' }));
  const source = countryCode === 'CA' ? 'Environment and Climate Change Canada' : 'US National Weather Service';
  const sourceUrl = countryCode === 'CA' ? 'https://weather.gc.ca/' : 'https://www.weather.gov/';
  const alertsPromise = ['CA', 'US'].includes(countryCode) ? (async () => {
    const path = countryCode === 'CA' ? `https://api.weather.gc.ca/collections/weather-alerts/items?${new URLSearchParams({ f: 'json', limit: '100', filter: `INTERSECTS(geometry, POINT(${longitude} ${latitude}))` })}` : `https://api.weather.gov/alerts/active?point=${latitude},${longitude}`;
    try { return { status: 'ready', source, sourceUrl, checkedAt: fetchedAt, entries: normalizeGovernmentAlerts(await fetchPublicJson(path, fetchImpl), countryCode, now()) }; }
    catch { return { status: 'unavailable', source, sourceUrl, checkedAt: fetchedAt, entries: [], error: 'Official alerts could not be checked. This does not mean there are no warnings.' }; }
  })() : Promise.resolve({ status: 'unsupported', source: 'Official weather authority', sourceUrl: 'https://severeweather.wmo.int/', entries: [], checkedAt: fetchedAt, error: 'Automatic official warnings currently cover Canada and the United States. Check your local authority for this area.' });
  const [weather, alerts] = await Promise.all([weatherPromise, alertsPromise]);
  return { location: { latitude, longitude, countryCode }, fetchedAt, weather, alerts };
}
