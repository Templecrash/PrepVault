import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMapSearchResults, searchMapPlaces, validateMapSearchQuery } from '../api/_lib/map-geocoder.js';

const address = { type: 'Feature', geometry: { type: 'Point', coordinates: [-79.3839, 43.6534] }, properties: { osm_type: 'W', osm_id: 123, name: 'Toronto City Hall', housenumber: '100', street: 'Queen Street West', city: 'Toronto', state: 'Ontario', postcode: 'M5H 2N2', country: 'Canada' } };
const city = { type: 'Feature', geometry: { type: 'Point', coordinates: [-75.6972, 45.4215] }, properties: { osm_type: 'R', osm_id: 456, name: 'Ottawa', city: 'Ottawa', state: 'Ontario', country: 'Canada' } };
const payload = (features = [address, city]) => ({ type: 'FeatureCollection', features });

test('map search validates and normalizes a bounded address or city query before fetching', async () => {
  assert.equal(validateMapSearchQuery('  100  Queen Street West, Toronto  '), '100 Queen Street West, Toronto');
  let calls = 0;
  for (const input of [null, {}, 123, '', ' a ', 'x'.repeat(151), 'Toronto\u0000']) {
    await assert.rejects(searchMapPlaces(input, { fetchImpl: async () => { calls++; } }), /between 2 and 150/);
  }
  assert.equal(calls, 0);
});

test('Photon addresses and cities retain useful labels and coordinates without duplicate parts', () => {
  const [result, town] = normalizeMapSearchResults(payload());
  assert.deepEqual(result, { id: 'photon:W:123', name: 'Toronto City Hall', label: 'Toronto City Hall, 100 Queen Street West, Toronto, Ontario, M5H 2N2, Canada', detail: '100 Queen Street West, Toronto, Ontario, M5H 2N2, Canada', latitude: 43.6534, longitude: -79.3839 });
  assert.equal(town.label, 'Ottawa, Ontario, Canada');
  assert.equal(town.detail, 'Ontario, Canada');
  const unnamed = normalizeMapSearchResults(payload([{ ...address, properties: { ...address.properties, name: undefined } }]))[0];
  assert.equal(unnamed.name, '100 Queen Street West');
  assert.equal(unnamed.label, '100 Queen Street West, Toronto, Ontario, M5H 2N2, Canada');
});

test('invalid coordinates and labels are skipped; duplicates and output length are bounded', () => {
  const invalid = [null, {}, { ...address, geometry: { type: 'LineString', coordinates: [-79, 43] } }, { ...address, geometry: { type: 'Point', coordinates: [181, 43] } }, { ...address, geometry: { type: 'Point', coordinates: [-79, 86] } }, { ...address, geometry: { type: 'Point', coordinates: ['-79', 43] } }, { ...address, properties: {} }];
  assert.deepEqual(normalizeMapSearchResults(payload(invalid)), []);
  assert.equal(normalizeMapSearchResults(payload([address, address])).length, 1);
  const long = { ...address, properties: { ...address.properties, name: 'A'.repeat(151), street: 'B'.repeat(150), city: 'C'.repeat(150), state: 'D'.repeat(150) } };
  const result = normalizeMapSearchResults(payload([long]))[0];
  assert.equal(result.label.length, 150); assert.equal(result.name.length, 150); assert.equal(result.detail.length, 300);
  assert.equal(normalizeMapSearchResults(payload(Array.from({ length: 12 }, (_, index) => ({ ...address, properties: { ...address.properties, osm_id: index + 1 } })))).length, 8);
  assert.throws(() => normalizeMapSearchResults(payload(Array(51).fill(address))), /Invalid/);
});

test('provider uses a fixed identified HTTPS request, encoded query and abort signal', async () => {
  let sent;
  const results = await searchMapPlaces('100 Queen Street West & Toronto', { fetchImpl: async (url, options) => { sent = { url: new URL(url), options }; return Response.json(payload()); } });
  assert.equal(sent.url.origin, 'https://photon.komoot.io'); assert.equal(sent.url.pathname, '/api/');
  assert.equal(sent.url.searchParams.get('q'), '100 Queen Street West & Toronto'); assert.equal(sent.url.searchParams.get('limit'), '8'); assert.equal(sent.url.searchParams.get('lang'), 'en');
  assert.equal(sent.options.method, 'GET'); assert.equal(sent.options.redirect, 'error');
  assert.match(sent.options.headers['User-Agent'], /PrepVault.*prepvault-xi/);
  assert.ok(sent.options.signal instanceof AbortSignal); assert.equal(results.length, 2);
});

test('upstream errors, invalid JSON and malformed result collections reject', async () => {
  for (const response of [new Response('private upstream detail', { status: 429 }), new Response('not JSON'), Response.json({ results: [] }), Response.json({ features: 'invalid' })]) {
    await assert.rejects(searchMapPlaces('Toronto', { fetchImpl: async () => response }));
  }
  assert.deepEqual(await searchMapPlaces('No matching place', { fetchImpl: async () => Response.json(payload([])) }), []);
});

test('provider response is bounded with and without Content-Length', async () => {
  await assert.rejects(searchMapPlaces('Toronto', { fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': '256001' } }) }), /unavailable/);
  await assert.rejects(searchMapPlaces('Toronto', { fetchImpl: async () => new Response(' '.repeat(256001)) }), /too large/);
});

test('slow provider requests abort within the configured deadline', async () => {
  let signal;
  await assert.rejects(searchMapPlaces('Toronto', { timeoutMs: 10, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } }), { name: 'AbortError' });
  assert.equal(signal.aborted, true);
});
