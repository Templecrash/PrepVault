import test from 'node:test';
import assert from 'node:assert/strict';
import { avoidancePolygon, calculateRoute, getAvoidanceBudget, haversineKm, MAX_AVOIDANCE_BOUNDARY_KM, normalizeRoutePlansSetting, planTravelDays, readRoutePlans, routeToGpx, saveRoutePlans, validateRouteRequest, validateSavedRoute } from '../src/offline-route.js';

const points = [{ name: 'Start', latitude: 0, longitude: 0 }, { name: 'End', latitude: 0, longitude: 0.2 }];
const route = (changes = {}) => ({ points, mode: 'walk', walkingSpeed: 4, avoidAreas: [], distanceKm: 40, durationSeconds: 36_000, coordinates: [[0, 0], [.1, 0], [.2, 0]], instructions: [{ text: 'Continue east', distanceKm: 40, timeSeconds: 36_000 }], warnings: [], calculatedAt: '2026-10-28T12:00:00Z', ...changes });
const plan = changes => ({ id: 'p1', name: 'Cabin route', route: route(), travel: { hoursPerDay: 6, walkingSpeed: 4, drivingHours: 6, breakMinutes: 15 }, savedAt: '2026-10-28T12:00:00Z', ...changes });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} ≈ ${expected}`);

test('walking itinerary includes rest time and interpolates every day on saved geometry', () => {
  const result = planTravelDays(route(), { walkingSpeed: 4, hoursPerDay: 6, breakMinutes: 15 });
  assert.equal(result.totalHours, 12.5);
  assert.equal(result.days, 3);
  near(result.dailyDistanceKm, 19.2);
  near(result.stops[0].longitude, .096);
  near(result.stops[1].longitude, .192);
  assert.equal(result.stops[0].isDestination, false);
  assert.equal(result.stops.at(-1).isDestination, true);
  near(result.stops.at(-1).longitude, .2);
  assert.equal(result.stops.at(-1).distanceKm, 40);
});

test('driving pace uses provider movement time and its separate daily budget', () => {
  const result = planTravelDays(route({ mode: 'drive', distanceKm: 600, durationSeconds: 43_200 }), { hoursPerDay: 1, drivingHours: 6, breakMinutes: 0 });
  assert.equal(result.days, 2);
  assert.equal(result.dailyDistanceKm, 300);
  near(result.stops[0].longitude, .1);
  assert.equal(result.stops.at(-1).day, 2);
  assert.equal(result.stops.at(-1).isDestination, true);
});

test('an overnight stop near the date line stays near the route rather than Greenwich', () => {
  const result = planTravelDays(route({ points: [{ name: 'A', latitude: 0, longitude: 179 }, { name: 'B', latitude: 0, longitude: -179 }], coordinates: [[179, 0], [-179, 0]], distanceKm: 80 }), { hoursPerDay: 10, walkingSpeed: 4, breakMinutes: 0 });
  assert.equal(result.days, 2);
  near(Math.abs(result.stops[0].longitude), 180);
  near(result.stops.at(-1).longitude, -179);
});

test('travel budgets and incomplete saved routes fail validation instead of producing a misleading plan', () => {
  for (const travel of [{ hoursPerDay: 0 }, { walkingSpeed: 0 }, { drivingHours: 13 }, { breakMinutes: -1 }, { walkingSpeed: '4' }]) assert.throws(() => planTravelDays(route(), travel));
  for (const change of [{ distanceKm: 0 }, { durationSeconds: Infinity }, { coordinates: [[0, 0]] }, { coordinates: [[0, 0], [0, 0]] }, { instructions: [] }, { instructions: [{ text: ' ', distanceKm: 1, timeSeconds: 1 }] }, { calculatedAt: 'invalid' }]) assert.throws(() => validateSavedRoute(route(change)));
});

test('request validation retains ordered points and rejects out-of-range, overlapping and unbounded input', () => {
  const input = { points: [points[0], { name: 'Middle', latitude: .1, longitude: .1 }, points[1]], mode: 'avoid-highways', avoidAreas: [{ name: 'Town', latitude: .3, longitude: .3, radiusKm: 2 }] };
  assert.deepEqual(validateRouteRequest(input).points.map(point => point.name), ['Start', 'Middle', 'End']);
  assert.throws(() => validateRouteRequest({ ...input, mode: 'flight' }));
  assert.throws(() => validateRouteRequest({ ...input, points: [points[0]] }));
  assert.throws(() => validateRouteRequest({ ...input, points: Array(7).fill(points[0]) }));
  assert.throws(() => validateRouteRequest({ ...input, points: [{ ...points[0], latitude: 86 }, points[1]] }));
  assert.throws(() => validateRouteRequest({ ...input, points: [points[0], points[0]] }));
  assert.throws(() => validateRouteRequest({ ...input, avoidAreas: [{ ...points[0], radiusKm: 2 }] }), /inside/);
  assert.throws(() => validateRouteRequest({ ...input, avoidAreas: [{ ...input.avoidAreas[0], radiusKm: 26 }] }));
});

test('avoidance polygons close around the chosen center with kilometre-sized radii', () => {
  const polygon = avoidancePolygon({ latitude: 43.65, longitude: -79.38, radiusKm: 2 });
  assert.equal(polygon.length, 25);
  near(polygon[0][0], polygon.at(-1)[0]); near(polygon[0][1], polygon.at(-1)[1]);
  assert.ok(polygon.every(point => Math.abs(haversineKm(point, [-79.38, 43.65]) - 2) < .02));
});

test('new calculations enforce one combined avoidance-boundary budget without changing the areas', () => {
  const area = radiusKm => ({ name: 'Town', latitude: .3, longitude: .3, radiusKm });
  for (const areas of [[area(1.5)], [area(.5), area(.5), area(.5)], Array.from({ length: 4 }, () => area(.3))]) {
    const input = { points, mode: 'drive', avoidAreas: areas };
    assert.deepEqual(validateRouteRequest(input, { providerLimits: true }).avoidAreas, areas);
  }
  for (const areas of [[area(2)], [area(1), area(1)], Array.from({ length: 4 }, () => area(.5))]) {
    const input = { points, mode: 'drive', avoidAreas: areas };
    const before = structuredClone(input);
    assert.throws(() => validateRouteRequest(input, { providerLimits: true }), /9\.9 km combined.*Reduce the radii or remove an area/);
    assert.deepEqual(input, before);
  }
});

test('avoidance boundary budgeting conservatively covers polygon perimeter and offers only fitting new circles', () => {
  assert.equal(getAvoidanceBudget().nextRadiusKm, .5);
  assert.equal(getAvoidanceBudget([{ radiusKm: '0.5' }, { radiusKm: .5 }]).nextRadiusKm, .5);
  assert.equal(getAvoidanceBudget([{ radiusKm: 1.3 }]).nextRadiusKm, .2);
  assert.equal(getAvoidanceBudget([{ radiusKm: 1.5 }]).nextRadiusKm, null);
  assert.equal(getAvoidanceBudget([{ radiusKm: 2 }]).nextRadiusKm, null);
  for (const latitude of [0, 43.65, 80, -80]) {
    const area = { latitude, longitude: -60, radiusKm: 1.5 };
    const polygon = avoidancePolygon(area);
    const perimeter = polygon.slice(1).reduce((sum, point, index) => sum + haversineKm(polygon[index], point), 0);
    const budget = getAvoidanceBudget([area]);
    assert.ok(perimeter <= budget.boundaryKm);
    assert.ok(budget.boundaryKm < MAX_AVOIDANCE_BOUNDARY_KM);
  }
});

test('a provider limit never prevents reading or exporting previously saved larger avoidance areas', () => {
  const original = plan({ route: route({ avoidAreas: [{ name: 'Previously saved town', latitude: .3, longitude: .3, radiusKm: 2 }] }) });
  assert.equal(validateSavedRoute(original.route).avoidAreas[0].radiusKm, 2);
  const normalized = JSON.parse(normalizeRoutePlansSetting(JSON.stringify([original])));
  assert.deepEqual(normalized[0].route.avoidAreas, original.route.avoidAreas);
  assert.match(routeToGpx(normalized[0].route), /<gpx/);
});

test('saved plans round trip geometry, ordered stops, directions and travel settings', () => {
  const storage = new Map();
  const adapter = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  assert.deepEqual(readRoutePlans(adapter), []);
  const saved = saveRoutePlans(adapter, [plan()]);
  assert.deepEqual(readRoutePlans(adapter), saved);
  assert.deepEqual(saved[0].route.coordinates, route().coordinates);
  const before = [...storage];
  assert.throws(() => saveRoutePlans(adapter, [plan({ travel: { walkingSpeed: 0 } })]));
  assert.deepEqual([...storage], before);
  assert.throws(() => normalizeRoutePlansSetting(JSON.stringify([plan(), plan()])));
  assert.throws(() => readRoutePlans({ getItem: () => 'broken json' }));
  assert.throws(() => normalizeRoutePlansSetting(JSON.stringify([plan({ name: ' ' })])));
});

test('route downloads escape XML labels without altering coordinates', () => {
  const xml = routeToGpx(route({ points: [{ ...points[0], name: 'A < B & "C"' }, points[1]] }));
  assert.match(xml, /A &lt; B &amp; &quot;C&quot;/);
  assert.match(xml, /<trkpt lat="0" lon="0.2"\/>/);
  assert.doesNotMatch(xml, /A < B/);
});

test('routing client sends only validated inputs and preserves authentication failures', async () => {
  let sent;
  const result = await calculateRoute({ points, mode: 'walk', untrusted: 'discard' }, { fetchImpl: async (url, init) => { sent = { url, init }; return Response.json({ route: route() }); } });
  assert.equal(result.distanceKm, 40);
  assert.equal(sent.url, '/api/routing'); assert.equal(sent.init.credentials, 'same-origin');
  assert.equal(JSON.parse(sent.init.body).untrusted, undefined);
  await assert.rejects(calculateRoute({ points, mode: 'walk' }, { fetchImpl: async () => Response.json({ error: 'Sign in' }, { status: 401 }) }), error => error.status === 401 && /Sign in/.test(error.message));
});

test('routing client explains network and gateway failures and preserves intentional cancellation', async () => {
  await assert.rejects(calculateRoute({ points, mode: 'walk' }, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /Check your internet connection/);
  await assert.rejects(calculateRoute({ points, mode: 'walk' }, { fetchImpl: async () => new Response('<html>Gateway timeout</html>', { status: 504 }) }), error => error.status === 504 && /Try again shortly/.test(error.message));
  await assert.rejects(calculateRoute({ points, mode: 'walk' }, { fetchImpl: async () => new Response('<html>Sign in</html>', { status: 401 }) }), error => error.status === 401 && /Sign in/.test(error.message));
  const cancelled = new DOMException('Cancelled', 'AbortError');
  await assert.rejects(calculateRoute({ points, mode: 'walk' }, { fetchImpl: async () => { throw cancelled; } }), error => error === cancelled);
});

test('oversized avoidance areas explain the correction before making a routing request', async () => {
  let calls = 0;
  const input = { points, mode: 'drive', avoidAreas: [{ name: 'Town', latitude: .3, longitude: .3, radiusKm: 2 }] };
  await assert.rejects(calculateRoute(input, { fetchImpl: async () => { calls++; } }), /12\.6 km of boundary.*9\.9 km combined.*Reduce the radii or remove an area/);
  assert.equal(calls, 0);
  assert.equal(input.avoidAreas[0].radiusKm, 2);
});

test('travel plans over one year fail clearly instead of silently omitting the destination', () => {
  assert.throws(() => planTravelDays(route({ distanceKm: 2000 }), { hoursPerDay: 1, walkingSpeed: 1, breakMinutes: 0 }), /365.*Split the route/);
});

test('avoidance areas crossing the date line or polar bounds fail without altering user coordinates', () => {
  const input = { points, mode: 'drive' };
  for (const area of [{ name: 'Date line', latitude: 0, longitude: 179.99, radiusKm: 2 }, { name: 'Polar edge', latitude: 85, longitude: 0, radiusKm: 2 }]) {
    assert.throws(() => validateRouteRequest({ ...input, avoidAreas: [area] }), /map boundary/);
  }
});

test('cycling accepts its own pace, bounds request distance and preserves bike mode in saved plans', () => {
  const normalized = validateRouteRequest({ points, mode: 'bike', cyclingSpeed: 18 });
  assert.equal(normalized.mode, 'bike'); assert.equal(normalized.cyclingSpeed, 18);
  assert.equal(validateRouteRequest({ points, mode: 'bike' }).cyclingSpeed, 15);
  for (const cyclingSpeed of [0, 4, 36, Infinity, '15']) assert.throws(() => validateRouteRequest({ points, mode: 'bike', cyclingSpeed }), /cycling speed/);
  const distant = [{ name: 'Start', latitude: 0, longitude: 0 }, { name: 'End', latitude: 0, longitude: 4.4 }];
  assert.equal(validateRouteRequest({ points: distant, mode: 'bike' }).mode, 'bike');
  assert.throws(() => validateRouteRequest({ points: [{ ...distant[0] }, { ...distant[1], longitude: 4.6 }], mode: 'bike' }), /500 km cycling/);
  assert.throws(() => validateRouteRequest({ points: distant, mode: 'walk' }), /300 km walking/);
  const saved = JSON.parse(normalizeRoutePlansSetting(JSON.stringify([plan({ route: route({ mode: 'bike', cyclingSpeed: 18 }), travel: { cyclingHours: 4, cyclingSpeed: 18, breakMinutes: 10 } })])))[0];
  assert.equal(saved.route.mode, 'bike'); assert.equal(saved.route.cyclingSpeed, 18); assert.equal(saved.travel.cyclingHours, 4); assert.equal(saved.travel.cyclingSpeed, 18);
});

test('cycling day plans use mapped movement time and cycling budget, with pace changes explicit', () => {
  const bike = route({ mode: 'bike', cyclingSpeed: 15, distanceKm: 120, durationSeconds: 36_000 });
  const travel = { cyclingSpeed: 15, cyclingHours: 5, drivingHours: 12, hoursPerDay: 1, breakMinutes: 15 };
  const original = planTravelDays(bike, travel);
  assert.equal(original.movementHours, 10, 'use the mapped estimate, not distance divided by flat-road pace');
  assert.equal(original.totalHours, 12.5); assert.equal(original.days, 3); near(original.dailyDistanceKm, 48);
  assert.equal(original.stops.at(-1).isDestination, true); near(original.stops.at(-1).longitude, .2);
  const slower = planTravelDays(bike, { ...travel, cyclingSpeed: 10 });
  assert.equal(slower.movementHours, 15); assert.equal(slower.totalHours, 18.75); assert.equal(slower.days, 4);
  for (const change of [{ cyclingHours: 0 }, { cyclingHours: 13 }, { cyclingSpeed: 4 }, { cyclingSpeed: '15' }]) assert.throws(() => planTravelDays(bike, { ...travel, ...change }), /cycling/);
  const legacy = JSON.parse(normalizeRoutePlansSetting(JSON.stringify([plan()])))[0];
  assert.equal(legacy.travel.cyclingSpeed, 15); assert.equal(legacy.travel.cyclingHours, 6); assert.equal(planTravelDays(legacy.route, legacy.travel).totalHours, 12.5);
});

test('cycling client keeps the bicycle pace and validates the returned bicycle route', async () => {
  let body;
  const result = await calculateRoute({ points, mode: 'bike', cyclingSpeed: 12 }, { fetchImpl: async (_url, init) => { body = JSON.parse(init.body); return Response.json({ route: route({ mode: 'bike', cyclingSpeed: 12 }) }); } });
  assert.equal(body.mode, 'bike'); assert.equal(body.cyclingSpeed, 12); assert.equal(result.mode, 'bike'); assert.equal(result.cyclingSpeed, 12);
});

test('public walking and cycling distance caps apply to new calculations without blocking saved routes', async () => {
  const journey = [{ name: 'Start', latitude: 0, longitude: 0 }, { name: 'End', latitude: 0, longitude: 1.6 }];
  for (const [mode, limit, label] of [['walk', 100, 'walking'], ['bike', 150, 'cycling']]) {
    const input = { points: journey, mode };
    assert.equal(validateRouteRequest(input).mode, mode);
    assert.throws(() => validateRouteRequest(input, { providerLimits: true }), new RegExp(`${label} routes up to ${limit} km`));
    let calls = 0;
    await assert.rejects(calculateRoute(input, { fetchImpl: async () => { calls++; } }), /Split this journey into shorter sections/);
    assert.equal(calls, 0);
    const saved = route({ points: journey, coordinates: [[0, 0], [1.6, 0]], mode, distanceKm: 200 });
    assert.equal(validateSavedRoute(saved).mode, mode);
  }
  assert.equal(validateRouteRequest({ points: journey, mode: 'drive' }, { providerLimits: true }).mode, 'drive');
});
