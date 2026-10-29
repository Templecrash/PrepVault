import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOvernightSearchUrl, normalizeOvernightPlaces, searchOvernightPlaces, validateOvernightStops } from '../api/_lib/overnight-places.js';

const stops = [{ day: 1, latitude: 44.1, longitude: -78.9 }, { day: 2, latitude: 44.3, longitude: -78.5 }];
const place = (id, tags = {}, location = {}) => ({ type: 'node', id, lat: 44.101, lon: -78.901, tags: { tourism: 'camp_site', name: 'Example campground', ...tags }, ...location });
const payload = (elements = [place(1)]) => ({ elements });
const photon = (elements = [place(1)]) => ({ features: elements.map(element => ({ type: 'Feature', geometry: { type: 'Point', coordinates: element.type === 'node' ? [element.lon, element.lat] : [element.center?.lon, element.center?.lat] }, properties: { osm_type: { node: 'N', way: 'W', relation: 'R' }[element.type], osm_id: element.id, osm_key: 'tourism', osm_value: element.tags?.tourism, name: element.tags?.name } })) });
const noWait = async () => {};

test('daily-stop requests validate before any external request and do not accept injected query content', async () => {
  let requests = 0;
  for (const value of [null, [], Array(21).fill(stops[0]), [{ ...stops[0], day: 0 }], [{ ...stops[0], day: 1.5 }], [stops[0], stops[0]], [{ ...stops[0], latitude: 90 }], [{ ...stops[0], longitude: '0);out;' }]]) {
    await assert.rejects(searchOvernightPlaces(value, { fetchImpl: () => { requests++; } }), { code: 'invalid_stops', status: 400 });
  }
  assert.equal(requests, 0);
  assert.deepEqual(validateOvernightStops([{ ...stops[0], name: ');out geom;' }]), [stops[0]]);
  assert.doesNotMatch(buildOvernightSearchUrl({ ...stops[0], name: ');out geom;' }), /out geom/);
});

test('nearby category queries are spaced, de-duplicated and enriched through one bounded OSM batch per type', async () => {
  const sent = []; const delays = [];
  const result = await searchOvernightPlaces([...stops, { ...stops[0], day: 3 }], { now: () => 0, wait: async delay => delays.push(delay), fetchImpl: async (url, options) => { sent.push({ url: new URL(url), options }); return Response.json(url.includes('/reverse') ? photon() : payload()); } });
  assert.equal(sent.length, 3); assert.deepEqual(delays, [1100, 1100]);
  assert.equal(sent[0].url.origin, 'https://photon.komoot.io'); assert.equal(sent[0].url.pathname, '/reverse');
  assert.equal(sent[0].url.searchParams.get('radius'), '5'); assert.equal(sent[0].url.searchParams.get('limit'), '8');
  assert.equal(sent[0].url.searchParams.get('lat'), String(stops[0].latitude)); assert.equal(sent[0].url.searchParams.get('lon'), String(stops[0].longitude));
  assert.ok(sent[0].url.searchParams.getAll('osm_tag').includes('tourism:camp_site'));
  assert.equal(sent[2].url.origin, 'https://api.openstreetmap.org'); assert.equal(sent[2].url.pathname, '/api/0.6/nodes.json');
  assert.equal(sent[2].url.searchParams.get('nodes'), '1');
  assert.equal(sent.every(row => row.options.method === 'GET' && row.options.redirect === 'error' && row.options.signal instanceof AbortSignal), true);
  assert.equal(result.checkedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(result.radiusKm, 5);
  assert.equal(result.stops.length, 3);
  assert.equal(result.stops[1].status, 'none');
  assert.match(result.disclaimer, /not verified safe or open/);
  assert.match(result.disclaimer, /straight-line/);
});

test('latest metadata overrides stale geocoder results, excludes private and deleted places, and preserves real way locations', async () => {
  const found = [place(1), place(2), place(3, { tourism: 'hotel' }, { type: 'way', center: { lat: 44.11, lon: -78.91 } })];
  const result = await searchOvernightPlaces([stops[0]], { wait: noWait, fetchImpl: async url => Response.json(url.includes('/reverse') ? photon(found) : payload(url.includes('/nodes') ? [place(1, { access: 'private' }), { ...place(2), visible: false }] : [place(3, { tourism: 'hotel', website: 'https://example.com' }, { type: 'way' })])) });
  assert.equal(result.stops[0].places.length, 1);
  assert.equal(result.stops[0].places[0].id, 'osm:way:3'); assert.equal(result.stops[0].places[0].latitude, 44.11);
  assert.equal(result.stops[0].places[0].website, 'https://example.com/');
});

test('empty searches skip metadata requests and failed metadata is never reported as a successful empty search', async () => {
  let calls = 0;
  const empty = await searchOvernightPlaces([stops[0]], { fetchImpl: async () => { calls++; return Response.json(photon([])); } });
  assert.equal(calls, 1); assert.equal(empty.stops[0].status, 'none');
  await assert.rejects(searchOvernightPlaces([stops[0]], { wait: noWait, fetchImpl: async url => url.includes('/reverse') ? Response.json(photon()) : new Response('unavailable', { status: 503 }) }), { code: 'unavailable' });
});

test('maps real campsites and lodging with distance, sourced metadata and stable safe links', () => {
  const [result] = normalizeOvernightPlaces(payload([
    place(1, { website: 'https://example.com/camp', access: 'customers', seasonal: 'summer', reservation: 'required', fee: 'yes', drinking_water: 'yes', toilets: 'no' }),
    place(2, { tourism: 'hotel', name: 'Example Inn', opening_hours: '24/7' }, { type: 'way', center: { lat: 44.102, lon: -78.902 } }),
    place(3, { tourism: 'wilderness_hut', name: 'Example Hut' }, { type: 'relation', center: { lat: 44.103, lon: -78.903 } }),
  ]), [stops[0]]);
  assert.equal(result.status, 'found'); assert.equal(result.places.length, 3);
  const camp = result.places[0];
  assert.equal(camp.id, 'osm:node:1'); assert.equal(camp.type, 'Campsite');
  assert.equal(camp.sourceUrl, 'https://www.openstreetmap.org/node/1'); assert.equal(camp.website, 'https://example.com/camp');
  assert.equal(camp.seasonal, 'summer'); assert.equal(camp.access, 'customers'); assert.equal(camp.drinkingWater, 'yes'); assert.equal(camp.toilets, 'no');
  assert.ok(camp.distanceKm > 0.1 && camp.distanceKm < 0.2);
  assert.equal(result.places[1].sourceUrl, 'https://www.openstreetmap.org/way/2');
  assert.equal(result.places[2].type, 'Wilderness hut');
  assert.equal('safe' in camp, false); assert.equal('open' in camp, false);
});

test('rejects private, prohibited, abandoned and unsuitable sites instead of suggesting arbitrary parks or RV-only sites', () => {
  const unsuitable = [
    { access: 'private' }, { access: 'no' }, { access: 'permit' }, { foot: 'no' }, { foot: 'private' },
    { abandoned: 'yes' }, { disused: 'yes' }, { demolished: 'yes' }, { closed: 'yes' }, { operational_status: 'closed' },
    { 'disused:tourism': 'camp_site' }, { opening_hours: 'off' }, { landuse: 'military' }, { military: 'barracks' },
    { tourism: 'caravan_site' }, { tourism: 'caravan_site', tents: 'no' }, { tents: 'no' }, { camping: 'no' }, { impromptu: 'yes' },
    { tourism: 'picnic_site' }, { tourism: '', leisure: 'park' }, { tourism: '', amenity: 'hospital' },
  ];
  const [result] = normalizeOvernightPlaces(payload(unsuitable.map((tags, i) => place(i + 1, tags))), [stops[0]]);
  assert.equal(result.status, 'none'); assert.deepEqual(result.places, []);
  const [allowed] = normalizeOvernightPlaces(payload([place(100, { tourism: 'caravan_site', tents: 'yes' })]), [stops[0]]);
  assert.equal(allowed.places.length, 1);
});

test('ignores invalid data and excludes locations outside 5 km while returning nearest three unique map features', () => {
  const elements = [null, {}, place(-1), place(1, {}, { lat: NaN }), place(2, {}, { lon: 190 }), place(3, {}, { lat: 44.3 }), place(4), place(4), place(5, {}, { lat: 44.11 }), place(6, {}, { lat: 44.12 }), place(7, {}, { lat: 44.13 })];
  const [result] = normalizeOvernightPlaces(payload(elements), [stops[0]]);
  assert.deepEqual(result.places.map(item => item.id), ['osm:node:4', 'osm:node:5', 'osm:node:6']);
  assert.equal(result.places.every(item => item.distanceKm <= 5), true);
});

test('bounded source text and website allow-list prevent unsafe links', () => {
  for (const website of ['javascript:alert(1)', 'data:text/html,example', 'file:///etc/passwd', 'https://user:password@example.com', 'http://localhost', 'http://127.0.0.1', 'http://10.1.2.3', 'http://192.168.1.2', 'http://172.16.0.1', 'https://example.local']) {
    const [result] = normalizeOvernightPlaces(payload([place(1, { website, name: 'A'.repeat(151) + '\u0000' })]), [stops[0]]);
    assert.equal(result.places[0].website, undefined, website); assert.equal(result.places[0].name.length, 150);
  }
  const [fallback] = normalizeOvernightPlaces(payload([place(1, { name: '', 'name:en': '', website: '', 'contact:website': 'https://example.com' })]), [stops[0]]);
  assert.equal(fallback.places[0].name, 'Unnamed campsite'); assert.equal(fallback.places[0].website, 'https://example.com/');
});

test('partial or malformed responses are not mistaken for a successful empty search', async () => {
  for (const body of [{}, { elements: 'bad' }, { elements: [], remark: 'runtime error: timeout' }]) {
    await assert.rejects(searchOvernightPlaces(stops, { fetchImpl: async () => Response.json(body) }), { code: 'invalid_response' });
  }
  await assert.rejects(searchOvernightPlaces(stops, { fetchImpl: async () => new Response('not json') }), { code: 'invalid_response' });
  assert.throws(() => normalizeOvernightPlaces(payload(Array(161).fill(place(1))), stops), { code: 'response_too_large' });
  await assert.rejects(searchOvernightPlaces(stops, { fetchImpl: async () => Response.json(photon(Array(9).fill(place(1)))) }), { code: 'invalid_response' });
});

test('bounded responses reject oversized advertised and streamed results', async () => {
  await assert.rejects(searchOvernightPlaces(stops, { fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': '1500001' } }) }), { code: 'response_too_large' });
  await assert.rejects(searchOvernightPlaces(stops, { fetchImpl: async () => new Response(' '.repeat(1_500_001)) }), { code: 'response_too_large' });
});

test('upstream failures are classified without exposing the provider body and are never retried', async () => {
  for (const [status, code] of [[429, 'rate_limited'], [503, 'unavailable']]) {
    let calls = 0;
    await assert.rejects(searchOvernightPlaces(stops, { fetchImpl: async () => { calls++; return new Response('Secret upstream diagnostic', { status }); } }), error => {
      assert.equal(error.code, code); assert.doesNotMatch(error.message, /Secret/); return true;
    });
    assert.equal(calls, 1);
  }
});

test('slow requests use a finite cancellable deadline', async () => {
  let signal;
  await assert.rejects(searchOvernightPlaces(stops, { timeoutMs: 10, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } }), { code: 'timeout', status: 504 });
  assert.equal(signal.aborted, true);
});
