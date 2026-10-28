import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderRouteRequest, decodePolyline, requestProviderRoute } from '../api/_lib/route-provider.js';

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
  const avoid = buildProviderRouteRequest({ ...input, mode: 'avoid-highways', avoidAreas: [{ name: 'Town', latitude: .3, longitude: .3, radiusKm: 2 }] });
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
  const result = await requestProviderRoute({ ...input, points: [input.points[0], { name: 'Middle', latitude: 0, longitude: .1 }, input.points[1]], mode: 'avoid-highways', avoidAreas: [{ name: 'Town', latitude: .3, longitude: .3, radiusKm: 2 }] }, { now: () => Date.parse('2026-10-28T12:00:00Z'), fetchImpl: async (url, options) => { sent = { url, options }; return Response.json(response({ legs: [leg([[0, 0], [.1, 0]]), leg([[.1, 0], [.2, 0]])], summary: { length: 50, time: 3000, has_highway: true } })); } });
  assert.equal(new URL(sent.url).hostname, 'valhalla1.openstreetmap.de'); assert.equal(sent.options.redirect, 'error');
  assert.equal(JSON.parse(new URL(sent.url).searchParams.get('json')).exclude_polygons.length, 1);
  assert.equal(result.coordinates.length, 4); assert.equal(result.instructions.length, 2); assert.equal(result.avoidAreas[0].name, 'Town');
  assert.ok(result.warnings.some(message => /still includes a highway/.test(message)));
  assert.equal(result.calculatedAt, '2026-10-28T12:00:00.000Z');
});

test('provider failures, incomplete legs, missing directions and corrupt geometry are not accepted', async () => {
  const failures = [new Response('not JSON', { status: 502 }), Response.json({ error: 'private provider detail' }, { status: 500 }), Response.json(response({ status: 442 })), Response.json(response({ legs: [] })), Response.json(response({ legs: [{ shape: leg().shape }] })), Response.json(response({ legs: [{ ...leg(), shape: '~' }] })), Response.json(response({ legs: [{ ...leg(), maneuvers: [] }] }))];
  for (const failure of failures) await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => failure }));
});

test('large provider bodies are bounded even when Content-Length is missing', async () => {
  const oversized = new Response(' '.repeat(5_000_001));
  await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => oversized }), /too large/i);
  await assert.rejects(requestProviderRoute(input, { fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': '5000001' } }) }), /too large/i);
});
