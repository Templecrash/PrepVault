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
    const matchType = clean(properties.housenumber, 30) && clean(properties.street) ? 'address'
      : properties.type === 'street' || properties.osm_key === 'highway' ? 'street'
        : ['locality', 'district', 'city', 'county', 'state', 'country'].includes(properties.type) || properties.osm_key === 'place' && ['city', 'town', 'village', 'hamlet', 'suburb', 'county', 'state', 'country'].includes(properties.osm_value) ? 'area' : 'place';
    const matchLabel = { address: 'Mapped address', street: 'Road — choose exact point', area: 'Area — choose exact point', place: 'Mapped place' }[matchType];
    results.push({ id, name: name.slice(0, 150), label, detail, latitude, longitude, matchType, matchLabel });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

const CANADIAN_REGIONS = new Map([
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'],
  ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
].flatMap(([code, name]) => [[code.toLowerCase(), name], [name.toLowerCase(), name]]));
CANADIAN_REGIONS.set('québec', 'Quebec');
const canonicalRegion = value => CANADIAN_REGIONS.get(clean(value).toLocaleLowerCase('en')) || '';
const canonicalLocality = value => clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').replace(/^(?:city|town|township|county|municipality|district municipality) of /, '').replace(/[.'’]/g, '');
const canonicalPostcode = value => clean(value, 20).replace(/\s+/g, '').toUpperCase();
const STREET_TERMS = /\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|trail|crescent|cres|court|ct|boulevard|blvd|highway|hwy|way|concession|terrace)\b/i;
const STREET_ALIASES = { st: 'street', rd: 'road', ave: 'avenue', dr: 'drive', ln: 'lane', cres: 'crescent', ct: 'court', blvd: 'boulevard', hwy: 'highway', n: 'north', s: 'south', e: 'east', w: 'west' };
const canonicalStreet = value => clean(value).toLocaleLowerCase('en').normalize('NFD').replace(/\p{M}/gu, '').replace(/[.'’]/g, '').replace(/\s+/g, ' ').split(' ').map(word => STREET_ALIASES[word] || word).join(' ');

// Only parse explicit comma-separated Canadian street addresses. Do not guess
// a user's country from a saved home or strip meaningful words from a query.
export function parseCanadianMapAddress(query) {
  const parts = query.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  if (/^canada$/i.test(parts.at(-1))) parts.pop();
  let postcode = '';
  if (/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(parts.at(-1))) postcode = canonicalPostcode(parts.pop());
  const inlinePostcode = /\s+([A-Z]\d[A-Z] ?\d[A-Z]\d)$/i.exec(parts.at(-1));
  if (inlinePostcode) postcode = canonicalPostcode(inlinePostcode[1]);
  const last = parts.at(-1)?.replace(/\s+[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, '').trim();
  const state = canonicalRegion(last);
  const address = /^(\d{1,6}[A-Za-z]?)\s+(.+)$/.exec(parts[0]);
  if (!state || !address || !STREET_TERMS.test(address[2]) || parts.length < 3) return null;
  return { housenumber: address[1], street: address[2], locality: parts.slice(1, -1).join(', '), postcode, state, countrycode: 'CA' };
}
function addressFeatureMatches(feature, address, requireNumber = false) {
  const p = feature?.properties;
  if (!p || canonicalRegion(p.state) !== address.state || (clean(p.countrycode).toUpperCase() !== 'CA' && clean(p.country).toLowerCase() !== 'canada')) return false;
  const postcode = canonicalPostcode(p.postcode);
  if (address.postcode && postcode && postcode !== address.postcode) return false;
  const localityMatches = [p.city, p.district, p.county, p.locality].some(value => canonicalLocality(value) === canonicalLocality(address.locality));
  const postcodeMatches = address.postcode && postcode === address.postcode;
  if (!localityMatches && !postcodeMatches) return false;
  const street = clean(p.street) || (p.type === 'street' || p.osm_key === 'highway' ? clean(p.name) : '');
  if (canonicalStreet(street) !== canonicalStreet(address.street)) return false;
  const number = clean(p.housenumber, 30);
  if (number && number.toLowerCase() !== address.housenumber.toLowerCase()) return false;
  return !requireNumber || number.toLowerCase() === address.housenumber.toLowerCase();
}
async function pause(ms, signal) {
  if (signal.aborted) throw signal.reason;
  if (ms <= 0) return;
  await new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

// Photon allows reasonable project usage. One explicit search normally makes
// one request; a parsed rural Canadian address may make one spaced retry on the
// same provider. Both calls share an eight-second deadline. Never autocomplete.
// https://github.com/komoot/photon/blob/master/docs/api-v1.md#structured-search
export async function searchMapPlaces(value, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const query = validateMapSearchQuery(value);
  const address = parseCanadianMapAddress(query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(8000, Math.max(1, timeoutMs)));
  const startedAt = Date.now();
  async function request(path, parameters) {
    const url = new URL(path, 'https://photon.komoot.io');
    url.search = new URLSearchParams({ ...parameters, limit: String(MAX_RESULTS), lang: 'en' }).toString();
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
    const data = JSON.parse(new TextDecoder().decode(bytes));
    normalizeMapSearchResults(data); // Validate the collection before matching.
    return data;
  }
  try {
    const data = await request('/api/', { q: query, ...(address ? { countrycode: 'CA' } : {}) });
    if (!address) return normalizeMapSearchResults(data);
    // Photon can return a town midpoint or the right number on a different
    // street. Do not offer those as matches to an explicit street address.
    const matched = data.features.filter(feature => addressFeatureMatches(feature, address));
    const primary = normalizeMapSearchResults({ features: matched });
    if (primary.some(result => result.matchType === 'address')) return primary;
    try {
      await pause(1100 - (Date.now() - startedAt), controller.signal);
      // Postal villages can differ from OSM municipality names. A full
      // matching postcode can establish locality in that case. Never accept
      // a province-wide number/street match without locality evidence.
      const fallback = await request('/structured', { housenumber: address.housenumber, street: address.street, state: address.state, countrycode: address.countrycode, ...(address.postcode ? { postcode: address.postcode } : {}) });
      const precise = fallback.features.filter(feature => addressFeatureMatches(feature, address, true));
      return normalizeMapSearchResults({ features: [...precise.slice(0, MAX_RESULTS), ...matched.slice(0, MAX_RESULTS)] });
    } catch (error) {
      // A usable road remains clearly marked approximate. If both attempts
      // produced no usable result, preserve an upstream failure as a failure.
      if (primary.length) return primary;
      throw error;
    }
  } finally { clearTimeout(timeout); }
}
