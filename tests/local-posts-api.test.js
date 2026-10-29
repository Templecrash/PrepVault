import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalPostsHandler } from '../api/local-posts.js';

const epoch = Date.parse('2026-10-29T20:00:00Z');
const owner = { id: 'owner-id' };
const location = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const token = 'private-test-token-not-real';
const env = { X_BEARER_TOKEN: token };
const response = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } });
const upstream = () => new Response(JSON.stringify({ data: [{ id: '99', text: 'A Toronto road closure in Ontario', author_id: '123', created_at: '2026-10-29T19:55:00Z' }], includes: { users: [{ id: '123', username: 'TPSOperations', name: 'Police' }] } }), { headers: { 'content-type': 'application/json' } });
function setup(options = {}) {
  const calls = [];
  const handler = createLocalPostsHandler({ env, now: () => epoch, authenticate: async () => owner, fetchImpl: async (...args) => { calls.push(args); return upstream(); }, ...options });
  return { handler, calls };
}
async function request(handler, { method = 'GET', query = { ...location, action: 'search' }, headers = {}, ...extra } = {}) {
  const res = response();
  await handler({ method, query, headers: { host: 'prep.example', origin: 'https://prep.example', 'sec-fetch-site': 'same-origin', ...headers }, ...extra }, res);
  return res;
}

test('owner authentication and same-origin checks precede configuration and data', async () => {
  const state = setup({ authenticate: async () => null });
  for (const action of ['status', 'search']) {
    const result = await request(state.handler, { query: { ...location, action } });
    assert.equal(result.statusCode, 401);
    assert.equal(result.body.configured, undefined);
  }
  let authCalls = 0;
  const guarded = setup({ authenticate: async () => { authCalls++; return owner; } });
  for (const headers of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) assert.equal((await request(guarded.handler, { headers })).statusCode, 403);
  assert.equal(authCalls, 0);
  assert.equal(state.calls.length + guarded.calls.length, 0);
});

test('status is free, defaults correctly and reveals no credential values', async () => {
  for (const configured of [true, false]) {
    const state = setup({ env: configured ? env : {} });
    const result = await request(state.handler, { query: location });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { configured });
    assert.equal(state.calls.length, 0);
    assert.equal(JSON.stringify(result).includes(token), false);
    assert.match(result.headers['cache-control'], /no-store/);
    assert.equal(result.headers['cross-origin-resource-policy'], 'same-origin');
    if (!configured) assert.equal((await request(state.handler)).body.code, 'needs_connection');
  }
});

test('unsafe, duplicated and unsupported queries never fetch posts', async () => {
  const state = setup();
  for (const query of [{ ...location, city: 'Toronto OR from:someone', action: 'search' }, { ...location, action: 'search', url: 'https://evil.example' }, { ...location, action: ['search', 'search'] }, { action: 'search' }]) assert.equal((await request(state.handler, { query })).statusCode, 400);
  assert.equal((await request(state.handler, { query: null, url: '/api/local-posts?action=search&action=status&city=Toronto&countryCode=CA' })).statusCode, 400);
  assert.equal((await request(state.handler, { method: 'POST' })).statusCode, 405);
  assert.equal(state.calls.length, 0);
});

test('ten-minute cache is isolated by owner and location while preserving requested tuple', async () => {
  let time = epoch; let current = owner;
  const state = setup({ now: () => time, authenticate: async () => current });
  assert.equal((await request(state.handler)).body.posts.length, 1);
  await request(state.handler);
  const folded = await request(state.handler, { query: { ...location, city: 'TORONTO', action: 'search' } });
  assert.equal(folded.body.location.city, 'TORONTO');
  assert.equal(state.calls.length, 1);
  await request(state.handler, { query: { ...location, city: 'Ottawa', action: 'search' } });
  assert.equal(state.calls.length, 2);
  current = { id: 'another-owner' };
  await request(state.handler);
  assert.equal(state.calls.length, 3);
  time += 600001;
  await request(state.handler);
  assert.equal(state.calls.length, 4);
});

test('concurrent identical requests share one fetch and each revalidates owner afterward', async () => {
  let release; let calls = 0; let authCalls = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const state = setup({ authenticate: async () => { authCalls++; return owner; }, fetchImpl: async () => { calls++; await waiting; return upstream(); } });
  const a = request(state.handler); const b = request(state.handler);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  release();
  const result = await Promise.all([a, b]);
  assert.deepEqual(result.map(value => value.statusCode), [200, 200]);
  assert.equal(authCalls, 4);
});

test('logout or changed identity during fetch suppresses the response', async () => {
  let authCalls = 0;
  const state = setup({ authenticate: async () => ++authCalls === 1 ? owner : null });
  const result = await request(state.handler);
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.posts, undefined);
  assert.equal(state.calls.length, 1);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('finished public result prevents a duplicate charge while owner revalidation waits', async () => {
  let authCalls = 0; let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const state = setup({ authenticate: async () => { if (++authCalls === 2) await waiting; return owner; } });
  const first = request(state.handler);
  await new Promise(resolve => setTimeout(resolve, 0));
  const second = await request(state.handler);
  assert.equal(second.statusCode, 200);
  assert.equal(state.calls.length, 1);
  release();
  assert.equal((await first).statusCode, 200);
});

test('per-owner fetch limit permits cached reads and expires after ten minutes', async () => {
  let time = epoch;
  const state = setup({ now: () => time });
  for (let index = 0; index < 6; index++) assert.equal((await request(state.handler, { query: { ...location, city: `City ${index}`, action: 'search' } })).statusCode, 200);
  const limited = await request(state.handler);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['retry-after'], '600');
  assert.equal((await request(state.handler, { query: { ...location, city: 'City 0', action: 'search' } })).statusCode, 200);
  assert.equal(state.calls.length, 6);
  time += 600001;
  assert.equal((await request(state.handler)).statusCode, 200);
  assert.equal(state.calls.length, 7);
});

test('process-wide fetch limit cannot be bypassed by changing owner identity', async () => {
  let currentOwner = 0;
  const state = setup({ authenticate: async () => ({ id: `owner-${currentOwner}` }) });
  for (let index = 0; index < 20; index++) {
    currentOwner = index;
    assert.equal((await request(state.handler)).statusCode, 200);
  }
  currentOwner = 21;
  assert.equal((await request(state.handler)).statusCode, 429);
  assert.equal(state.calls.length, 20);
});

test('unexpected auth and network errors are sanitized', async () => {
  for (const options of [{ authenticate: async () => { throw Error(token); } }, { fetchImpl: async () => { throw Error(`Authorization: Bearer ${token}`); } }]) {
    const result = await request(setup(options).handler);
    assert.ok([502, 503].includes(result.statusCode));
    assert.equal(JSON.stringify(result).includes(token), false);
    assert.equal(result.body.posts, undefined);
  }
});
