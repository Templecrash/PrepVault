import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingHandler } from '../api/routing.js';
import { RouteProviderError } from '../api/_lib/route-provider.js';

const body = { points: [{ name: 'A', latitude: 0, longitude: 0 }, { name: 'B', latitude: 0, longitude: .2 }], mode: 'drive' };
const request = changes => ({ method: 'POST', headers: { host: 'prep.example', origin: 'https://prep.example', 'content-type': 'application/json' }, body, ...changes });
async function run(handler, req = request()) {
  const res = { statusCode: 200, headers: {}, body: null, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await handler(req, res); return res;
}
const owner = async () => ({ id: 'owner' });

test('routing requires same-origin owner authentication before contacting the provider', async () => {
  let calls = 0;
  const handler = createRoutingHandler({ authenticate: async () => null, calculate: async () => { calls++; } });
  assert.equal((await run(handler)).statusCode, 401);
  assert.equal((await run(handler, request({ headers: { host: 'prep.example', origin: 'https://evil.example', 'content-type': 'application/json' } }))).statusCode, 403);
  assert.equal(calls, 0);
});

test('method, malformed input and oversized parsed bodies fail before provider work', async () => {
  let calls = 0;
  const handler = createRoutingHandler({ authenticate: owner, calculate: async () => { calls++; } });
  assert.equal((await run(handler, request({ method: 'GET' }))).statusCode, 405);
  assert.equal((await run(handler, request({ body: '{' }))).statusCode, 400);
  assert.equal((await run(handler, request({ body: { ...body, mode: 'flight' } }))).statusCode, 400);
  assert.equal((await run(handler, request({ body: { ...body, unused: 'x'.repeat(16001) } }))).statusCode, 413);
  assert.equal(calls, 0);
});

test('session is rechecked after provider calculation and revocation withholds the result', async () => {
  let authCalls = 0;
  const handler = createRoutingHandler({ authenticate: async () => ++authCalls === 1 ? { id: 'owner' } : null, calculate: async () => ({ private: 'geometry' }) });
  const result = await run(handler);
  assert.equal(result.statusCode, 401); assert.equal(result.body.route, undefined); assert.equal(authCalls, 2);
});

test('cache is private to owner and identical requests still require current authentication', async () => {
  let time = 100_000, calls = 0, identity = 'owner', authCalls = 0;
  const handler = createRoutingHandler({ now: () => time, authenticate: async () => { authCalls++; return { id: identity }; }, calculate: async input => ({ count: ++calls, mode: input.mode }) });
  const first = await run(handler); const second = await run(handler);
  assert.equal(first.body.route.count, 1); assert.equal(second.body.route.count, 1); assert.equal(calls, 1); assert.equal(authCalls, 4);
  assert.equal(second.headers['cache-control'], 'private, no-store');
  time += 1200; identity = 'other-owner';
  assert.equal((await run(handler)).body.route.count, 2);
});

test('provider errors are redacted and a failure releases the busy lock for retry', async () => {
  let time = 100_000, calls = 0;
  const handler = createRoutingHandler({ now: () => time, authenticate: owner, calculate: async () => { if (++calls === 1) throw new Error('SECRET provider internals'); return { ok: true }; } });
  const first = await run(handler); assert.equal(first.statusCode, 503); assert.doesNotMatch(JSON.stringify(first.body), /SECRET/);
  time += 1200;
  assert.equal((await run(handler)).statusCode, 200);
});

test('known route failures retain actionable status and logs contain no input or upstream secrets', async () => {
  for (const [code, status] of [['avoidance_limit', 422], ['location_unreachable', 422], ['no_route', 422], ['rate_limited', 429], ['timeout', 504], ['unavailable', 503]]) {
    const events = [];
    const failure = new RouteProviderError(code, { providerStatus: 400, providerCode: 167 });
    failure.cause = new Error('SECRET address and URL');
    const handler = createRoutingHandler({ authenticate: owner, calculate: async () => { throw failure; }, reportFailure: event => events.push(event) });
    const result = await run(handler);
    assert.equal(result.statusCode, status); assert.equal(result.body.error, failure.message);
    assert.deepEqual(events, [{ action: 'route', code, providerStatus: 400, providerCode: 167 }]);
    assert.doesNotMatch(JSON.stringify({ events, body: result.body }), /SECRET|latitude|longitude/);
    if (status === 429) assert.equal(result.headers['retry-after'], '60');
  }
});

test('oversized avoidance boundaries fail before any provider work', async () => {
  let calls = 0;
  const handler = createRoutingHandler({ authenticate: owner, calculate: async () => { calls++; } });
  const result = await run(handler, request({ body: { ...body, avoidAreas: [{ name: 'Town', latitude: .3, longitude: .3, radiusKm: 2 }] } }));
  assert.equal(result.statusCode, 400); assert.match(result.body.error, /avoid|boundary|radii/i); assert.equal(calls, 0);
});

test('concurrent and immediate repeat calculations are rate limited without duplicate provider work', async () => {
  let resolve, calls = 0, time = 100_000;
  const handler = createRoutingHandler({ now: () => time, authenticate: owner, calculate: async () => { calls++; return new Promise(done => { resolve = done; }); } });
  const pending = run(handler); await new Promise(done => setTimeout(done, 0));
  assert.equal((await run(handler)).statusCode, 429); assert.equal(calls, 1);
  resolve({ ok: true }); await pending;
  const different = request({ body: { ...body, mode: 'walk' } });
  assert.equal((await run(handler, different)).statusCode, 429);
  time += 1200;
});

const searchRequest = (query = '100 Queen Street West, Toronto', changes = {}) => request({ body: { action: 'search', query }, ...changes });
const matches = [{ id: 'photon:W:123', name: 'Toronto City Hall', label: 'Toronto City Hall, Toronto, Ontario, Canada', detail: 'Toronto, Ontario, Canada', latitude: 43.6534, longitude: -79.3839 }];

test('map search requires same-origin owner authentication before provider work', async () => {
  let calls = 0;
  const handler = createRoutingHandler({ authenticate: async () => null, search: async () => { calls++; return matches; } });
  assert.equal((await run(handler, searchRequest())).statusCode, 401);
  assert.equal((await run(handler, searchRequest('Toronto', { headers: { host: 'prep.example', origin: 'https://evil.example', 'content-type': 'application/json' } }))).statusCode, 403);
  assert.equal(calls, 0);
});

test('search action validates query and request bounds without calculating a route', async () => {
  let searches = 0, calculations = 0;
  const handler = createRoutingHandler({ authenticate: owner, search: async query => { searches++; assert.equal(query, 'Toronto'); return matches; }, calculate: async () => { calculations++; } });
  for (const query of [null, {}, '', 'x', 'x'.repeat(151), 'Toronto\u0000']) assert.equal((await run(handler, searchRequest(query))).statusCode, 400);
  assert.equal((await run(handler, searchRequest('Toronto', { headers: { host: 'prep.example', origin: 'https://prep.example', 'content-type': 'text/plain' } }))).statusCode, 400);
  assert.equal((await run(handler, searchRequest('Toronto', { body: { action: 'search', query: 'Toronto', padding: 'x'.repeat(16001) } }))).statusCode, 413);
  const result = await run(handler, searchRequest('  Toronto  '));
  assert.equal(result.statusCode, 200); assert.deepEqual(result.body, { results: matches });
  assert.equal(searches, 1); assert.equal(calculations, 0);
});

test('private search cache is owner-scoped, expires, and rechecks every session', async () => {
  let time = 100_000, calls = 0, identity = 'owner', authCalls = 0;
  const handler = createRoutingHandler({ now: () => time, authenticate: async () => { authCalls++; return { id: identity }; }, search: async () => { calls++; return []; } });
  assert.deepEqual((await run(handler, searchRequest('Toronto'))).body.results, []);
  const cached = await run(handler, searchRequest('  toronto  '));
  assert.equal(cached.statusCode, 200); assert.equal(cached.headers['cache-control'], 'private, no-store'); assert.equal(cached.headers['x-content-type-options'], 'nosniff');
  assert.equal(calls, 1); assert.equal(authCalls, 4);
  time += 1200; identity = 'other-owner';
  assert.equal((await run(handler, searchRequest('Toronto'))).statusCode, 200); assert.equal(calls, 2);
  time += 3600_001; identity = 'owner';
  assert.equal((await run(handler, searchRequest('Toronto'))).statusCode, 200); assert.equal(calls, 3);
});

test('search results are withheld if the owner session is revoked or changes', async () => {
  for (const current of [null, { id: 'someone-else' }]) {
    let authCalls = 0;
    const handler = createRoutingHandler({ authenticate: async () => ++authCalls === 1 ? { id: 'owner' } : current, search: async () => matches });
    const result = await run(handler, searchRequest());
    assert.equal(result.statusCode, 401); assert.equal(result.body.results, undefined); assert.equal(authCalls, 2);
  }
});

test('cached map results also require a second current authentication check', async () => {
  let authCalls = 0, calls = 0;
  const handler = createRoutingHandler({ authenticate: async () => ++authCalls === 4 ? null : { id: 'owner' }, search: async () => { calls++; return matches; } });
  assert.equal((await run(handler, searchRequest())).statusCode, 200);
  const cached = await run(handler, searchRequest());
  assert.equal(cached.statusCode, 401); assert.equal(cached.body.results, undefined); assert.equal(calls, 1);
});

test('search failures are sanitized and release their lock without blocking route calculations', async () => {
  let time = 100_000, calls = 0;
  const handler = createRoutingHandler({ now: () => time, authenticate: owner, search: async () => { if (++calls === 1) throw new Error('SECRET upstream address and key'); return matches; }, calculate: async () => ({ ok: true }) });
  const failure = await run(handler, searchRequest());
  assert.equal(failure.statusCode, 503); assert.doesNotMatch(JSON.stringify(failure.body), /SECRET|upstream|key/); assert.match(failure.body.error, /Address search/);
  assert.equal((await run(handler)).statusCode, 200);
  time += 1200;
  assert.equal((await run(handler, searchRequest())).statusCode, 200);
});

test('concurrent and rapid searches are throttled while cached queries avoid provider work', async () => {
  let resolve, calls = 0, time = 100_000;
  const handler = createRoutingHandler({ now: () => time, authenticate: owner, search: async () => { calls++; return new Promise(done => { resolve = done; }); } });
  const pending = run(handler, searchRequest('Toronto')); await new Promise(done => setTimeout(done, 0));
  assert.equal((await run(handler, searchRequest('Ottawa'))).statusCode, 429); assert.equal(calls, 1);
  resolve(matches); await pending;
  assert.equal((await run(handler, searchRequest('Toronto'))).statusCode, 200);
  const limited = await run(handler, searchRequest('Ottawa'));
  assert.equal(limited.statusCode, 429); assert.equal(limited.headers['retry-after'], '2'); assert.equal(calls, 1);
  time += 1200;
});

test('search cache and daily quota are bounded, with quota resetting the following day', async () => {
  let time = 100_000, calls = 0;
  const handler = createRoutingHandler({ now: () => time, authenticate: owner, search: async () => { calls++; return matches; } });
  for (let index = 0; index < 101; index++) {
    assert.equal((await run(handler, searchRequest(`Public landmark ${index}`))).statusCode, 200); time += 1200;
  }
  assert.equal((await run(handler, searchRequest('Public landmark 0'))).statusCode, 200); time += 1200;
  assert.equal(calls, 102, 'the oldest result is evicted after the 100-entry cache fills');
  for (let index = 102; index < 120; index++) { assert.equal((await run(handler, searchRequest(`Public landmark ${index}`))).statusCode, 200); time += 1200; }
  assert.equal((await run(handler, searchRequest('Another public landmark'))).statusCode, 429); assert.equal(calls, 120);
  assert.equal((await run(handler, searchRequest('Public landmark 119'))).statusCode, 200);
  time += 86_400_000;
  assert.equal((await run(handler, searchRequest('Another public landmark'))).statusCode, 200); assert.equal(calls, 121);
});
