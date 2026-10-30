import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMapCoordinates, searchMapPlaces } from '../src/map-search.js';

test('map coordinates accept zero but reject blanks and coordinates outside routing coverage', () => {
  assert.equal(hasMapCoordinates({ latitude: 0, longitude: '0' }), true);
  for (const point of [{ latitude: '', longitude: 0 }, { latitude: null, longitude: 0 }, { latitude: 90, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: 'NaN', longitude: 0 }]) assert.equal(hasMapCoordinates(point), false);
});

test('address searches use the private POST endpoint and preserve selected place labels', async () => {
  const places = await searchMapPlaces('  100 Queen Street West Toronto  ', { fetchImpl: async (url, init) => {
    assert.equal(url, '/api/routing');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    assert.deepEqual(JSON.parse(init.body), { action: 'search', query: '100 Queen Street West Toronto' });
    return Response.json({ results: [{ id: '1', name: 'Toronto City Hall', label: '100 Queen Street West, Toronto', detail: 'Ontario, Canada', latitude: 43.65, longitude: -79.38 }, { name: 'Bad match', label: 'Bad match', latitude: '', longitude: '' }] });
  } });
  assert.equal(places.length, 1);
  assert.equal(places[0].label, '100 Queen Street West, Toronto');
});

test('search rejects invalid input before contacting a provider and retains auth status', async () => {
  for (const value of ['', 'a', 'a'.repeat(151)]) await assert.rejects(searchMapPlaces(value, { fetchImpl: () => assert.fail('must not fetch') }), /between 2 and 150/);
  await assert.rejects(searchMapPlaces('Toronto', { fetchImpl: async () => Response.json({ error: 'Sign in to search places.' }, { status: 401 }) }), error => error.status === 401 && /Sign in/.test(error.message));
  await assert.rejects(searchMapPlaces('Toronto', { fetchImpl: async () => Response.json({ unexpected: true }) }), /invalid response/);
});

test('search respects cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchMapPlaces('Toronto', { signal: controller.signal, fetchImpl: async (_url, init) => { init.signal.throwIfAborted(); } }), { name: 'AbortError' });
});
