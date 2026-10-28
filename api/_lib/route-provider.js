import { validateRouteRequest, avoidancePolygon, validateSavedRoute } from '../../src/offline-route.js';

export function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 800000) throw new Error('Invalid route geometry');
  let index = 0, lat = 0, lon = 0; const result = [];
  const read = () => {
    let shift = 0, sum = 0, byte;
    do { if (index >= encoded.length || shift > 30) throw new Error('Invalid route geometry'); byte = encoded.charCodeAt(index++) - 63; if (byte < 0 || byte > 63) throw new Error('Invalid route geometry'); sum |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    return sum & 1 ? ~(sum >> 1) : sum >> 1;
  };
  while (index < encoded.length) { lat += read(); lon += read(); result.push([lon / 1e6, lat / 1e6]); if (result.length > 100000) throw new Error('Route too large'); }
  return result;
}
export function buildProviderRouteRequest(value) {
  const request = validateRouteRequest(value); const walking = request.mode === 'walk';
  const costing = walking ? 'pedestrian' : 'auto';
  return { locations: request.points.map(p => ({ lat: p.latitude, lon: p.longitude, type: 'break' })), costing, units: 'kilometers', language: 'en-US',
    costing_options: { [costing]: walking ? { walking_speed: request.walkingSpeed } : request.mode === 'avoid-highways' ? { use_highways: 0, exclude_highways: true } : {} },
    ...(request.avoidAreas.length ? { exclude_polygons: request.avoidAreas.map(avoidancePolygon) } : {}),
  };
}
export async function requestProviderRoute(value, { fetchImpl = fetch, now = Date.now } = {}) {
  const request = validateRouteRequest(value);
  const response = await fetchImpl(`https://valhalla1.openstreetmap.de/route?${new URLSearchParams({ json: JSON.stringify(buildProviderRouteRequest(request)) })}`, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)', 'X-Client-Id': 'prepvault-xi.vercel.app' }, redirect: 'error', signal: AbortSignal.timeout(18000) });
  if (Number(response.headers.get('content-length')) > 5_000_000) throw new Error('This route is too large. Split it into smaller sections.');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 5_000_000) { await reader.cancel(); throw new Error('Route response too large.'); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!response.ok || data.trip?.status !== 0) throw new Error('No route was returned for these stops and preferences. Try shorter legs or smaller avoidance areas.');
  const trip = data.trip;
  if (!Array.isArray(trip.legs) || trip.legs.length !== request.points.length - 1) throw new Error('The route provider returned incomplete directions.');
  const coordinates = trip.legs.flatMap(leg => decodePolyline(leg.shape));
  const instructions = trip.legs.flatMap(leg => {
    if (!Array.isArray(leg.maneuvers)) throw new Error('The route provider omitted directions.');
    return leg.maneuvers.map(step => ({ text: step.instruction, distanceKm: step.length, timeSeconds: step.time }));
  });
  const warnings = ['Travel times exclude live traffic, disasters, road closures not in the map, weather delays and breaks.'];
  for (const warning of data.warnings || []) if (typeof warning.description === 'string') warnings.push(warning.description);
  if (request.mode === 'avoid-highways' && trip.summary?.has_highway) warnings.push('This route still includes a highway segment. Review it before using it.');
  if (request.avoidAreas.length) warnings.push('Selected circles are avoidance areas, not verified town boundaries. Check the route and local access.');
  return validateSavedRoute({ ...request, coordinates, instructions, warnings, distanceKm: trip.summary?.length, durationSeconds: trip.summary?.time, calculatedAt: new Date(now()).toISOString() });
}
