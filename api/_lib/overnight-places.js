import { haversineKm } from '../../src/offline-route.js';

export const MAX_OVERNIGHT_STOPS = 20;
export const OVERNIGHT_RADIUS_KM = 5;
const MAX_RESPONSE_BYTES = 1_500_000;
const MAX_PHOTON_RESULTS = 8;
const MAX_ELEMENTS = MAX_OVERNIGHT_STOPS * MAX_PHOTON_RESULTS;
const TYPES = {
  camp_site: 'Campsite', caravan_site: 'Campsite with tent pitches',
  alpine_hut: 'Mountain hut', wilderness_hut: 'Wilderness hut',
  hotel: 'Hotel', motel: 'Motel', hostel: 'Hostel', guest_house: 'Guest house',
};
const DISALLOWED_ACCESS = new Set(['no', 'private', 'permit', 'military']);
const DISCLAIMER = 'Map-listed options, not verified safe or open. Confirm access, opening dates, availability and local conditions with the operator. Distances are straight-line; walking detours are not included in your daily route.';
const clean = (value, limit = 150) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const coordinatesValid = (latitude, longitude) => Number.isFinite(latitude) && Math.abs(latitude) <= 85 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;

export class OvernightPlacesError extends Error {
  constructor(code) {
    const failures = {
      invalid_stops: [400, 'Choose one to twenty daily stops with valid coordinates.'],
      rate_limited: [429, 'The overnight-place service is busy. Try again later; your route is unchanged.'],
      timeout: [504, 'The overnight-place search took too long. Try again later; your route is unchanged.'],
      unavailable: [503, 'Overnight places could not be checked. Your route and day stops are still available.'],
      invalid_response: [502, 'The overnight-place service returned incomplete results. Try again later.'],
      response_too_large: [502, 'Too many overnight places were returned. Search fewer daily stops at a time.'],
    };
    const [status, message] = failures[code] || failures.unavailable;
    super(message);
    this.name = 'OvernightPlacesError'; this.code = code; this.status = status;
  }
}

export function validateOvernightStops(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_OVERNIGHT_STOPS) throw new OvernightPlacesError('invalid_stops');
  const days = new Set();
  return value.map(stop => {
    if (!stop || !Number.isInteger(stop.day) || stop.day < 1 || stop.day > 365 || days.has(stop.day) || !coordinatesValid(stop.latitude, stop.longitude)) throw new OvernightPlacesError('invalid_stops');
    days.add(stop.day);
    return { day: stop.day, latitude: stop.latitude, longitude: stop.longitude };
  });
}

// A category-filtered reverse search finds actual nearby places, not text guesses.
// https://github.com/komoot/photon/blob/master/docs/api-v1.md
export function buildOvernightSearchUrl(value) {
  const [stop] = validateOvernightStops([value]);
  const url = new URL('https://photon.komoot.io/reverse');
  url.search = new URLSearchParams({ lat: String(stop.latitude), lon: String(stop.longitude), radius: String(OVERNIGHT_RADIUS_KM), limit: String(MAX_PHOTON_RESULTS), lang: 'en' });
  for (const type of Object.keys(TYPES)) url.searchParams.append('osm_tag', `tourism:${type}`);
  return url.href;
}

function publicWebsite(value) {
  const text = clean(value, 1000);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.endsWith('.local')) return undefined;
    return url.href;
  } catch { return undefined; }
}

function normalizePlace(element) {
  if (!element || element.visible === false || !['node', 'way', 'relation'].includes(element.type) || !Number.isSafeInteger(element.id) || element.id <= 0 || !element.tags || typeof element.tags !== 'object' || Array.isArray(element.tags)) return null;
  const tags = element.tags;
  const type = TYPES[tags.tourism];
  if (!type) return null;
  const latitude = element.type === 'node' ? element.lat : element.center?.lat;
  const longitude = element.type === 'node' ? element.lon : element.center?.lon;
  if (!coordinatesValid(latitude, longitude)) return null;
  if ([tags.access, tags.foot].some(value => DISALLOWED_ACCESS.has(clean(value).toLowerCase()))) return null;
  if (tags.landuse === 'military' || clean(tags.military) && tags.military !== 'no') return null;
  if (['abandoned', 'disused', 'demolished', 'destroyed', 'closed'].some(key => clean(tags[key]).toLowerCase() === 'yes' || clean(tags[`${key}:tourism`])) || clean(tags.operational_status).toLowerCase() === 'closed' || ['off', 'closed'].includes(clean(tags.opening_hours).toLowerCase())) return null;
  // Caravan-only sites and tent-prohibited campsites are not overnight suggestions for walkers.
  if (tags.tourism === 'caravan_site' && tags.tents !== 'yes') return null;
  if (['camp_site', 'caravan_site'].includes(tags.tourism) && (tags.tents === 'no' || tags.camping === 'no' || tags.impromptu === 'yes')) return null;
  const fields = {
    website: publicWebsite(tags.website || tags['contact:website']),
    access: clean(tags.access, 80), openingHours: clean(tags.opening_hours, 300),
    seasonal: clean(tags.seasonal, 80), reservation: clean(tags.reservation, 80),
    fee: clean(tags.fee, 80), drinkingWater: clean(tags.drinking_water, 80), toilets: clean(tags.toilets, 80),
  };
  return {
    id: `osm:${element.type}:${element.id}`, name: clean(tags.name || tags['name:en']) || `Unnamed ${type.toLowerCase()}`,
    type, latitude, longitude, sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => Boolean(value))),
  };
}

export function normalizeOvernightPlaces(data, value) {
  const stops = validateOvernightStops(value);
  if (!data || !Array.isArray(data.elements) || typeof data.remark === 'string' && data.remark.trim()) throw new OvernightPlacesError('invalid_response');
  if (data.elements.length > MAX_ELEMENTS) throw new OvernightPlacesError('response_too_large');
  const places = [...new Map(data.elements.map(normalizePlace).filter(Boolean).map(place => [place.id, place])).values()];
  return stops.map(stop => {
    const nearby = places.map(place => ({ ...place, distanceKm: haversineKm([stop.longitude, stop.latitude], [place.longitude, place.latitude]) }))
      .filter(place => place.distanceKm <= OVERNIGHT_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
      .slice(0, 3);
    return { ...stop, status: nearby.length ? 'found' : 'none', places: nearby };
  });
}

async function readResponse(response) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) { await response.body?.cancel(); throw new OvernightPlacesError('response_too_large'); }
  if (!response.body) throw new OvernightPlacesError('invalid_response');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new OvernightPlacesError('response_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new OvernightPlacesError('invalid_response'); }
}

function pause(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const done = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timeout = setTimeout(done, milliseconds);
    const abort = () => { clearTimeout(timeout); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function photonElements(data) {
  if (!data || !Array.isArray(data.features) || data.features.length > MAX_PHOTON_RESULTS) throw new OvernightPlacesError('invalid_response');
  return data.features.flatMap(feature => {
    const p = feature?.properties; const coordinates = feature?.geometry?.coordinates;
    const type = { N: 'node', W: 'way', R: 'relation' }[p?.osm_type];
    if (!type || !Number.isSafeInteger(p.osm_id) || p.osm_id <= 0 || p.osm_key !== 'tourism' || !TYPES[p.osm_value] || feature.geometry?.type !== 'Point' || !Array.isArray(coordinates) || !coordinatesValid(coordinates[1], coordinates[0])) return [];
    return [{ type, id: p.osm_id, lat: coordinates[1], lon: coordinates[0], center: { lat: coordinates[1], lon: coordinates[0] } }];
  });
}

export async function searchOvernightPlaces(value, { fetchImpl = fetch, now = Date.now, timeoutMs = 55000, wait = pause } = {}) {
  const stops = validateOvernightStops(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(55000, Math.max(1, timeoutMs)));
  const headers = { Accept: 'application/json', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)' };
  let requestCount = 0;
  const request = async url => {
    if (requestCount++) await wait(1100, controller.signal);
    controller.signal.throwIfAborted();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal, headers });
    if (!response.ok) { await response.body?.cancel(); throw new OvernightPlacesError(response.status === 429 ? 'rate_limited' : 'unavailable'); }
    return readResponse(response);
  };
  try {
    const candidates = new Map(); const searched = new Set();
    for (const stop of stops) {
      const key = `${stop.latitude.toFixed(6)},${stop.longitude.toFixed(6)}`;
      if (searched.has(key)) continue;
      searched.add(key);
      for (const place of photonElements(await request(buildOvernightSearchUrl(stop)))) candidates.set(`${place.type}:${place.id}`, place);
    }
    // Fetch only the identified objects, in at most three small OSM batches.
    // Current tags prevent a stale geocoder entry from suggesting a closed or private site.
    // https://wiki.openstreetmap.org/wiki/API_v0.6#Multi_fetch
    const verified = [];
    for (const type of ['node', 'way', 'relation']) {
      const ids = [...candidates.values()].filter(place => place.type === type).map(place => place.id);
      if (!ids.length) continue;
      const url = new URL(`https://api.openstreetmap.org/api/0.6/${type}s.json`);
      url.searchParams.set(`${type}s`, ids.join(','));
      const data = await request(url.href);
      if (!data || !Array.isArray(data.elements) || data.elements.length > MAX_ELEMENTS) throw new OvernightPlacesError('invalid_response');
      for (const element of data.elements) {
        const candidate = candidates.get(`${element?.type}:${element?.id}`);
        if (!candidate || element.type !== type) continue;
        verified.push({ ...candidate, tags: element.tags, visible: element.visible, ...(type === 'node' ? { lat: element.lat, lon: element.lon } : {}) });
      }
    }
    const rows = normalizeOvernightPlaces({ elements: verified }, stops);
    return { checkedAt: new Date(now()).toISOString(), radiusKm: OVERNIGHT_RADIUS_KM, source: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/copyright', disclaimer: DISCLAIMER, stops: rows };
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError' || error.name === 'TimeoutError') throw new OvernightPlacesError('timeout');
    if (error instanceof OvernightPlacesError) throw error;
    throw new OvernightPlacesError('unavailable');
  } finally { clearTimeout(timeout); }
}
