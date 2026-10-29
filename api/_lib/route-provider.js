import { validateRouteRequest, avoidancePolygon, validateSavedRoute } from '../../src/offline-route.js';

const FAILURES = {
  avoidance_limit: [422, 'The selected avoidance areas are too large for the routing service. Reduce their radii or remove an area, then calculate again.'],
  route_too_long: [422, 'This journey exceeds the routing service’s distance limit. Calculate it as shorter sections.'],
  location_unreachable: [422, 'A stop is not near a road or path usable in this travel mode. Choose a nearby street, trailhead or entrance and try again.'],
  no_route: [422, 'No connected route was found for these stops and preferences. Check the selected places, try a nearby road or entrance, or adjust your avoidance areas.'],
  rate_limited: [429, 'The routing service is busy. Wait a minute before trying again. Your saved routes remain available.'],
  timeout: [504, 'The routing service took too long to respond. Try again shortly. Your stops and saved routes are unchanged.'],
  unavailable: [503, 'The routing service is temporarily unavailable. Try again shortly. Your stops and saved routes are unchanged.'],
  invalid_response: [502, 'The routing service returned incomplete directions. Try calculating again; your saved routes are unchanged.'],
  response_too_large: [422, 'The returned route is too large. Split the journey into shorter sections.'],
};
export class RouteProviderError extends Error {
  constructor(code, { providerStatus, providerCode } = {}) {
    const [status, message] = FAILURES[code] || FAILURES.unavailable;
    super(message);
    this.name = 'RouteProviderError'; this.code = code; this.status = status;
    this.providerStatus = Number.isInteger(providerStatus) ? providerStatus : undefined;
    this.providerCode = Number.isInteger(providerCode) ? providerCode : undefined;
  }
}
function providerFailure(response, data) {
  const providerCode = data?.error_code;
  const code = response.status === 429 ? 'rate_limited'
    : response.status >= 500 ? 'unavailable'
      : providerCode === 167 ? 'avoidance_limit'
        : [154, 166].includes(providerCode) ? 'route_too_long'
          : providerCode === 171 ? 'location_unreachable'
            : [170, 441, 442].includes(providerCode) ? 'no_route' : 'invalid_response';
  return new RouteProviderError(code, { providerStatus: response.status, providerCode });
}
async function readProviderResponse(response) {
  const responseError = fallback => new RouteProviderError(response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'unavailable' : fallback, { providerStatus: response.status });
  if (Number(response.headers.get('content-length')) > 5_000_000) {
    await response.body?.cancel();
    throw responseError('response_too_large');
  }
  if (!response.body) throw responseError('invalid_response');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 5_000_000) { await reader.cancel(); throw responseError('response_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw responseError('invalid_response'); }
}

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
  const request = validateRouteRequest(value, { providerLimits: true }); const walking = request.mode === 'walk';
  const costing = walking ? 'pedestrian' : 'auto';
  return { locations: request.points.map(p => ({ lat: p.latitude, lon: p.longitude, type: 'break' })), costing, units: 'kilometers', language: 'en-US',
    costing_options: { [costing]: walking ? { walking_speed: request.walkingSpeed } : request.mode === 'avoid-highways' ? { use_highways: 0, exclude_highways: true } : {} },
    ...(request.avoidAreas.length ? { exclude_polygons: request.avoidAreas.map(avoidancePolygon) } : {}),
  };
}
export async function requestProviderRoute(value, { fetchImpl = fetch, now = Date.now, wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) } = {}) {
  const request = validateRouteRequest(value);
  const body = JSON.stringify(buildProviderRouteRequest(request));
  // Keep both attempts within the function's deadline. Never drop avoidance preferences on retry.
  const signal = AbortSignal.timeout(18000);
  let data;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      signal.throwIfAborted();
      const response = await fetchImpl('https://valhalla1.openstreetmap.de/route', { method: 'POST', body, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)', 'X-Client-Id': 'prepvault-xi.vercel.app' }, redirect: 'error', signal });
      data = await readProviderResponse(response);
      if (!response.ok || data?.trip?.status !== 0) throw providerFailure(response, data);
      break;
    } catch (problem) {
      const error = signal.aborted || problem.name === 'TimeoutError' || problem.name === 'AbortError'
        ? new RouteProviderError('timeout') : problem instanceof RouteProviderError ? problem : new RouteProviderError('unavailable');
      if (attempt === 0 && error.code === 'unavailable') { await wait(1200); continue; }
      throw error;
    }
  }
  try {
  const trip = data.trip;
  if (!Array.isArray(trip.legs) || trip.legs.length !== request.points.length - 1) throw new Error('The route provider returned incomplete directions.');
  const coordinates = trip.legs.flatMap(leg => decodePolyline(leg.shape));
  const instructions = trip.legs.flatMap(leg => {
    if (!Array.isArray(leg.maneuvers)) throw new Error('The route provider omitted directions.');
    return leg.maneuvers.map(step => ({ text: step.instruction, distanceKm: step.length, timeSeconds: step.time }));
  });
  const warnings = ['Travel times exclude live traffic, disasters, road closures not in the map, weather delays and breaks.'];
  for (const warning of data.warnings || []) {
    const message = warning.text ?? warning.description;
    if (typeof message === 'string') warnings.push(message);
  }
  if (request.mode === 'avoid-highways' && trip.summary?.has_highway) warnings.push('This route still includes a highway segment. Review it before using it.');
  if (request.avoidAreas.length) warnings.push('Selected circles are avoidance areas, not verified town boundaries. Check the route and local access.');
  return validateSavedRoute({ ...request, coordinates, instructions, warnings, distanceKm: trip.summary?.length, durationSeconds: trip.summary?.time, calculatedAt: new Date(now()).toISOString() });
  } catch { throw new RouteProviderError('invalid_response'); }
}
