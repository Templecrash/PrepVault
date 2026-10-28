export const LOCATION_KEY = 'prepvault-location';
export const LOCATION_WATCHLIST_KEY = 'prepvault-location-watchlist';
export const MAX_WATCHED_LOCATIONS = 8;
export const LOCATION_EVENT = 'prepvault-location-change';
export function normalizeLocation(value) {
  if (!value || typeof value !== 'object' || !['name', 'country', 'countryCode'].every(key => typeof value[key] === 'string' && value[key].trim() && value[key].length <= 150) || !/^[A-Z]{2}$/.test(value.countryCode) || !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90 || !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180) throw new Error('Choose a valid location.');
  return { id: String(value.id || `${value.latitude},${value.longitude}`).slice(0, 80), name: value.name.trim(), region: typeof value.region === 'string' ? value.region.slice(0, 150) : '', country: value.country.trim(), countryCode: value.countryCode, latitude: value.latitude, longitude: value.longitude, timezone: typeof value.timezone === 'string' ? value.timezone.slice(0, 100) : '' };
}
export function readLocation(storage) { try { return normalizeLocation(JSON.parse(storage.getItem(LOCATION_KEY))); } catch { return null; } }
export function saveLocation(storage, value) {
  const next = normalizeLocation(value); storage.setItem(LOCATION_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCATION_EVENT));
  return next;
}
// Provider IDs can differ for the same town. Coordinates keep selection stable
// across search results without conflating different places with the same name.
export function locationWatchKey(value) {
  const point = normalizeLocation(value);
  return `${point.countryCode}:${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
}
export function normalizeLocationWatchlist(value) {
  if (!Array.isArray(value) || value.length > MAX_WATCHED_LOCATIONS) throw new Error(`Track up to ${MAX_WATCHED_LOCATIONS} cities.`);
  const points = value.map(normalizeLocation);
  const keys = points.map(locationWatchKey);
  if (new Set(keys).size !== keys.length) throw new Error('This city is already in your watchlist.');
  return points;
}
export function readLocationWatchlist(storage) {
  try {
    const raw = storage.getItem(LOCATION_WATCHLIST_KEY);
    if (raw === null) { const primary = readLocation(storage); return primary ? [primary] : []; }
    return normalizeLocationWatchlist(JSON.parse(raw));
  } catch { throw new Error('Your saved city watchlist could not be read. Restore a backup before changing it.'); }
}
export function saveLocationWatchlist(storage, value) {
  const next = normalizeLocationWatchlist(value);
  storage.setItem(LOCATION_WATCHLIST_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCATION_EVENT));
  return next;
}
async function request(query, { signal, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 12000);
  const checkCancelled = () => { if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  try {
    checkCancelled();
    const response = await fetchImpl(`/api/location?${new URLSearchParams(query)}`, { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
    checkCancelled();
    const data = await response.json();
    checkCancelled();
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error.slice(0, 500) : 'Local conditions could not be loaded.');
    return data;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('The local conditions request timed out. Try again.');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}
export async function searchLocations(query, options) {
  const data = await request({ action: 'search', q: query.trim() }, options);
  if (!Array.isArray(data.locations)) throw new Error('Location search returned an invalid response.');
  return data.locations.map(normalizeLocation);
}
export async function getLocalConditions(location, options) {
  const value = normalizeLocation(location);
  const data = await request({ action: 'conditions', lat: String(value.latitude), lng: String(value.longitude), countryCode: value.countryCode }, options);
  if (!data?.weather || !data?.alerts || !data.fetchedAt) throw new Error('Local conditions returned an invalid response.');
  return data;
}
export function weatherLabel(code) {
  if (code === 0) return 'Clear'; if ([1, 2, 3].includes(code)) return 'Cloudy'; if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'; if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'; if ([95, 96, 99].includes(code)) return 'Thunderstorms'; return 'Conditions unavailable';
}
export function locationConsiderations(data, items = []) {
  const result = [];
  const today = data?.weather?.today;
  if (data?.alerts?.entries?.length) result.push({ title: 'Review the official instructions', detail: 'Read the warnings for your selected area before travel or outdoor plans.', category: null });
  if (today?.low != null && today.low <= 0) result.push({ title: 'Prepare for freezing temperatures', detail: items.some(item => item.category === 'clothing' && Number(item.quantity) > 0) ? 'Review your recorded heating supplies and protect exposed water storage.' : 'No clothing supplies are recorded. Check your warm layers and backup heating plan.', category: 'clothing' });
  if (today?.high != null && today.high >= 30) result.push({ title: 'Review water and cooling', detail: 'High temperatures are forecast. Check drinking water, shade and the needs of your dependants.', category: 'water' });
  if (data?.weather?.hourly?.some(hour => hour.windGusts >= 50)) result.push({ title: 'Check your power plan', detail: 'Strong gusts are forecast. Secure loose outdoor items and review lights, charging and backup power.', category: 'power' });
  if ((today?.rain ?? 0) >= 10 || (today?.snow ?? 0) > 0) result.push({ title: 'Check travel and drainage', detail: 'Rain or snow is forecast. Review your route and the current official road conditions.', category: null });
  if (!result.length && data?.weather?.status === 'ready') result.push({ title: 'A good time to review the basics', detail: 'Check your water, food and emergency kit. Forecasts can change; refresh before making plans.', category: 'water' });
  return result.slice(0, 3);
}
