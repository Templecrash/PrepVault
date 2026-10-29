import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalUpdatesHandler } from '../api/local-updates.js';
const NOW = Date.parse('2026-10-29T19:00:00Z');
const query = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const data = { fetchedAt: new Date(NOW).toISOString(), updates: [], sources: [{ id: 'official', status: 'empty' }], channels: [] };
function recorder() { return { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k.toLowerCase()] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }, end() {} }; }
async function request(handler, options = {}) { const res = recorder(); await handler({ method: 'GET', query, ...options }, res); return res; }

test('public reads require no owner cookies and use private non-caching responses', async () => {
  const handler = createLocalUpdatesHandler({ now: () => NOW, load: async () => data });
  const res = await request(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.deepEqual(res.body.location, query);
  assert.equal((await request(handler, { method: 'OPTIONS' })).statusCode, 204);
  assert.equal((await request(handler, { method: 'POST' })).statusCode, 405);
});
test('invalid, duplicate or injectable query values never reach the upstream loader', async () => {
  let calls = 0;
  const handler = createLocalUpdatesHandler({ load: async () => { calls++; return data; } });
  for (const input of [{}, { ...query, city: ['Toronto', 'London'] }, { ...query, city: 'Toronto OR 1=1' }, { ...query, countryCode: 'ZZ' }, { ...query, url: 'https://evil.example' }, { ...query, lat: '43.5' }]) assert.equal((await request(handler, { query: input })).statusCode, 400);
  assert.equal((await request(handler, { url: '/api/local-updates?city=Toronto&city=London&countryCode=CA' })).statusCode, 400);
  assert.equal(calls, 0);
});
test('concurrent matching locations deduplicate requests and keep response location tied to each caller', async () => {
  let calls = 0; let release;
  const handler = createLocalUpdatesHandler({ now: () => NOW, load: async () => { calls++; await new Promise(resolve => { release = resolve; }); return data; } });
  const first = request(handler); const otherQuery = { city: 'TORONTO', region: 'ON', countryCode: 'CA' };
  const second = request(handler, { query: otherQuery });
  await new Promise(resolve => setTimeout(resolve, 0)); release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a.body.location, query);
  assert.deepEqual(b.body.location, otherQuery);
  await request(handler); assert.equal(calls, 1);
});
test('cache expiration retries unavailable sources sooner and never silently substitutes stale results', async () => {
  let now = NOW; let calls = 0;
  const handler = createLocalUpdatesHandler({ now: () => now, load: async () => { calls++; return { ...data, sources: [{ id: 'official', status: 'unavailable' }] }; } });
  await request(handler); now += 29000; await request(handler); assert.equal(calls, 1);
  now += 2000; await request(handler); assert.equal(calls, 2);
});
test('distinct refresh and concurrency budgets return 429 with retry header', async () => {
  const handler = createLocalUpdatesHandler({ now: () => NOW, load: async () => data });
  for (let n = 0; n < 16; n++) assert.equal((await request(handler, { query: { ...query, city: `City ${n}` } })).statusCode, 200);
  const limited = await request(handler, { query: { ...query, city: 'Another City' } });
  assert.equal(limited.statusCode, 429); assert.equal(limited.headers['retry-after'], '60');
  const releases = [];
  const busy = createLocalUpdatesHandler({ now: () => NOW, load: async () => { await new Promise(resolve => releases.push(resolve)); return data; } });
  const pending = [0, 1, 2, 3].map(n => request(busy, { query: { ...query, city: `Town ${n}` } }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await request(busy, { query: { ...query, city: 'Fifth Town' } })).statusCode, 429);
  releases.forEach(resolve => resolve()); await Promise.all(pending);
});
test('unexpected loader failures are sanitized and the pending request can retry', async () => {
  let calls = 0;
  const handler = createLocalUpdatesHandler({ load: async () => { calls++; throw Error('secret upstream details'); } });
  const first = await request(handler); const second = await request(handler);
  assert.equal(first.statusCode, 502); assert.equal(second.statusCode, 502); assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(first.body), /secret upstream/);
});
