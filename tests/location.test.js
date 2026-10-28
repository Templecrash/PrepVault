import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationHandler } from '../api/location.js';
import { fetchPublicJson, loadConditions, normalizeForecast, normalizeGovernmentAlerts } from '../api/_lib/local-conditions.js';
import { LOCATION_KEY, normalizeLocation, readLocation, saveLocation, searchLocations, getLocalConditions, locationConsiderations } from '../src/location.js';

const NOW = Date.parse('2026-10-28T08:00:00Z');
const point = { id: '6167865', name: 'Toronto', region: 'Ontario', country: 'Canada', countryCode: 'CA', latitude: 43.65, longitude: -79.38, timezone: 'America/Toronto' };
const forecast = () => ({ timezone: 'America/Toronto', current: { time: '2026-10-28T04:00', temperature_2m: 2, wind_speed_10m: 10, wind_gusts_10m: 25, weather_code: 3 }, hourly: { time: ['2026-10-28T00:00', '2026-10-28T01:00'], temperature_2m: [3, 2], precipitation_probability: [30, null], wind_gusts_10m: [30, 55] }, daily: { time: ['2026-10-28', '2026-10-29'], temperature_2m_max: [8, 10], temperature_2m_min: [-1, 4], rain_sum: [12, 0], snowfall_sum: [0, 0], weather_code: [63, 0], wind_gusts_10m_max: [55, 20] } });
const collection = features => ({ type: 'FeatureCollection', features });
const canadian = patch => ({ type: 'Feature', id: 'ca-warning', properties: { alert_name_en: 'rainfall warning', alert_text_en: 'Rain expected. Follow the official instructions.', expiration_datetime: '2026-10-28T14:00:00Z', validity_datetime: '2026-10-28T06:00:00Z', feature_name_en: 'Toronto', risk_colour_en: 'yellow', status_en: 'issued', ...patch } });
const american = patch => ({ type: 'Feature', id: 'https://api.weather.gov/alerts/example', properties: { event: 'Flood Watch', headline: 'Flood Watch for example area', status: 'Actual', severity: 'Severe', expires: '2026-10-28T14:00:00Z', onset: '2026-10-28T10:00:00Z', description: 'Flooding is possible.', instruction: 'Follow local directions.', ...patch } });
function response() { return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() {} }; }

test('location preferences retain only selected planning fields and recover from damaged storage', () => {
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(saveLocation(storage, { ...point, token: 'secret', homeAddress: 'private' }), point);
  assert.deepEqual(readLocation(storage), point);
  assert.ok(!values.get(LOCATION_KEY).includes('secret'));
  values.set(LOCATION_KEY, '{broken'); assert.equal(readLocation(storage), null);
  for (const patch of [{ latitude: 91 }, { longitude: Infinity }, { countryCode: '../host' }, { name: '' }, { latitude: '43' }]) assert.throws(() => normalizeLocation({ ...point, ...patch }));
});

test('forecast normalization preserves unknowns and returns daily dates for the calendar', () => {
  const result = normalizeForecast(forecast());
  assert.equal(result.status, 'ready'); assert.equal(result.current.humidity, null);
  assert.equal(result.hourly[1].precipitationProbability, null);
  assert.equal(result.daily.length, 2); assert.deepEqual(result.today, result.daily[0]);
  assert.equal(result.daily[1].weatherCode, 0); assert.equal(result.daily[1].windGusts, 20);
  assert.equal(result.daily[1].date, '2026-10-29');
  for (const bad of [{}, { ...forecast(), current: { temperature_2m: 0 } }, { ...forecast(), hourly: { time: [], temperature_2m: [] } }, { ...forecast(), daily: { time: [] } }]) assert.throws(() => normalizeForecast(bad), /Incomplete/);
});

test('Canadian official warnings retain active instructions and omit expired or cancelled notices', () => {
  const result = normalizeGovernmentAlerts(collection([canadian(), canadian(), canadian({ expiration_datetime: '2026-10-28T07:00:00Z' }), canadian({ status_en: 'ended' })]), 'CA', NOW);
  assert.equal(result.length, 1); assert.equal(result[0].event, 'rainfall warning');
  assert.match(result[0].description, /official instructions/); assert.equal(result[0].expires, '2026-10-28T14:00:00Z');
});

test('US alerts exclude test/cancelled/expired messages and reject unknown status instead of reporting clear', () => {
  const result = normalizeGovernmentAlerts(collection([american(), american({ status: 'Test' }), american({ messageType: 'Cancel' }), american({ expires: '2026-10-28T07:00:00Z' })]), 'US', NOW);
  assert.equal(result.length, 1); assert.equal(result[0].instruction, 'Follow local directions.');
  for (const status of [undefined, 'unrecognized']) assert.throws(() => normalizeGovernmentAlerts(collection([american({ status })]), 'US', NOW), /Invalid US alert/);
});

test('incomplete or malformed alert collections never become an all-clear result', () => {
  for (const payload of [{ features: [] }, { ...collection([]), numberMatched: 2 }, { ...collection([]), links: [{ rel: 'next' }] }, { ...collection([]), pagination: { next: 'next-page' } }, collection([{ properties: {} }])]) assert.throws(() => normalizeGovernmentAlerts(payload, 'CA', NOW));
  assert.deepEqual(normalizeGovernmentAlerts(collection([]), 'CA', NOW), []);
});

test('conditions use exact Canadian spatial intersection and bounded forecast horizon', async () => {
  const calls = [];
  const data = await loadConditions(point, { now: () => NOW, fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json(url.includes('open-meteo') ? forecast() : collection([canadian()])); } });
  assert.equal(data.weather.status, 'ready'); assert.equal(data.alerts.entries.length, 1);
  const canada = calls.find(call => call.url.includes('weather.gc.ca')); assert.equal(new URL(canada.url).searchParams.get('filter'), 'INTERSECTS(geometry, POINT(-79.38 43.65))');
  const meteo = calls.find(call => call.url.includes('open-meteo')); assert.equal(new URL(meteo.url).searchParams.get('forecast_days'), '16');
  assert.ok(new URL(meteo.url).searchParams.get('daily').includes('weather_code'));
  for (const call of calls) { assert.equal(call.options.redirect, 'error'); assert.equal(call.options.headers.Cookie, undefined); assert.ok(call.options.signal); }
});

test('provider errors and unsupported countries remain distinct from zero active alerts', async () => {
  const failed = await loadConditions(point, { now: () => NOW, fetchImpl: async url => { if (url.includes('open-meteo')) return Response.json(forecast()); throw new Error('private upstream details'); } });
  assert.equal(failed.weather.status, 'ready'); assert.equal(failed.alerts.status, 'unavailable'); assert.match(failed.alerts.error, /does not mean/); assert.ok(!JSON.stringify(failed).includes('private'));
  let calls = 0;
  const other = await loadConditions({ ...point, countryCode: 'GB' }, { now: () => NOW, fetchImpl: async () => { calls++; return Response.json(forecast()); } });
  assert.equal(other.alerts.status, 'unsupported'); assert.equal(calls, 1);
  const badForecast = await loadConditions({ ...point, countryCode: 'GB' }, { fetchImpl: async () => Response.json({}) }); assert.equal(badForecast.weather.status, 'unavailable');
});

test('public transport rejects unknown hosts, redirects and oversized provider bodies', async () => {
  let calls = 0;
  for (const url of ['http://api.weather.gov/alerts', 'https://api.weather.gov.evil.test/alerts', 'https://user:secret@api.weather.gov/alerts', 'https://127.0.0.1/']) await assert.rejects(fetchPublicJson(url, async () => { calls++; }), /Unsupported provider/);
  assert.equal(calls, 0);
  await assert.rejects(fetchPublicJson('https://api.weather.gov/alerts/active', async () => new Response('{}', { status: 302 })), /Provider unavailable/);
  await assert.rejects(fetchPublicJson('https://api.weather.gov/alerts/active', async () => new Response('{}', { headers: { 'content-length': '4000001' } })), /Provider unavailable/);
});

test('API validates location before requesting providers and keeps search input in a fixed-host parameter', async () => {
  const calls = []; const handler = createLocationHandler({ now: () => NOW, fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ results: [{ id: 6167865, name: 'Toronto', admin1: 'Ontario', country: 'Canada', country_code: 'CA', latitude: 43.65, longitude: -79.38, timezone: 'America/Toronto' }] }); } });
  for (const query of [{ action: 'conditions', lat: '91', lng: '0', countryCode: 'CA' }, { action: 'conditions', lat: '40', lng: '-70', countryCode: ['US'] }, { action: 'search', q: 'a' }, { action: 'search', q: 'Ottawa', url: 'https://metadata/' }]) { const res = response(); await handler({ method: 'GET', query }, res); assert.equal(res.statusCode, 400); }
  assert.equal(calls.length, 0);
  const res = response(); await handler({ method: 'GET', query: { action: 'search', q: 'Ottawa&url=https://metadata/' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.locations[0].name, 'Toronto');
  assert.equal(new URL(calls[0].url).hostname, 'geocoding-api.open-meteo.com'); assert.equal(new URL(calls[0].url).searchParams.get('name'), 'Ottawa&url=https://metadata/');
});

test('client requests omit credentials, drop unrelated fields and ignore a cancelled response', async () => {
  let sent;
  const data = await getLocalConditions({ ...point, token: 'private' }, { fetchImpl: async (url, options) => { sent = { url, options }; return Response.json({ fetchedAt: new Date(NOW).toISOString(), weather: { status: 'unavailable' }, alerts: { status: 'unsupported' } }); } });
  assert.equal(data.alerts.status, 'unsupported'); assert.equal(sent.options.credentials, 'omit'); assert.ok(!sent.url.includes('private'));
  const controller = new AbortController(); controller.abort(); let called = false;
  await assert.rejects(searchLocations('Ottawa', { signal: controller.signal, fetchImpl: async () => { called = true; } }), { name: 'AbortError' }); assert.equal(called, false);
  const active = new AbortController();
  await assert.rejects(searchLocations('Ottawa', { signal: active.signal, fetchImpl: async () => { active.abort(); return Response.json({ locations: [point] }); } }), { name: 'AbortError' });
});

test('planning prompts derive from recorded forecast and do not invent warnings on unavailable data', () => {
  assert.deepEqual(locationConsiderations({ weather: { status: 'unavailable' }, alerts: { status: 'unavailable', entries: [] } }), []);
  const rows = locationConsiderations({ weather: normalizeForecast(forecast()), alerts: { status: 'ready', entries: [] } }, []);
  assert.ok(rows.some(row => row.title.includes('freezing'))); assert.ok(rows.some(row => row.title.includes('power')));
  assert.ok(rows.some(row => row.title.includes('travel')));
});
