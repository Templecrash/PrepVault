import test from 'node:test';
import assert from 'node:assert/strict';
import { avoidancePolygon, calculateRoute, haversineKm, normalizeRoutePlansSetting, planTravelDays, readRoutePlans, routeToGpx, saveRoutePlans, validateRouteRequest, validateSavedRoute } from '../src/offline-route.js';

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

test('travel plans over one year fail clearly instead of silently omitting the destination', () => {
  assert.throws(() => planTravelDays(route({ distanceKm: 2000 }), { hoursPerDay: 1, walkingSpeed: 1, breakMinutes: 0 }), /365.*Split the route/);
});

test('avoidance areas crossing the date line or polar bounds fail without altering user coordinates', () => {
  const input = { points, mode: 'drive' };
  for (const area of [{ name: 'Date line', latitude: 0, longitude: 179.99, radiusKm: 2 }, { name: 'Polar edge', latitude: 85, longitude: 0, radiusKm: 2 }]) {
    assert.throws(() => validateRouteRequest({ ...input, avoidAreas: [area] }), /map boundary/);
  }
});
