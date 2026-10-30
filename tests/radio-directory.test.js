import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDirectoryStations, normalizeRadioLocation, readRadioLocation, radioDirectoryRequest } from '../src/radio-directory.js';
import { createRadioDirectoryHandler } from '../api/radio/directory.js';

const location = { countryCode: 'CA', country: 'Canada', state: 'Ontario' };
const station = { stationuuid: 'station-1', name: 'Public radio', countrycode: 'CA', state: 'Ontario', lastcheckok: 1, hls: 0, codec: 'MP3', url_resolved: 'https://radio.example/live.mp3', homepage: 'https://radio.example', tags: 'news' };
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }, end() {} }; }
test('directory keeps region-matched HTTPS direct audio and rejects unsupported streams', () => {
  const rows = [station, station, ...[{ countrycode: 'US' }, { state: 'Alberta' }, { lastcheckok: 0 }, { hls: 1 }, { codec: 'UNKNOWN' }, { url_resolved: 'http://radio.example/live' }, { url_resolved: 'https://radio.example/live.m3u' }, { url_resolved: 'https://127.0.0.1/audio' }, { url_resolved: 'https://user:pass@radio.example/audio' }].map((patch, i) => ({ ...station, stationuuid: `bad-${i}`, ...patch }))];
  assert.equal(normalizeDirectoryStations(rows, location).length, 1);
  assert.equal(normalizeDirectoryStations(rows, location)[0].id, 'directory-station-1');
  assert.equal(normalizeDirectoryStations([{ ...station, state: ' Ontario ' }], location).length, 1);
});
test('location preferences validate and corrupted storage falls back without sharing location', () => {
  assert.deepEqual(normalizeRadioLocation(location), location);
  assert.throws(() => normalizeRadioLocation({ ...location, countryCode: '../metadata' }));
  assert.equal(readRadioLocation({ getItem: () => '{bad' }).countryCode, '');
});
test('directory request carries only explicit public location and no account cookies', async () => {
  let call;
  const entries = await radioDirectoryRequest('stations', { ...location, secret: 'private' }, { fetchImpl: async (...args) => { call = args; return Response.json({ entries: [station] }); } });
  assert.equal(entries.length, 1);
  assert.equal(call[1].credentials, 'omit'); assert.ok(!call[0].includes('private'));
});
test('API uses fixed upstream, encoded region filters, normalized output and bounded caching', async () => {
  const calls = []; const handler = createRadioDirectoryHandler({ fetchImpl: async (...args) => { calls.push(args); return Response.json([station]); } });
  for (let i = 0; i < 2; i++) {
    const res = response(); await handler({ method: 'GET', query: { action: 'stations', ...location } }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.entries[0].id, 'directory-station-1');
  }
  assert.equal(calls.length, 1); assert.equal(new URL(calls[0][0]).hostname, 'de1.api.radio-browser.info');
  assert.equal(new URL(calls[0][0]).searchParams.get('countrycode'), 'CA');
  assert.equal(calls[0][1].headers.Cookie, undefined); assert.equal(calls[0][1].redirect, 'error');
});
test('invalid queries and provider outages fail without fake stations', async () => {
  let calls = 0; const handler = createRadioDirectoryHandler({ fetchImpl: async () => { calls++; throw new Error('private upstream detail'); } });
  const invalid = response(); await handler({ method: 'GET', query: { action: 'stations', url: 'http://metadata' } }, invalid);
  assert.equal(invalid.statusCode, 400); assert.equal(calls, 0);
  const failed = response(); await handler({ method: 'GET', query: { action: 'countries' } }, failed);
  assert.equal(failed.statusCode, 502); assert.equal(calls, 2); assert.ok(!JSON.stringify(failed.body).includes('private'));
});
