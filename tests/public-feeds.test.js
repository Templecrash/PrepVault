import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import weather from '../api/weather/current.js';
import news from '../api/news/feed.js';
import { readFeedCoordinates } from '../api/_lib/public-feed.js';

function response() {
  return { headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, end() { return this; },
  };
}
async function request(handler, query = {}, method = 'GET') {
  const res = response(); await handler({ query, method, headers: {} }, res); return res;
}
function environment(t, key, value) {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
}

test('public feeds load without Supabase and explain absent provider configuration', async t => {
  environment(t, 'OPENWEATHERMAP_API_KEY', undefined); environment(t, 'GNEWS_API_KEY', undefined);
  for (const res of [await request(weather, { lat: '0', lng: '0' }), await request(news)]) {
    assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'not_configured');
    assert.match(res.headers['cache-control'], /private, no-store/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  }
});

test('feeds accept only public read methods before attempting provider access', async () => {
  for (const handler of [weather, news]) {
    assert.equal((await request(handler, {}, 'POST')).statusCode, 405);
    assert.equal((await request(handler, {}, 'OPTIONS')).statusCode, 204);
  }
});

test('coordinate validation preserves zero and rejects partial, malformed and out-of-range values', () => {
  assert.deepEqual(readFeedCoordinates({ lat: '0', lng: '0' }, true), { lat: 0, lng: 0 });
  assert.equal(readFeedCoordinates({}), null);
  for (const value of [{}, { lat: '1' }, { lat: '', lng: '2' }, { lat: '91', lng: '2' }, { lat: '1', lng: '-181' }, { lat: 'NaN', lng: '2' }, { lat: ['1'], lng: '2' }]) assert.throws(() => readFeedCoordinates(value, true));
});

test('weather relays a successful provider response with a real source and timestamp', async t => {
  environment(t, 'OPENWEATHERMAP_API_KEY', 'test-key');
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    urls.push(url); assert.ok(options.signal);
    return { ok: true, json: async () => ({ current: { temp: 0, feels_like: -2, humidity: 50, wind_speed: 2, wind_deg: 0, weather: [{ description: 'clear', icon: '01d' }] }, daily: [], alerts: [] }) };
  });
  const res = await request(weather, { lat: '12.3456', lng: '56.789' });
  assert.equal(res.statusCode, 200); assert.equal(res.body.current.temp, 0);
  assert.equal(res.body.source, 'openweathermap-3.0'); assert.ok(Date.parse(res.body.fetchedAt));
  assert.equal(urls.length, 1); assert.match(urls[0], /lat=12\.3456&lon=56\.789/);
});

test('weather provider failures return unavailable rather than fake data or leaked upstream details', async t => {
  environment(t, 'OPENWEATHERMAP_API_KEY', 'test-key');
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('secret provider response'); });
  const res = await request(weather, { lat: '20.123', lng: '80.123' });
  assert.equal(res.statusCode, 502); assert.equal(res.body.code, 'provider_unavailable');
  assert.equal(res.body.current, undefined); assert.doesNotMatch(JSON.stringify(res), /secret provider/);
});

test('news validates request bounds and uses a successful empty provider result without invented articles', async t => {
  environment(t, 'GNEWS_API_KEY', 'test-key');
  t.mock.method(globalThis, 'fetch', async (_url, options) => { assert.ok(options.signal); return { ok: true, json: async () => ({ articles: [] }) }; });
  assert.equal((await request(news, { q: 'x'.repeat(201) })).statusCode, 400);
  assert.equal((await request(news, { country: 'ca&apikey=other' })).statusCode, 400);
  const res = await request(news, { q: 'test-empty-feed', country: 'CA' });
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body.articles, []);
  assert.equal(res.body.country, 'ca'); assert.equal(res.body.source, 'gnews');
});

test('news provider failures are explicit without echoing private upstream details', async t => {
  environment(t, 'GNEWS_API_KEY', 'test-key');
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('secret provider response'); });
  const res = await request(news, { q: 'test-failed-feed' });
  assert.equal(res.statusCode, 502); assert.equal(res.body.code, 'provider_unavailable');
  assert.equal(res.body.articles, undefined); assert.doesNotMatch(JSON.stringify(res), /secret provider/);
});
