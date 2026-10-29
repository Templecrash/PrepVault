export const OVERNIGHT_DISCLAIMER = 'Map-listed options, not verified safe or open. Confirm access, opening dates, availability and local conditions with the operator. Distances are straight-line; walking detours are not included in your daily route.';
const validCoordinates = point => Number.isFinite(point?.latitude) && Math.abs(point.latitude) <= 85 && Number.isFinite(point?.longitude) && Math.abs(point.longitude) <= 180;
const text = (value, max = 150) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : '';
const website = value => {
  if (typeof value !== 'string' || value.length > 1000) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.hostname.includes('.') &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) && !url.hostname.endsWith('.local') ? url.href : undefined;
  } catch { return undefined; }
};

export function normalizeOvernightResult(value) {
  if (!value || !Number.isFinite(Date.parse(value.checkedAt)) || !Array.isArray(value.stops) || value.stops.length > 365) throw new Error('The saved overnight options could not be read.');
  const days = new Set();
  const stops = value.stops.map(stop => {
    if (!validCoordinates(stop) || !Number.isInteger(stop.day) || stop.day < 1 || stop.day > 365 || days.has(stop.day) || !Array.isArray(stop.places) || stop.places.length > 3) throw new Error('The overnight stop details could not be read.');
    days.add(stop.day);
    const places = stop.places.map(place => {
      if (!validCoordinates(place) || !/^osm:(node|way|relation):[1-9]\d{0,19}$/.test(place.id) || !text(place.name) || !text(place.type) || !Number.isFinite(place.distanceKm) || place.distanceKm < 0 || place.distanceKm > 5) throw new Error('An overnight place could not be read.');
      const [, kind, id] = place.id.split(':');
      const fields = {};
      for (const key of ['access', 'openingHours', 'seasonal', 'reservation', 'fee', 'drinkingWater', 'toilets']) if (text(place[key], 300)) fields[key] = text(place[key], 300);
      const link = website(place.website);
      return { id: place.id, name: text(place.name), type: text(place.type, 60), latitude: place.latitude, longitude: place.longitude, distanceKm: place.distanceKm, sourceUrl: `https://www.openstreetmap.org/${kind}/${id}`, ...(link ? { website: link } : {}), ...fields };
    });
    return { day: stop.day, latitude: stop.latitude, longitude: stop.longitude, status: places.length ? 'found' : 'none', places };
  });
  return { checkedAt: value.checkedAt, radiusKm: 5, source: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/copyright', disclaimer: OVERNIGHT_DISCLAIMER, stops };
}

export function matchingOvernightStop(result, stop) {
  return result?.stops?.find(row => row.day === stop.day && Math.abs(row.latitude - stop.latitude) < 0.000001 && Math.abs(row.longitude - stop.longitude) < 0.000001);
}

export async function fetchOvernightPlaces(stops, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl('/api/routing', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'overnight', stops: stops.map(({ day, latitude, longitude }) => ({ day, latitude, longitude })) }) });
  let data;
  try { data = await response.json(); } catch { throw new Error('Overnight options could not be checked. Your route is still available.'); }
  if (!response.ok) { const error = new Error(data.error || 'Overnight options could not be checked.'); error.status = response.status; throw error; }
  const result = normalizeOvernightResult(data.overnight);
  if (result.stops.length !== stops.length || stops.some(stop => !matchingOvernightStop(result, stop))) throw new Error('The overnight results did not match this journey. Try again.');
  return result;
}
