import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOvernightPlaces, matchingOvernightStop, normalizeOvernightResult, OVERNIGHT_DISCLAIMER } from '../src/overnight-stops.js';

const stop = { day: 1, latitude: 43.7, longitude: -79.4 };
const place = changes => ({ id: 'osm:node:123', name: 'Cedar campground', type: 'Campsite', latitude: 43.701, longitude: -79.4, distanceKm: .12, sourceUrl: 'https://www.openstreetmap.org/node/123', ...changes });
const result = changes => ({ checkedAt: '2026-10-29T12:00:00Z', radiusKm: 5, source: 'OpenStreetMap', stops: [{ ...stop, status: 'found', places: [place()] }], ...changes });

test('overnight records normalize provenance and retain only bounded display fields', () => {
  const normalized = normalizeOvernightResult(result({ source: 'Verified safe', disclaimer: 'Guaranteed safe', sourceUrl: 'https://evil.example', radiusKm: 100, secret: 'unused', stops: [{ ...stop, status: 'guaranteed', places: [place({ name: ' Cedar\u0000 campground ', type: 'Campsite', access: 'customers', openingHours: 'May–October', seasonal: 'yes', reservation: 'required', fee: 'yes', drinkingWater: 'yes', toilets: 'yes', secret: 'remove', sourceUrl: 'javascript:evil()', website: 'https://camp.example/info' })] }] }));
  assert.equal(normalized.source, 'OpenStreetMap'); assert.equal(normalized.sourceUrl, 'https://www.openstreetmap.org/copyright');
  assert.equal(normalized.disclaimer, OVERNIGHT_DISCLAIMER); assert.equal(normalized.radiusKm, 5); assert.equal(normalized.secret, undefined);
  const row = normalized.stops[0], mapped = row.places[0];
  assert.equal(row.status, 'found'); assert.equal(mapped.name, 'Cedar  campground'); assert.equal(mapped.secret, undefined);
  assert.equal(mapped.sourceUrl, 'https://www.openstreetmap.org/node/123'); assert.equal(mapped.website, 'https://camp.example/info');
  for (const key of ['access', 'openingHours', 'seasonal', 'reservation', 'fee', 'drinkingWater', 'toilets']) assert.ok(mapped[key]);
});

test('hostile website schemes and embedded credentials never become saved links', () => {
  for (const website of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///etc/passwd', '//evil.example/path', 'https://user:secret@camp.example', 'not a url']) {
    const normalized = normalizeOvernightResult(result({ stops: [{ ...stop, places: [place({ website })] }] }));
    assert.equal(normalized.stops[0].places[0].website, undefined, website);
  }
  const normalized = normalizeOvernightResult(result({ stops: [{ ...stop, places: [place({ id: 'osm:relation:321', sourceUrl: 'https://evil.example' })] }] }));
  assert.equal(normalized.stops[0].places[0].sourceUrl, 'https://www.openstreetmap.org/relation/321');
});

test('malformed overnight responses are rejected before use or export', () => {
  for (const data of [null, {}, result({ checkedAt: 'bad' }), result({ stops: null }), result({ stops: Array(366).fill({ ...stop, places: [] }) }), result({ stops: [{ ...stop, places: [] }, { ...stop, places: [] }] })]) assert.throws(() => normalizeOvernightResult(data));
  for (const changes of [{ latitude: 86 }, { longitude: 181 }, { latitude: '43.7' }, { day: 0 }, { day: 366 }, { day: 1.5 }, { places: null }, { places: Array(4).fill(place()) }]) assert.throws(() => normalizeOvernightResult(result({ stops: [{ ...stop, places: [], ...changes }] })));
  for (const changes of [{ id: 'bad' }, { id: 'osm:node:123/../../evil' }, { name: '' }, { type: '' }, { latitude: null }, { distanceKm: -1 }, { distanceKm: 5.1 }, { distanceKm: '1' }]) assert.throws(() => normalizeOvernightResult(result({ stops: [{ ...stop, places: [place(changes)] }] })));
});

test('bounded records truncate optional text and derive empty status honestly', () => {
  const normalized = normalizeOvernightResult(result({ stops: [{ ...stop, status: 'found', places: [] }, { ...stop, day: 2, places: [place({ name: 'x'.repeat(1000), type: 't'.repeat(1000), openingHours: 'h'.repeat(1000) })] }] }));
  assert.equal(normalized.stops[0].status, 'none');
  const mapped = normalized.stops[1].places[0]; assert.equal(mapped.name.length, 150); assert.equal(mapped.type.length, 60); assert.equal(mapped.openingHours.length, 300);
});

test('overnight association requires both day and unchanged day-end coordinates', () => {
  const data = normalizeOvernightResult(result());
  assert.equal(matchingOvernightStop(data, stop), data.stops[0]);
  assert.equal(matchingOvernightStop(data, { ...stop, day: 2 }), undefined);
  assert.equal(matchingOvernightStop(data, { ...stop, latitude: stop.latitude + .001 }), undefined);
  assert.equal(matchingOvernightStop(data, { ...stop, longitude: stop.longitude + .001 }), undefined);
  assert.equal(matchingOvernightStop(null, stop), undefined);
});

test('overnight client sends only coordinates and day with private same-origin credentials', async () => {
  const controller = new AbortController(); let sent;
  const normalized = await fetchOvernightPlaces([{ ...stop, name: 'Private household', address: 'Not needed', userId: 'forged' }], { signal: controller.signal, fetchImpl: async (url, init) => { sent = { url, init }; return Response.json({ overnight: result() }); } });
  assert.equal(sent.url, '/api/routing'); assert.equal(sent.init.method, 'POST'); assert.equal(sent.init.credentials, 'same-origin'); assert.equal(sent.init.cache, 'no-store'); assert.equal(sent.init.redirect, 'error'); assert.equal(sent.init.signal, controller.signal);
  assert.deepEqual(JSON.parse(sent.init.body), { action: 'overnight', stops: [stop] });
  assert.equal(normalized.stops[0].places[0].name, 'Cedar campground');
});

test('overnight client rejects unrelated, partial, additional or duplicated day results', async () => {
  const changed = [
    [],
    [{ ...stop, day: 2, places: [] }],
    [{ ...stop, longitude: -79.5, places: [] }],
    [{ ...stop, places: [] }, { ...stop, day: 2, places: [] }],
    [{ ...stop, places: [] }, { ...stop, places: [] }],
  ];
  for (const stops of changed) await assert.rejects(fetchOvernightPlaces([stop], { fetchImpl: async () => Response.json({ overnight: result({ stops }) }) }));
});

test('overnight client preserves cancellation and actionable authentication or quota errors', async () => {
  for (const status of [401, 403, 429, 503]) await assert.rejects(fetchOvernightPlaces([stop], { fetchImpl: async () => Response.json({ error: 'Try later' }, { status }) }), error => error.status === status && error.message === 'Try later');
  const cancelled = new DOMException('Cancelled', 'AbortError');
  await assert.rejects(fetchOvernightPlaces([stop], { fetchImpl: async () => { throw cancelled; } }), error => error === cancelled);
  await assert.rejects(fetchOvernightPlaces([stop], { fetchImpl: async () => new Response('<html>Gateway error</html>', { status: 503 }) }), /Your route is still available/);
});
