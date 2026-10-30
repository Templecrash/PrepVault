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

test('area requests accept coarse Unicode place labels and reject unsafe or ambiguous input', async () => {
  const contexts = []; const handler = createLocationBriefingHandler({ load: async options => { contexts.push(options.location); return payload; } });
  const query = { city: '  Montréal  ', region: 'Québec', countryCode: 'ca' };
  assert.equal((await request(handler, { query })).statusCode, 200);
  assert.deepEqual(contexts, [{ city: 'Montréal', region: 'Québec', countryCode: 'CA' }]);
  for (const invalid of [
    { city: 'Ottawa', countryCode: 'ZZ' }, { city: 'Ottawa' }, { countryCode: 'CA' },
    { city: 'Ottawa OR (war)', countryCode: 'CA' }, { city: 'https://example.com', countryCode: 'CA' },
    { city: ['Ottawa', 'Toronto'], countryCode: 'CA' }, { city: 'a'.repeat(81), countryCode: 'CA' },
    { city: 'Ottawa', countryCode: 'CA', latitude: '45.4' }, { city: '45.4,-75.7', countryCode: 'CA' },
  ]) assert.equal((await request(handler, { query: invalid })).statusCode, 400, JSON.stringify(invalid));
  const duplicate = response(); await handler({ method: 'GET', url: '/api/location-briefing?city=Ottawa&city=Toronto&countryCode=CA' }, duplicate); assert.equal(duplicate.statusCode, 400);
  assert.equal(contexts.length, 1);
});

test('coalescing and caches are isolated by city, region and country', async () => {
  const calls = []; const resolves = [];
  const handler = createLocationBriefingHandler({ load: options => { calls.push(options.location); return new Promise(resolve => resolves.push(() => resolve({ ...payload, coverageContext: options.location }))); } });
  const ottawa = { city: 'Ottawa', region: 'Ontario', countryCode: 'CA' };
  const first = request(handler, { query: ottawa });
  const equivalent = request(handler, { query: { ...ottawa, city: ' ottawa ' } });
  const other = request(handler, { query: { city: 'London', region: 'Ontario', countryCode: 'CA' } });
  const abroad = request(handler, { query: { city: 'London', region: 'England', countryCode: 'GB' } });
  assert.equal(calls.length, 3); resolves.forEach(resolve => resolve());
  assert.equal((await first).body.coverageContext.city, 'Ottawa'); assert.equal((await equivalent).body.coverageContext.city, 'ottawa');
  assert.equal((await other).body.coverageContext.countryCode, 'CA'); assert.equal((await abroad).body.coverageContext.countryCode, 'GB');
  await request(handler, { query: ottawa }); assert.equal(calls.length, 3);
});

test('public area refreshes have bounded concurrency and a bounded cache', async () => {
  let time = 1; let calls = 0; const resolves = [];
  const handler = createLocationBriefingHandler({ now: () => time, load: () => { calls++; return new Promise(resolve => resolves.push(() => resolve(payload))); } });
  const query = i => ({ city: `City ${i}`, countryCode: 'CA' });
  const active = [1, 2, 3, 4].map(i => request(handler, { query: query(i) }));
  const limited = await request(handler, { query: query(5) }); assert.equal(limited.statusCode, 429); assert.equal(limited.headers['retry-after'], '60');
  resolves.forEach(resolve => resolve()); await Promise.all(active);
  for (let i = 5; i <= 34; i++) { if (i === 17 || i === 33) time += 60_001; const pending = request(handler, { query: query(i) }); resolves.at(-1)(); await pending; }
  const before = calls; const evicted = request(handler, { query: query(1) }); resolves.at(-1)(); await evicted; assert.equal(calls, before + 1);
});

test('distinct-area refresh budget does not block cache reads and resets after one minute', async () => {
  let time = 1; let calls = 0;
  const handler = createLocationBriefingHandler({ now: () => time, load: async () => { calls++; return payload; } });
  for (let i = 0; i < 16; i++) assert.equal((await request(handler, { query: { city: `City ${i}`, countryCode: 'CA' } })).statusCode, 200);
  assert.equal((await request(handler, { query: { city: 'Another City', countryCode: 'CA' } })).statusCode, 429);
  assert.equal((await request(handler, { query: { city: 'City 0', countryCode: 'CA' } })).statusCode, 200); assert.equal(calls, 16);
  time += 60_001;
  assert.equal((await request(handler, { query: { city: 'Another City', countryCode: 'CA' } })).statusCode, 200); assert.equal(calls, 17);
});
