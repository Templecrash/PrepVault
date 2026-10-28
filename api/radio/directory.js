import { handlePublicFeedRequest } from '../_lib/public-feed.js';
import { normalizeDirectoryStations, normalizeRadioLocation } from '../../src/radio-directory.js';

// Read-only public directory. Never accepts upstream hosts or forwards cookies.
const MIRRORS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info'];
async function readJson(response) {
  if (!response.ok || Number(response.headers.get('content-length')) > 2_000_000) throw new Error('Directory unavailable');
  const reader = response.body.getReader();
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error('Directory response too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(data)) throw new Error('Invalid directory response');
  return data;
}
export function createRadioDirectoryHandler({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async (req, res) => {
    if (handlePublicFeedRequest(req, res)) return;
    const query = req.query || Object.fromEntries(new URL(req.url, 'https://prepvault.invalid').searchParams);
    let path, location;
    try {
      if (Object.keys(query).some(key => !['action', 'countryCode', 'country', 'state'].includes(key))) throw new Error();
      if (query.action === 'countries') path = '/json/countries?hidebroken=true';
      else {
        location = normalizeRadioLocation({ ...query, state: query.state || '' });
        if (query.action === 'states') path = `/json/states/${encodeURIComponent(location.country)}/?hidebroken=true`;
        else if (query.action === 'stations') path = `/json/stations/search?${new URLSearchParams({ countrycode: location.countryCode, state: location.state, hidebroken: 'true', limit: '250', order: 'clickcount', reverse: 'true' })}`;
        else throw new Error();
      }
    } catch { return res.status(400).json({ error: 'Choose a valid location.', code: 'invalid_location' }); }
    const key = path; const cached = cache.get(key);
    if (cached && cached.expires > now()) return res.status(200).json(cached.data);
    for (const [savedKey, entry] of cache) if (entry.expires <= now()) cache.delete(savedKey);
    try {
      let rows;
      for (const host of MIRRORS) {
        try {
          rows = await readJson(await fetchImpl(`${host}${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)' }, redirect: 'error', signal: AbortSignal.timeout(3500) }));
          break;
        } catch { /* Try the next fixed directory mirror. */ }
      }
      if (!rows) throw new Error();
      const entries = query.action === 'countries' ? rows.filter(row => row && typeof row.name === 'string' && /^[A-Z]{2}$/.test(row.iso_3166_1)).map(row => ({ name: row.name.slice(0, 100), code: row.iso_3166_1 })).sort((a, b) => a.name.localeCompare(b.name))
        : query.action === 'states' ? [...new Set(rows.filter(row => row?.country === location.country && typeof row.name === 'string').map(row => row.name.trim()).filter(name => name && name.length <= 100))].sort().map(name => ({ name }))
        : normalizeDirectoryStations(rows, location);
      const data = { entries, source: 'Radio Browser', checkedAt: new Date(now()).toISOString() };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + 300_000 });
      return res.status(200).json(data);
    } catch { return res.status(502).json({ error: 'The station directory is unavailable. Try again or use a saved stream.', code: 'directory_unavailable' }); }
  };
}
export default createRadioDirectoryHandler();
