const MAX_RESPONSE_BYTES = 256_000;
const MAX_RESULTS = 8;

export function validateMapSearchQuery(value) {
  if (typeof value !== 'string' || value.length > 150 || /\p{Cc}/u.test(value)) {
    throw new Error('Enter an address or place name between 2 and 150 characters.');
  }
  const query = value.trim().replace(/\s+/g, ' ');
  if (query.length < 2) throw new Error('Enter an address or place name between 2 and 150 characters.');
  return query;
}

const clean = (value, limit = 150) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const unique = values => [...new Map(values.filter(Boolean).map(value => [value.toLocaleLowerCase('en'), value])).values()];

export function normalizeMapSearchResults(data) {
  if (!data || !Array.isArray(data.features) || data.features.length > 50) throw new Error('Invalid map search response.');
  const results = []; const seen = new Set();
  for (const feature of data.features) {
    const properties = feature?.properties; const coordinates = feature?.geometry?.coordinates;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties) || feature.geometry?.type !== 'Point' || !Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) continue;
    const street = [clean(properties.housenumber, 30), clean(properties.street)].filter(Boolean).join(' ');
    const locality = unique([clean(properties.city), clean(properties.district), clean(properties.county), clean(properties.state), clean(properties.postcode, 30), clean(properties.country)]);
    const name = clean(properties.name) || street || locality[0];
    if (!name) continue;
    const parts = unique([name, street, ...locality]);
    const label = parts.join(', ').slice(0, 150);
    const detail = parts.slice(1).join(', ').slice(0, 300);
    const osmType = /^[NWR]$/.test(properties.osm_type) ? properties.osm_type : '';
    const osmId = /^\d{1,20}$/.test(String(properties.osm_id ?? '')) ? String(properties.osm_id) : '';
    const id = osmType && osmId ? `photon:${osmType}:${osmId}` : `photon:${longitude},${latitude}:${name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({ id, name: name.slice(0, 150), label, detail, latitude, longitude });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

// Photon permits reasonable project usage of its public endpoint. The handler
// limits explicit owner searches and caches results; this is not autocomplete.
// https://github.com/komoot/photon#demo-server
export async function searchMapPlaces(value, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const query = validateMapSearchQuery(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(8000, Math.max(1, timeoutMs)));
  try {
    const url = new URL('https://photon.komoot.io/api/');
    url.search = new URLSearchParams({ q: query, limit: String(MAX_RESULTS), lang: 'en' }).toString();
    const response = await fetchImpl(url.toString(), {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)' },
    });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new Error('Map address search is unavailable.');
    }
    if (!response.body?.getReader) throw new Error('Invalid map search response.');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Map search response is too large.'); }
        chunks.push(chunk);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return normalizeMapSearchResults(JSON.parse(new TextDecoder().decode(bytes)));
  } finally { clearTimeout(timeout); }
}
