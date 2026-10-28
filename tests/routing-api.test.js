import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingHandler } from '../api/routing.js';

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
