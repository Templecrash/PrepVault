import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderRouteRequest, decodePolyline, requestProviderRoute, RouteProviderError } from '../api/_lib/route-provider.js';

const input = { points: [{ name: 'A', latitude: 0, longitude: 0 }, { name: 'B', latitude: 0, longitude: .2 }], mode: 'drive' };
function encode(points) {
  let lat = 0, lon = 0, result = '';
  const write = value => { let shifted = value < 0 ? ~(value << 1) : value << 1; while (shifted >= 32) { result += String.fromCharCode((32 | (shifted & 31)) + 63); shifted >>= 5; } result += String.fromCharCode(shifted + 63); };
  for (const [lng, latitude] of points) { const nextLat = Math.round(latitude * 1e6), nextLon = Math.round(lng * 1e6); write(nextLat - lat); write(nextLon - lon); lat = nextLat; lon = nextLon; }
  return result;
}
const leg = (coordinates = [[0, 0], [.2, 0]]) => ({ shape: encode(coordinates), maneuvers: [{ instruction: 'Continue east', length: 25, time: 1500 }] });
const response = changes => ({ trip: { status: 0, summary: { length: 25, time: 1500 }, legs: [leg()], ...changes } });

test('provider request preserves route order, walking speed, highway avoidance and exclusion polygons', () => {
  const walk = buildProviderRouteRequest({ ...input, mode: 'walk', walkingSpeed: 3.5 });
  assert.equal(walk.costing, 'pedestrian'); assert.equal(walk.costing_options.pedestrian.walking_speed, 3.5);
  const avoid = buildProviderRouteRequest({ ...input, mode: 'avoid-highways', avoidAreas: [{ name: 'Town', latitude: .3, longitude: .3, radiusKm: .5 }] });
  assert.equal(avoid.costing_options.auto.exclude_highways, true); assert.equal(avoid.costing_options.auto.use_highways, 0);
  assert.equal(avoid.exclude_polygons.length, 1); assert.equal(avoid.exclude_polygons[0].length, 25);
  assert.deepEqual(avoid.locations.map(point => [point.lon, point.lat, point.type]), [[0, 0, 'break'], [.2, 0, 'break']]);
  assert.deepEqual(buildProviderRouteRequest(input).costing_options.auto, {});
});

test('polyline6 decoding preserves negative coordinates and rejects malformed encodings', () => {
  const coordinates = [[-79.38, 43.65], [-79.39, 43.66], [-79.37, 43.64]];
  assert.deepEqual(decodePolyline(encode(coordinates)), coordinates);
  for (const broken of ['~', 'abc', '\n', '~~~~~~~~~~~~~']) assert.throws(() => decodePolyline(broken));
});

test('provider result keeps all legs, directions and selected avoid areas in the saved route', async () => {
  let sent;
  const result = await requestProviderRoute({ ...input, points: [input.points[0], { name: 'Middle', latitude: 0, longitude: .1 }, input.points[1]], mode: 'avoid-highways', avoidAreas: [{ name: 'Town', latitude: .3, longitude: .3, radiusKm: .5 }] }, { now: () => Date.parse('2026-10-28T12:00:00Z'), fetchImpl: async (url, options) => { sent = { url, options }; return Response.json(response({ legs: [leg([[0, 0], [.1, 0]]), leg([[.1, 0], [.2, 0]])], summary: { length: 50, time: 3000, has_highway: true } })); } });
  assert.equal(new URL(sent.url).hostname, 'valhalla1.openstreetmap.de'); assert.equal(sent.options.redirect, 'error');
  assert.equal(new URL(sent.url).search, ''); assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(sent.options.body).exclude_polygons.length, 1);
  assert.equal(result.coordinates.length, 4); assert.equal(result.instructions.length, 2); assert.equal(result.avoidAreas[0].name, 'Town');
  assert.ok(result.warnings.some(message => /still includes a highway/.test(message)));
  assert.equal(result.calculatedAt, '2026-10-28T12:00:00.000Z');
});

test('provider failures, incomplete legs, missing directions and corrupt geometry are not accepted', async () => {
  const failures = [new Response('not JSON', { status: 502 }), Response.json({ error: 'private provider detail' }, { status: 500 }), Response.json(response({ status: 442 })), Response.json(response({ legs: [] })), Response.json(response({ legs: [{ shape: leg().shape }] })), Response.json(response({ legs: [{ ...leg(), shape: '~' }] })), Response.json(response({ legs: [{ ...leg(), maneuvers: [] }] }))];
  for (const failure of failures) await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => failure.clone(), wait: async () => {} }));
});

test('provider errors explain avoidance, distance, unreachable stops and unavailable paths without leaking details', async () => {
  for (const [providerCode, code] of [[167, 'avoidance_limit'], [154, 'route_too_long'], [166, 'route_too_long'], [171, 'location_unreachable'], [170, 'no_route'], [442, 'no_route']]) {
    let calls = 0;
    await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => { calls++; return Response.json({ error_code: providerCode, error: 'PRIVATE coordinates and upstream URL' }, { status: 400 }); } }), error => {
      assert.ok(error instanceof RouteProviderError); assert.equal(error.status, 422); assert.equal(error.code, code);
      assert.equal(error.providerCode, providerCode); assert.doesNotMatch(error.message, /PRIVATE|upstream URL/); return true;
    });
    assert.equal(calls, 1, 'invalid route preferences are not retried');
  }
});

test('temporary transport failures retry once with exactly the same stops and exclusions', async () => {
  for (const firstFailure of [() => { throw new TypeError('Private network detail'); }, () => new Response('unavailable', { status: 503 })]) {
    const requests = []; const delays = [];
    const result = await requestProviderRoute({ ...input, mode: 'avoid-highways', avoidAreas: [{ name: 'Town', latitude: .3, longitude: .3, radiusKm: .5 }] }, {
      wait: async ms => delays.push(ms), fetchImpl: async (url, options) => { requests.push({ url, options }); return requests.length === 1 ? firstFailure() : Response.json(response()); },
    });
    assert.equal(result.distanceKm, 25); assert.equal(requests.length, 2); assert.deepEqual(delays, [1200]);
    assert.equal(requests[0].options.body, requests[1].options.body); assert.equal(requests[0].options.signal, requests[1].options.signal);
    const sent = JSON.parse(requests[1].options.body); assert.equal(sent.exclude_polygons.length, 1); assert.equal(sent.costing_options.auto.exclude_highways, true);
  }
});

test('rate limits and timeouts are actionable without immediate retries, and outage retries are bounded', async () => {
  for (const [failure, code, status] of [
    [() => new Response('Too many requests', { status: 429 }), 'rate_limited', 429],
    [() => { throw new DOMException('Timed out', 'TimeoutError'); }, 'timeout', 504],
  ]) {
    let calls = 0;
    await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => { calls++; return failure(); } }), error => error.code === code && error.status === status);
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(requestProviderRoute(input, { wait: async () => {}, fetchImpl: async () => { calls++; throw new Error('PRIVATE'); } }), error => error.code === 'unavailable' && !error.message.includes('PRIVATE'));
  assert.equal(calls, 2);
});

test('provider warning text is retained so relaxed restrictions are visible', async () => {
  const result = await requestProviderRoute(input, { fetchImpl: async () => Response.json({ ...response(), warnings: [{ code: 401, text: 'Routing retried with relaxed restrictions' }] }) });
  assert.ok(result.warnings.includes('Routing retried with relaxed restrictions'));
});

test('empty and oversized provider error pages preserve rate limits and outage recovery', async () => {
  for (const body of [null, ' '.repeat(5_000_001)]) {
    let calls = 0;
    await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => { calls++; return new Response(body, { status: 429 }); } }), error => error.code === 'rate_limited');
    assert.equal(calls, 1);
    calls = 0;
    const result = await requestProviderRoute(input, { wait: async () => {}, fetchImpl: async () => ++calls === 1 ? new Response(body, { status: 503 }) : Response.json(response()) });
    assert.equal(result.distanceKm, 25); assert.equal(calls, 2);
  }
});

test('large provider bodies are bounded even when Content-Length is missing', async () => {
  const oversized = new Response(' '.repeat(5_000_001));
  await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => oversized }), /too large/i);
  await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': '5000001' } }) }), /too large/i);
});
