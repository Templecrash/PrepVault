import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRoutingHandler } from '../api/routing.js';
import { RouteProviderError } from '../api/_lib/route-provider.js';
import { OvernightPlacesError } from '../api/_lib/overnight-places.js';
import { createAccountAuth } from '../api/_lib/account-auth.js';

const body = { points: [{ name: 'A', latitude: 0, longitude: 0 }, { name: 'B', latitude: 0, longitude: .2 }], mode: 'drive' };
const request = changes => ({ method: 'POST', headers: { host: 'prep.example', origin: 'https://prep.example', 'content-type': 'application/json' }, body, ...changes });
async function run(handler, req = request()) {
  const res = { statusCode: 200, headers: {}, body: null, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await handler(req, res); return res;
}
const owner = async () => ({ id: 'owner' });

const accountEnv = { NEON_AUTH_BASE_URL: 'https://auth.example/neondb/auth', NEON_AUTH_COOKIE_SECRET: 's'.repeat(40), TRACKING_OWNER_EMAIL: 'owner@example.com', TRACKING_OWNER_ID: 'owner-id' };
const accountTime = Date.parse('2026-10-26T12:00:00Z');
const accountSession = id => ({ user: { id, email: `${id}@example.com`, emailVerified: true, name: 'Planner' }, session: { userId: id, expiresAt: '2026-10-27T12:00:00Z' } });
const accountRequest = (id, changes = {}) => request({ ...changes, headers: { ...request().headers, cookie: `__Secure-neon-auth.session_token=${id}`, authorization: 'Bearer forged-owner', ...changes.headers } });

test('ordinary verified accounts can calculate routes and search through provider-verified authentication', async () => {
  const authCalls = [];
  const auth = createAccountAuth({ env: accountEnv, now: () => accountTime, proxy: async options => {
    authCalls.push(options.request);
    return Response.json(accountSession('ordinary-planner'));
  } });
  let calculations = 0, searches = 0;
  const handler = createRoutingHandler({ authenticate: auth.authenticate, now: () => accountTime, calculate: async input => { calculations++; assert.equal(input.userId, undefined); return { private: 'route' }; }, search: async () => { searches++; return [{ private: 'place' }]; } });
  const route = await run(handler, accountRequest('ordinary-planner', { body: { ...body, userId: 'owner-id', user: { emailVerified: true, id: 'owner-id' } } }));
  assert.equal(route.statusCode, 200); assert.deepEqual(route.body.route, { private: 'route' });
  const search = await run(handler, accountRequest('ordinary-planner', { body: { action: 'search', query: 'Toronto' } }));
  assert.equal(search.statusCode, 200); assert.deepEqual(search.body.results, [{ private: 'place' }]);
  assert.equal(calculations, 1); assert.equal(searches, 1); assert.equal(authCalls.length, 4);
  for (const call of authCalls) {
    assert.match(call.url, /get-session\?disableCookieCache=true$/);
    assert.equal(call.headers.get('authorization'), null);
    assert.equal(call.headers.get('cookie'), '__Secure-neon-auth.session_token=ordinary-planner');
  }
});

test('provider-verified account IDs isolate route caches despite forged client identities', async () => {
  let time = accountTime, calculations = 0;
  const auth = createAccountAuth({ env: accountEnv, now: () => time, proxy: async options => {
    const id = options.request.headers.get('cookie').split('=')[1];
    return Response.json(accountSession(id));
  } });
  const handler = createRoutingHandler({ authenticate: auth.authenticate, now: () => time, calculate: async () => ({ calculation: ++calculations }) });
  const first = accountRequest('planner-one');
  assert.equal((await run(handler, first)).body.route.calculation, 1);
  time += 1200;
  const second = accountRequest('planner-two', { body: { ...body, userId: 'planner-one', accountId: 'planner-one' } });
  assert.equal((await run(handler, second)).body.route.calculation, 2);
  assert.equal((await run(handler, first)).body.route.calculation, 1);
  assert.equal(calculations, 2);
});

test('unverified accounts cannot invoke map providers and revoked sessions cannot receive results', async () => {
  for (const action of ['route', 'search', 'overnight']) {
    let authCalls = 0, providerCalls = 0;
    const auth = createAccountAuth({ env: accountEnv, now: () => accountTime, proxy: async () => {
      authCalls++;
      const data = accountSession('ordinary-planner');
      data.user.emailVerified = false;
      return Response.json(data);
    } });
    const options = { authenticate: auth.authenticate, now: () => accountTime, calculate: async () => { providerCalls++; return {}; }, search: async () => { providerCalls++; return []; }, overnight: async () => { providerCalls++; return {}; } };
    const req = accountRequest('ordinary-planner', { body: action === 'route' ? body : action === 'search' ? { action: 'search', query: 'Toronto' } : { action: 'overnight', stops: [{ day: 1, latitude: 0, longitude: 0 }] } });
    const denied = await run(createRoutingHandler(options), req);
    assert.equal(denied.statusCode, 401); assert.doesNotMatch(denied.body.error, /owner/); assert.equal(providerCalls, 0); assert.equal(authCalls, 1);

    let checks = 0;
    const revokedAuth = createAccountAuth({ env: accountEnv, now: () => accountTime, proxy: async () => {
      const data = accountSession('ordinary-planner');
      if (++checks > 1) data.user.banned = true;
      return Response.json(data);
    } });
    const revoked = await run(createRoutingHandler({ ...options, authenticate: revokedAuth.authenticate }), req);
    assert.equal(revoked.statusCode, 401); assert.equal(revoked.body.route, undefined); assert.equal(revoked.body.results, undefined); assert.equal(revoked.body.overnight, undefined); assert.equal(checks, 2);
  }
});

test('routing requires same-origin account authentication before contacting the provider', async () => {
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

test('cache is private to each account and identical requests still require current authentication', async () => {
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

test('map search requires same-origin account authentication before provider work', async () => {
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

test('private search cache is account-scoped, expires, and rechecks every session', async () => {
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

test('search results are withheld if the account session is revoked or changes', async () => {
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

const overnightStops = [{ day: 1, latitude: 43.7, longitude: -79.4 }];
const overnightRequest = (stops = overnightStops, changes = {}) => request({ body: { action: 'overnight', stops }, ...changes });

test('overnight discovery requires same-origin authentication before provider calls', async () => {
  let calls = 0;
  const handler = createRoutingHandler({ authenticate: async () => null, overnight: async () => { calls++; } });
  assert.equal((await run(handler, overnightRequest())).statusCode, 401);
  assert.equal((await run(handler, overnightRequest(undefined, { headers: { host: 'prep.example', origin: 'https://evil.example', 'content-type': 'application/json' } }))).statusCode, 403);
  assert.equal(calls, 0);
});

test('overnight discovery validates bounded bodies and passes only day and coordinates', async () => {
  let calls = 0, searches = 0, calculations = 0, received;
  const handler = createRoutingHandler({ authenticate: owner, overnight: async stops => { calls++; received = stops; return { stops }; }, search: async () => { searches++; }, calculate: async () => { calculations++; } });
  for (const stops of [null, [], 'query', Array(21).fill(overnightStops[0]), [{ day: 1, latitude: 86, longitude: 0 }], [{ day: 0, latitude: 0, longitude: 0 }], [overnightStops[0], overnightStops[0]]]) assert.equal((await run(handler, overnightRequest(stops))).statusCode, 400);
  assert.equal((await run(handler, overnightRequest(undefined, { headers: { ...request().headers, 'content-type': 'text/plain' } }))).statusCode, 400);
  for (const req of [overnightRequest(undefined, { body: { action: 'overnight', stops: overnightStops, padding: 'x'.repeat(16001) } }), overnightRequest(undefined, { body: 'x'.repeat(16001) }), overnightRequest(undefined, { headers: { ...request().headers, 'content-length': '16001' } })]) assert.equal((await run(handler, req)).statusCode, 413);
  const valid = await run(handler, overnightRequest(undefined, { body: Buffer.from(JSON.stringify({ action: 'overnight', userId: 'someone-else', stops: [{ ...overnightStops[0], accountId: 'forged', name: 'Private address' }] })) }));
  assert.equal(valid.statusCode, 200); assert.equal(calls, 1); assert.equal(searches, 0); assert.equal(calculations, 0);
  assert.deepEqual(received, overnightStops); assert.deepEqual(valid.body, { overnight: { stops: overnightStops } });
});

test('overnight cache is private per verified account and expires without sharing coordinates', async () => {
  let time = 100_000, calls = 0, identity = 'one', checks = 0;
  const handler = createRoutingHandler({ authenticate: async () => { checks++; return { id: identity }; }, now: () => time, overnight: async () => ({ lookup: ++calls }) });
  assert.equal((await run(handler, overnightRequest())).body.overnight.lookup, 1);
  const cached = await run(handler, overnightRequest());
  assert.equal(cached.body.overnight.lookup, 1); assert.equal(checks, 4);
  assert.equal(cached.headers['cache-control'], 'private, no-store'); assert.equal(cached.headers['x-content-type-options'], 'nosniff');
  identity = 'two'; time += 2100;
  assert.equal((await run(handler, overnightRequest(undefined, { body: { action: 'overnight', stops: overnightStops, userId: 'one' } }))).body.overnight.lookup, 2);
  identity = 'one'; time += 3_600_001;
  assert.equal((await run(handler, overnightRequest())).body.overnight.lookup, 3);
});

test('overnight results and cached results are withheld after revocation or identity change', async () => {
  for (const finalAccount of [null, { id: 'different' }]) {
    let checks = 0;
    const handler = createRoutingHandler({ authenticate: async () => ++checks === 1 ? { id: 'one' } : finalAccount, overnight: async () => ({ secret: 'stop' }) });
    const result = await run(handler, overnightRequest());
    assert.equal(result.statusCode, 401); assert.equal(result.body.overnight, undefined); assert.equal(checks, 2);
  }
  let checks = 0, calls = 0;
  const handler = createRoutingHandler({ authenticate: async () => ++checks === 4 ? null : { id: 'one' }, overnight: async () => { calls++; return { private: 'place' }; } });
  assert.equal((await run(handler, overnightRequest())).statusCode, 200);
  const cached = await run(handler, overnightRequest());
  assert.equal(cached.statusCode, 401); assert.equal(cached.body.overnight, undefined); assert.equal(calls, 1);
});

test('concurrent and rapid overnight lookups are bounded without blocking route calculation', async () => {
  let finish, calls = 0, time = 100_000;
  const handler = createRoutingHandler({ authenticate: owner, now: () => time, overnight: async () => { calls++; return new Promise(resolve => { finish = resolve; }); }, calculate: async () => ({ route: true }) });
  const pending = run(handler, overnightRequest()); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await run(handler, overnightRequest([{ day: 2, latitude: 44, longitude: -79 }]))).statusCode, 429);
  assert.equal((await run(handler)).statusCode, 200);
  finish({ stops: [] }); await pending;
  assert.equal((await run(handler, overnightRequest())).statusCode, 200);
  const limited = await run(handler, overnightRequest([{ day: 2, latitude: 44, longitude: -79 }]));
  assert.equal(limited.statusCode, 429); assert.equal(limited.headers['retry-after'], '3'); assert.equal(calls, 1);
  time += 2100;
});

test('overnight failures release the lock and expose only bounded failure categories', async () => {
  for (const [code, expected] of [['timeout', 504], ['rate_limited', 429], ['invalid_response', 502], ['unavailable', 503]]) {
    let calls = 0, time = 100_000;
    const events = [];
    const failure = new OvernightPlacesError(code); failure.cause = new Error('SECRET coordinates and URL');
    const handler = createRoutingHandler({ authenticate: owner, now: () => time, overnight: async () => { if (++calls === 1) throw failure; return { stops: [] }; }, reportFailure: event => events.push(event) });
    const result = await run(handler, overnightRequest());
    assert.equal(result.statusCode, expected); assert.equal(result.body.error, failure.message);
    assert.equal(events[0].action, 'overnight'); assert.equal(events[0].code, code);
    assert.doesNotMatch(JSON.stringify({ result, events }), /SECRET|latitude|longitude/);
    if (expected === 429) assert.equal(result.headers['retry-after'], '60');
    time += 2100; assert.equal((await run(handler, overnightRequest())).statusCode, 200);
  }
});

test('overnight cache size and daily quota are bounded and reset the next day', async () => {
  let calls = 0, time = 100_000;
  const handler = createRoutingHandler({ authenticate: owner, now: () => time, overnight: async () => ({ lookup: ++calls }) });
  const stops = index => [{ day: index + 1, latitude: 43, longitude: -79 }];
  for (let index = 0; index < 41; index++) { assert.equal((await run(handler, overnightRequest(stops(index)))).statusCode, 200); time += 2100; }
  assert.equal((await run(handler, overnightRequest(stops(0)))).body.overnight.lookup, 42, 'oldest entry is evicted after 40 cached queries'); time += 2100;
  for (let index = 42; index < 60; index++) { assert.equal((await run(handler, overnightRequest(stops(index)))).statusCode, 200); time += 2100; }
  assert.equal((await run(handler, overnightRequest(stops(60)))).statusCode, 429); assert.equal(calls, 60);
  assert.equal((await run(handler, overnightRequest(stops(59)))).statusCode, 200, 'cache hits do not consume quota');
  time += 86_400_000;
  assert.equal((await run(handler, overnightRequest(stops(60)))).statusCode, 200); assert.equal(calls, 61);
});

test('routing API accepts long walks for segmentation while retaining cycling and total bounds', async () => {
  let calls = 0;
  const handler = createRoutingHandler({ authenticate: owner, calculate: async input => { calls++; return { mode: input.mode }; } });
  const points = [{ name: 'Start', latitude: 0, longitude: 0 }, { name: 'End', latitude: 0, longitude: 1.6 }];
  assert.equal((await run(handler, request({ body: { points, mode: 'walk' } }))).statusCode, 200);
  assert.equal((await run(handler, request({ body: { points, mode: 'bike' } }))).statusCode, 400);
  assert.equal((await run(handler, request({ body: { points: [points[0], { ...points[1], longitude: 3 }], mode: 'walk' } }))).statusCode, 400);
  assert.equal(calls, 1);
});
