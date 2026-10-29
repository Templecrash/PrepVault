import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTorontoPoliceCalls, parseTorontoCityNews, localUpdateArea, loadLocalUpdates, fetchLocalUpdateSource, TORONTO_LOCAL_SOURCES, classifyLocalUpdate } from '../api/_lib/local-updates.js';

const NOW = Date.parse('2026-10-29T19:00:00Z');
const TORONTO = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const call = (values = {}) => ({ attributes: { OBJECTID: 1, OCCURRENCE_TIME: NOW - 600_000, CALL_TYPE: 'COLLISION', CROSS_STREETS: 'FRONT ST - YONGE ST', LATITUDE: 43.647, LONGITUDE: -79.377, ...values } });
const cityRow = (title = 'Road closures after a water main break', date = 'Oct 29, 2026', url = 'https://www.toronto.ca/news/road-closure/') => `<tr><td><a href="${url}">${title}</a></td><td>${date}</td><td>News Release</td></tr>`;
const cityPage = rows => `<html><body class="post-type-archive-news"><table class="cot-table"><caption>List of Media Room Items</caption><thead><tr><th>Title</th><th>Date Released</th></tr></thead>${rows}</table></body></html>`;

test('Toronto official feeds only match the selected Toronto, Ontario, Canada jurisdiction', () => {
  assert.equal(localUpdateArea(TORONTO), 'toronto');
  for (const region of ['', 'ON', 'ontario']) assert.equal(localUpdateArea({ ...TORONTO, city: 'TORONTO', region }), 'toronto');
  for (const location of [{ ...TORONTO, city: 'London' }, { ...TORONTO, region: 'New South Wales', countryCode: 'AU' }, { ...TORONTO, region: 'Ohio', countryCode: 'US' }, { ...TORONTO, region: 'Quebec' }]) assert.equal(localUpdateArea(location), null);
});
test('public calls retain source occurrence UTC time, reported status, safe streets and deterministic IDs', () => {
  const first = parseTorontoPoliceCalls({ features: [call()], exceededTransferLimit: true }, NOW);
  const second = parseTorontoPoliceCalls({ features: [call({ OBJECTID: 99 })] }, NOW);
  assert.equal(first.updates[0].id, second.updates[0].id);
  assert.equal(first.updates[0].publishedAt, new Date(NOW - 600_000).toISOString());
  assert.equal(first.updates[0].timestampBasis, 'reported');
  assert.equal(first.updates[0].status, 'reported');
  assert.equal(first.updates[0].kind, 'police');
  assert.equal(first.updates[0].category, 'transport');
  assert.equal(first.updates[0].area, 'FRONT ST - YONGE ST');
  assert.equal(first.truncated, true);
  assert.equal(first.updates[0].url, TORONTO_LOCAL_SOURCES[0].url);
  assert.doesNotMatch(JSON.stringify(first), /LATITUDE|LONGITUDE|43\.647|-79\.377|OBJECTID/);
});
test('police filtering excludes stale/future calls, administrative records, duplicate IDs and withheld/sentinel locations', () => {
  const { updates } = parseTorontoPoliceCalls({ features: [
    call(), call(), call({ OCCURRENCE_TIME: NOW - 4 * 3600_000 - 1 }), call({ OCCURRENCE_TIME: NOW + 300_001 }),
    call({ LATITUDE: -0.0430789, LONGITUDE: -131.2101176, CROSS_STREETS: ' - ' }),
    call({ CROSS_STREETS: ' - ' }), call({ CALL_TYPE: 'ADMINISTRATION' }), call({ CALL_TYPE: 'ROBBERY', CROSS_STREETS: 'QUEEN ST - ' }),
  ] }, NOW);
  assert.equal(updates.length, 2);
  assert.equal(updates.find(row => row.title.startsWith('ROBBERY')).area, 'QUEEN ST');
  assert.ok(updates.every(row => row.status !== 'active'));
});
test('malformed police payloads are unavailable, while genuinely empty and valid filtered feeds remain empty', () => {
  for (const data of [null, {}, { error: { message: 'not authorized' }, features: [] }, { features: {} }, { features: [null] }, { features: [call({ OCCURRENCE_TIME: '1793303061000' })] }]) assert.throws(() => parseTorontoPoliceCalls(data, NOW));
  assert.deepEqual(parseTorontoPoliceCalls({ features: [] }, NOW), { updates: [], truncated: false });
  assert.equal(parseTorontoPoliceCalls({ features: [call({ CALL_TYPE: 'ADMINISTRATION' })] }, NOW).updates.length, 0);
  assert.equal(parseTorontoPoliceCalls({ features: [null, call()] }, NOW).updates.length, 1);
});
test('City archive preserves day precision, cleans titles and links, and only includes recent operational notices', () => {
  const result = parseTorontoCityNews(cityPage([
    cityRow('Road closures &amp; traffic disruption', undefined, 'https://www.toronto.ca/news/road-closure/?utm_source=email#top'),
    cityRow('Water main break disrupts service', 'Oct 28, 2026', '/news/water-main/'),
    cityRow('Council celebrates award winners'), cityRow('Flood warning', 'Oct 10, 2026'),
    cityRow('Power outage', 'Oct 30, 2026'), cityRow('Health warning', 'not a date'),
    cityRow('Fire at apartment building', 'Oct 29, 2026', 'https://evil.example/news/fire/'),
  ].join('')), NOW);
  assert.equal(result.updates.length, 2);
  const first = result.updates[0];
  assert.equal(first.title, 'Road closures & traffic disruption');
  assert.equal(first.url, 'https://www.toronto.ca/news/road-closure/');
  assert.equal(first.publishedAt, '2026-10-29');
  assert.equal(first.datePrecision, 'day');
  assert.equal(first.publishedTimezone, 'America/Toronto');
  assert.equal(first.timestampBasis, 'published');
});
test('City date-only notices use the Toronto calendar day, not an invented midnight publication time', () => {
  const justAfterUtcMidnight = Date.parse('2026-10-30T01:00:00Z'); // Still October 29 in Toronto.
  const rows = parseTorontoCityNews(cityPage(cityRow('Flood warning', 'Oct 30, 2026') + cityRow('Power outage', 'Oct 29, 2026', '/news/power/')), justAfterUtcMidnight).updates;
  assert.deepEqual(rows.map(row => row.publishedAt), ['2026-10-29']);
});
test('City block pages or changed/broken markup do not masquerade as an empty feed', () => {
  for (const html of ['<html>403 denied</html>', '<body class="post-type-archive-news">No table</body>', cityPage(cityRow('Flood warning', 'Feb 31, 2026'))]) assert.throws(() => parseTorontoCityNews(html, NOW));
  assert.deepEqual(parseTorontoCityNews(cityPage(''), NOW), { updates: [], truncated: false });
});
test('operational filters distinguish useful safety notices from ceremonial/policy headlines', () => {
  for (const title of ['Extreme cold warning', 'Flooding closes roads', 'Power outage affects residents', 'Health advisory for measles outbreak', 'Fire at residential building', 'Northbound Don Valley Parkway closed overnight']) assert.ok(classifyLocalUpdate(title, 'city'), title);
  for (const title of ['BREAK & ENTER', 'SOUND OF GUNSHOTS', 'IMPAIRED DRIVER']) assert.ok(classifyLocalUpdate(title, 'police'), title);
  for (const title of ['City certifies election results', 'Mayor celebrates new fire chief', 'Tree of the year announced', 'Council approves housing budget']) assert.equal(classifyLocalUpdate(title, 'city'), null, title);
});
test('source loading succeeds independently, labels unavailable/empty truthfully and does not expose internal errors', async () => {
  const result = await loadLocalUpdates({ location: TORONTO, now: () => NOW, fetchImpl: async url => url.includes('services.arcgis.com') ? new Response(JSON.stringify({ features: [call()] })) : new Response('private upstream trace', { status: 503 }) });
  assert.equal(result.updates.length, 1);
  assert.equal(result.sources[0].status, 'ready');
  assert.equal(result.sources[1].status, 'unavailable');
  assert.equal(result.location.city, 'Toronto');
  assert.equal(result.channels.find(channel => channel.kind === 'social').url, 'https://x.com/TPSOperations');
  assert.doesNotMatch(JSON.stringify(result), /private upstream trace/);
  const empty = await loadLocalUpdates({ location: TORONTO, now: () => NOW, fetchImpl: async url => new Response(url.includes('services.arcgis.com') ? '{"features":[]}' : cityPage('')) });
  assert.ok(empty.sources.every(source => source.status === 'empty'));
  assert.equal(empty.updates.length, 0);
  assert.doesNotMatch(JSON.stringify(empty), /all.clear|no.threats|no.incidents/i);
});
test('unsupported cities never fetch Toronto or invent official channels', async () => {
  let fetched = false;
  const result = await loadLocalUpdates({ location: { city: 'Tokyo', region: 'Tokyo', countryCode: 'JP' }, now: () => NOW, fetchImpl: async () => { fetched = true; throw Error(); } });
  assert.equal(fetched, false);
  assert.equal(result.sources[0].status, 'unsupported');
  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.channels, []);
  await assert.rejects(loadLocalUpdates({ location: { ...TORONTO, url: 'https://evil.example' } }));
});
test('fetches allow only fixed source URLs, reject redirects/status/oversize, and enforce a timeout', async () => {
  const source = TORONTO_LOCAL_SOURCES[0]; let called = false;
  assert.equal(await fetchLocalUpdateSource(source.feed, { fetchImpl: async (url, init) => { called = true; assert.equal(url, source.feed); assert.equal(init.redirect, 'error'); assert.ok(init.signal); return new Response('public'); } }), 'public');
  assert.equal(called, true);
  for (const url of ['http://www.toronto.ca/news/', 'https://www.toronto.ca/other/', 'https://evil.example/', `${source.feed}&redirect=https://evil.example`]) await assert.rejects(fetchLocalUpdateSource(url, { fetchImpl: async () => assert.fail('should not fetch') }));
  for (const response of [new Response('denied', { status: 403 }), new Response('big', { headers: { 'content-length': '2000001' } }), new Response('x'.repeat(2000001))]) await assert.rejects(fetchLocalUpdateSource(source.feed, { fetchImpl: async () => response }));
  await assert.rejects(fetchLocalUpdateSource(source.feed, { timeoutMs: 1, fetchImpl: async (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true })) }));
});
