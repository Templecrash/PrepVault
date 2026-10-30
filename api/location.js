import { handlePublicFeedRequest, readFeedCoordinates } from './_lib/public-feed.js';
import { fetchPublicJson, loadConditions } from './_lib/local-conditions.js';
import { normalizeLocation } from '../src/location.js';

function normalizeSearchResult(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid place result');
  const countryCode = typeof row.country_code === 'string' ? row.country_code.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Invalid country code');
  if (row.country != null && typeof row.country !== 'string') throw new Error('Invalid country name');
  let country = row.country?.trim();
  if (!country) {
    // GeoNames omits the display name for some territories, including Bermuda.
    // A recognised region name is sufficient; never invent one from coordinates.
    country = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(countryCode);
    if (!country || country === countryCode || countryCode === 'ZZ') throw new Error('Unknown country');
  }
  return normalizeLocation({ id: row.id, name: row.name, region: row.admin1 || '', country, countryCode, latitude: row.latitude, longitude: row.longitude, timezone: row.timezone });
}

export function createLocationHandler({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async (req, res) => {
    if (handlePublicFeedRequest(req, res)) return;
    const query = req.query || Object.fromEntries(new URL(req.url, 'https://prepvault.invalid').searchParams);
    let value;
    try {
      if (query.action === 'search') {
        if (typeof query.q !== 'string' || query.q.trim().length < 2 || query.q.length > 100 || Object.keys(query).some(k => !['action', 'q'].includes(k))) throw new Error();
        value = query.q.trim();
      } else if (query.action === 'conditions') {
        if (typeof query.countryCode !== 'string' || !/^[A-Z]{2}$/.test(query.countryCode) || Object.keys(query).some(k => !['action', 'lat', 'lng', 'countryCode'].includes(k))) throw new Error();
        const coords = readFeedCoordinates(query, true); value = { latitude: coords.lat, longitude: coords.lng, countryCode: query.countryCode };
      } else throw new Error();
    } catch { return res.status(400).json({ error: 'Choose a location or enter a city name with at least two characters.' }); }
    const key = JSON.stringify([query.action, value]);
    for (const [k, entry] of cache) if (entry.expires <= now()) cache.delete(k);
    if (cache.has(key)) return res.status(200).json(cache.get(key).data);
    try {
      let data;
      if (query.action === 'search') {
        const found = await fetchPublicJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: value, count: '8', language: 'en', format: 'json' })}`, fetchImpl);
        if (!found || typeof found !== 'object' || Array.isArray(found) || (found.results !== undefined && !Array.isArray(found.results))) throw new Error();
        const rows = (found.results || []).slice(0, 8);
        const locations = rows.flatMap(row => {
          try { return [normalizeSearchResult(row)]; }
          catch { return []; } // One bad provider row must not hide valid cities.
        });
        if (rows.length && !locations.length) throw new Error('No usable location results');
        data = { locations };
      } else data = await loadConditions(value, { fetchImpl, now });
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + (query.action === 'search' ? 3600_000 : data.alerts.status === 'unavailable' || data.weather.status === 'unavailable' ? 30_000 : 300_000) });
      return res.status(200).json(data);
    } catch { return res.status(502).json({ error: 'Location search is unavailable. Try again shortly.' }); }
  };
}
export default createLocationHandler();
