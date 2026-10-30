import { readLocation } from './location.js';
import { normalizeStreamUrl } from './radio.js';

export const RADIO_LOCATION_KEY = 'prepvault-radio-location';
export function normalizeRadioLocation(value) {
  if (!value || typeof value !== 'object' || !/^[A-Z]{2}$/.test(value.countryCode) || typeof value.country !== 'string' || !value.country.trim() || value.country.length > 100 || typeof value.state !== 'string' || value.state.length > 100) throw new Error('Choose a country and an optional state or province.');
  return { countryCode: value.countryCode, country: value.country.trim(), state: value.state.trim() };
}
export function readRadioLocation(storage) {
  try { return normalizeRadioLocation(JSON.parse(storage.getItem(RADIO_LOCATION_KEY))); } catch { const area = readLocation(storage); return area ? { countryCode: area.countryCode, country: area.country, state: area.region } : { countryCode: '', country: '', state: '' }; }
}
export function normalizeDirectoryStations(rows, location) {
  if (!Array.isArray(rows)) throw new Error('The station directory returned an invalid response.');
  const seen = new Set();
  return rows.slice(0, 250).flatMap(row => {
    if (!row || typeof row.stationuuid !== 'string' || !/^[\w-]{1,80}$/.test(row.stationuuid) || typeof row.name !== 'string' || !row.name.trim() || row.lastcheckok !== 1 || row.hls === 1 || !['MP3', 'AAC', 'AAC+'].includes(row.codec) || row.countrycode !== location.countryCode || (location.state && String(row.state || '').trim().toLowerCase() !== location.state.toLowerCase())) return [];
    let url;
    try { url = normalizeStreamUrl(row.url_resolved || row.url); } catch { return []; }
    // Browser-playable audio only; directory websites and playlist files are not streams.
    if (/\.(?:m3u8?|pls|asx)(?:[?#]|$)/i.test(url) || seen.has(url)) return [];
    const host = new URL(url).hostname;
    if (host === 'localhost' || !host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[') || /\.(?:local|internal|localhost)$/.test(host)) return [];
    seen.add(url);
    let source = '';
    try { source = normalizeStreamUrl(row.homepage); } catch { /* Optional public source. */ }
    return [{ id: `directory-${row.stationuuid}`, name: row.name.trim().slice(0, 160), url, source, type: 'broadcast', region: [row.state, location.country].filter(Boolean).join(', '), tags: typeof row.tags === 'string' ? row.tags.slice(0, 200) : '', checkedAt: typeof row.lastchecktime_iso8601 === 'string' ? row.lastchecktime_iso8601 : null }];
  });
}
export async function radioDirectoryRequest(action, location = {}, { signal, fetchImpl = fetch } = {}) {
  const query = new URLSearchParams({ action });
  for (const key of ['countryCode', 'country', 'state']) if (location[key]) query.set(key, location[key]);
  const response = await fetchImpl(`/api/radio/directory?${query}`, { credentials: 'omit', cache: 'no-store', signal, headers: { Accept: 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'The station directory is unavailable. Try again.');
  if (!Array.isArray(data?.entries)) throw new Error('The station directory returned an invalid response.');
  return data.entries;
}
