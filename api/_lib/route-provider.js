import { validateRouteRequest, avoidancePolygon, validateSavedRoute, haversineKm, PROVIDER_ROUTE_LIMIT_KM } from '../../src/offline-route.js';

const FAILURES = {
  avoidance_limit: [422, 'The selected avoidance areas are too large for the routing service. Reduce their radii or remove an area, then calculate again.'],
  walking_sections: [422, 'A walking section could not be connected to the next one. Add a nearby town, path entrance or crossing as a stop and try again. No complete walking route was saved.'],
  walking_corridor_limit: [422, 'This walking journey needs too many routing sections. Add a closer destination and save the journey in separate plans.'],
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
  const request = validateRouteRequest(value, { providerLimits: true }); const walking = request.mode === 'walk'; const cycling = request.mode === 'bike';
  const costing = walking ? 'pedestrian' : cycling ? 'bicycle' : 'auto';
  return { locations: request.points.map(p => ({ lat: p.latitude, lon: p.longitude, type: 'break' })), costing, units: 'kilometers', language: 'en-US',
    costing_options: { [costing]: walking ? { walking_speed: request.walkingSpeed } : cycling ? { bicycle_type: 'hybrid', cycling_speed: request.cyclingSpeed } : request.mode === 'avoid-highways' ? { use_highways: 0, exclude_highways: true } : {} },
    ...(request.avoidAreas.length ? { exclude_polygons: request.avoidAreas.map(avoidancePolygon) } : {}),
  };
}
const MAX_WALKING_SECTIONS = 16;
const WALKING_SECTION_KM = 40;
// Polyline6 precision is ~0.1 m. Permit rounding at a shared routing point,
// never bridge an uncalculated road/path gap between pedestrian sections.
const JOINT_TOLERANCE_KM = 0.001;
const pointCoordinates = point => [point.longitude, point.latitude];
const directDistance = points => points.slice(1).reduce((sum, point, i) => sum + haversineKm(pointCoordinates(points[i]), pointCoordinates(point)), 0);

async function fetchSingleRoute(request, context) {
  const body = JSON.stringify(buildProviderRouteRequest(request));
  const signal = AbortSignal.any([context.signal, AbortSignal.timeout(18000)]);
  let data;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      signal.throwIfAborted();
      if (++context.requests > 24) throw new RouteProviderError('walking_corridor_limit');
      const response = await context.fetchImpl('https://valhalla1.openstreetmap.de/route', { method: 'POST', body, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)', 'X-Client-Id': 'prepvault-xi.vercel.app' }, redirect: 'error', signal });
      data = await readProviderResponse(response);
      if (!response.ok || data?.trip?.status !== 0) throw providerFailure(response, data);
      break;
    } catch (problem) {
      const error = signal.aborted || problem.name === 'TimeoutError' || problem.name === 'AbortError'
        ? new RouteProviderError('timeout') : problem instanceof RouteProviderError ? problem : new RouteProviderError('unavailable');
      if (attempt === 0 && error.code === 'unavailable') { await context.wait(1200); continue; }
      throw error;
    }
  }
  try {
    const trip = data.trip;
    if (!Array.isArray(trip.legs) || trip.legs.length !== request.points.length - 1) throw new Error('Incomplete legs');
    const legs = trip.legs.map(leg => {
      const coordinates = decodePolyline(leg.shape);
      if (coordinates.length < 2 || !Array.isArray(leg.maneuvers) || !leg.maneuvers.length) throw new Error('Incomplete directions');
      return { coordinates, instructions: leg.maneuvers.map(step => ({ text: step.instruction, distanceKm: step.length, timeSeconds: step.time })) };
    });
    const warnings = ['Travel times exclude live traffic, disasters, road closures not in the map, weather delays and breaks.'];
    for (const warning of data.warnings || []) {
      const message = warning.text ?? warning.description;
      if (typeof message === 'string') warnings.push(message);
    }
    if (request.mode === 'avoid-highways' && trip.summary?.has_highway) warnings.push('This route still includes a highway segment. Review it before using it.');
    if (request.mode === 'bike') warnings.push('Cycling uses a hybrid bicycle profile. Check surface, hills, access and your loaded-bike pace before travelling.');
    if (request.mode === 'walk' && trip.summary?.has_ferry) warnings.push('This walking route includes a ferry. Check its operating hours, fares and availability before relying on this crossing.');
    if (request.avoidAreas.length) warnings.push('Selected circles are avoidance areas, not verified town boundaries. Check the route and local access.');
    const route = validateSavedRoute({ ...request, coordinates: legs.flatMap(leg => leg.coordinates), instructions: legs.flatMap(leg => leg.instructions), warnings, distanceKm: trip.summary?.length, durationSeconds: trip.summary?.time, calculatedAt: new Date(context.now()).toISOString() });
    return { route, legs };
  } catch { throw new RouteProviderError('invalid_response'); }
}

function walkingSections(legs, points) {
  const sections = [];
  legs.forEach((leg, legIndex) => {
    let start = 0; let distance = 0;
    const path = leg.coordinates;
    for (let i = 1; i < path.length; i++) {
      distance += haversineKm(path[i - 1], path[i]);
      if (distance >= WALKING_SECTION_KM && i < path.length - 1) {
        sections.push({ from: start === 0 ? points[legIndex] : { name: 'Walking checkpoint', longitude: path[start][0], latitude: path[start][1] }, to: { name: 'Walking checkpoint', longitude: path[i][0], latitude: path[i][1] }, path: path.slice(start, i + 1) });
        start = i; distance = 0;
      }
    }
    sections.push({ from: start === 0 ? points[legIndex] : { name: 'Walking checkpoint', longitude: path[start][0], latitude: path[start][1] }, to: points[legIndex + 1], path: path.slice(start) });
  });
  if (sections.length > MAX_WALKING_SECTIONS) throw new RouteProviderError('walking_corridor_limit');
  return sections;
}

function splitSection(section) {
  const distances = section.path.slice(1).map((point, i) => haversineKm(section.path[i], point));
  const midpoint = distances.reduce((sum, distance) => sum + distance, 0) / 2;
  let sum = 0; let index = 0;
  while (index < distances.length - 1 && sum < midpoint) sum += distances[index++];
  if (index === 0 || index >= section.path.length - 1) throw new RouteProviderError('walking_sections');
  const coordinates = section.path[index];
  const point = { name: 'Walking checkpoint', longitude: coordinates[0], latitude: coordinates[1] };
  return [{ from: section.from, to: point, path: section.path.slice(0, index + 1) }, { from: point, to: section.to, path: section.path.slice(index) }];
}

async function requestWalkingSections(request, context) {
  // This corridor is used only to choose intermediate points on mapped roads.
  // Every metre returned to the user comes from subsequent pedestrian routes.
  // https://valhalla.github.io/valhalla/api/route/api-reference/#hard-exclusions-experimental
  if (context.requests) await context.wait(1100);
  const corridor = await fetchSingleRoute({ ...request, mode: 'avoid-highways' }, context);
  const sections = walkingSections(corridor.legs, request.points);
  const routes = [];
  while (sections.length) {
    if (routes.length + sections.length > MAX_WALKING_SECTIONS) throw new RouteProviderError('walking_corridor_limit');
    const section = sections.shift();
    const previousEnd = routes.at(-1)?.coordinates.at(-1);
    const origin = previousEnd ? { ...section.from, longitude: previousEnd[0], latitude: previousEnd[1] } : section.from;
    if (directDistance([origin, section.to]) > PROVIDER_ROUTE_LIMIT_KM.walk) {
      sections.unshift(...splitSection(section)); continue;
    }
    await context.wait(1100);
    let result;
    try {
      result = await fetchSingleRoute({ ...request, points: [origin, section.to] }, context);
    } catch (error) {
      if (error.code === 'route_too_long') { sections.unshift(...splitSection(section)); continue; }
      if (!(error instanceof RouteProviderError) || ['no_route', 'location_unreachable', 'invalid_response'].includes(error.code)) throw new RouteProviderError('walking_sections');
      throw error;
    }
    const route = result.route;
    if (previousEnd && haversineKm(previousEnd, route.coordinates[0]) > JOINT_TOLERANCE_KM) throw new RouteProviderError('walking_sections');
    // Reject checkpoints snapped to unrelated roads, islands or distant trails.
    if (haversineKm(pointCoordinates(section.to), route.coordinates.at(-1)) > 0.25) throw new RouteProviderError('walking_sections');
    if (!previousEnd && haversineKm(pointCoordinates(origin), route.coordinates[0]) > 0.25) throw new RouteProviderError('walking_sections');
    if (previousEnd) route.coordinates[0] = previousEnd;
    routes.push(route);
  }
  const warnings = [...new Set(routes.flatMap(route => route.warnings))];
  warnings.unshift(`Long walk calculated as ${routes.length} connected walking sections. Checkpoints follow a road-based corridor, so this may not be the shortest walking route.`);
  try {
    return validateSavedRoute({ ...request, coordinates: routes.flatMap((route, index) => index ? route.coordinates.slice(1) : route.coordinates), instructions: routes.flatMap(route => route.instructions), warnings, distanceKm: routes.reduce((sum, route) => sum + route.distanceKm, 0), durationSeconds: routes.reduce((sum, route) => sum + route.durationSeconds, 0), calculatedAt: new Date(context.now()).toISOString() });
  } catch { throw new RouteProviderError('response_too_large'); }
}

export async function requestProviderRoute(value, { fetchImpl = fetch, now = Date.now, wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) } = {}) {
  const request = validateRouteRequest(value);
  const context = { fetchImpl, now, wait, requests: 0, signal: AbortSignal.timeout(request.mode === 'walk' ? 70000 : 18000) };
  if (request.mode === 'walk' && directDistance(request.points) > PROVIDER_ROUTE_LIMIT_KM.walk) return requestWalkingSections(request, context);
  try { return (await fetchSingleRoute(request, context)).route; }
  catch (error) {
    // Some detours hit the provider's path limit even when endpoints are close.
    if (request.mode === 'walk' && error.code === 'route_too_long') return requestWalkingSections(request, context);
    throw error;
  }
}
