import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationBriefingHandler } from '../api/location-briefing.js';

const response = () => ({ headers: {}, statusCode: 200, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } });
const request = async (handler, { query = {}, method = 'GET' } = {}) => { const res = response(); await handler({ query, method, headers: {} }, res); return res; };
const payload = { fetchedAt: '2026-10-28T12:00:00Z', articles: [], sources: [{ status: 'ready' }], guidance: [] };

test('briefing is a bounded public read with no arbitrary upstream query or URL', async () => {
  let calls = 0; const handler = createLocationBriefingHandler({ load: async () => { calls++; return payload; } });
  assert.equal((await request(handler, { method: 'POST' })).statusCode, 405);
  assert.equal((await request(handler, { method: 'OPTIONS' })).statusCode, 204);
  assert.equal((await request(handler, { query: { url: 'https://localhost/private' } })).statusCode, 400);
  assert.equal(calls, 0);
  const res = await request(handler); assert.equal(res.statusCode, 200); assert.equal(res.headers['x-content-type-options'], 'nosniff'); assert.equal(calls, 1);
});
test('concurrent requests share a single refresh, cache expires after ten minutes', async () => {
  let calls = 0; let time = 1; let resolve;
  const handler = createLocationBriefingHandler({ now: () => time, load: () => { calls++; return new Promise(done => { resolve = done; }); } });
  const first = request(handler); const second = request(handler); assert.equal(calls, 1); resolve(payload);
  assert.deepEqual((await first).body, (await second).body); await request(handler); assert.equal(calls, 1);
  time += 600001; const next = request(handler); assert.equal(calls, 2); resolve(payload); await next;
});
test('complete source failure has a shorter retry cache and handler failures are sanitized', async () => {
  let calls = 0; let time = 1;
  const handler = createLocationBriefingHandler({ now: () => time, load: async () => { calls++; return { ...payload, sources: [{ status: 'unavailable' }] }; } });
  await request(handler); time += 120001; await request(handler); assert.equal(calls, 2);
  const failure = await request(createLocationBriefingHandler({ load: async () => { throw new Error('private upstream token'); } }));
  assert.equal(failure.statusCode, 502); assert.doesNotMatch(JSON.stringify(failure), /private upstream token/);
});
