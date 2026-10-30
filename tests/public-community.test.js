import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicCommunity, normalizePublicCommunity, publicCommunityDate, publicCommunitySearches } from '../src/public-community.js';
const location = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const payload = { location, fetchedAt: '2026-10-29T12:00:00Z', sources: [{ id: 'reddit', name: 'Public Reddit', url: 'https://www.reddit.com/r/toronto/.rss', status: 'ready', count: 1 }], posts: [] };
const reddit = { id: 'reddit-1', title: 'Road closures after flooding', url: 'https://www.reddit.com/r/toronto/comments/abc123/closures/', source: 'r/toronto', kind: 'reddit', date: '2026-10-29T11:30:00Z', dateBasis: 'published', category: 'infrastructure' };
const x = { id: 'x-1', title: 'Public road closure report', url: 'https://news.google.com/rss/articles/CBMiABC_123-xyz?oc=5', source: 'X via Google News', kind: 'x', date: '2026-10-29T10:00:00Z', dateBasis: 'index', category: 'safety' };

test('public community requires the exact city tuple and strips unrelated fields', () => {
  const result = normalizePublicCommunity({ ...payload, latitude: 43, token: 'private', posts: [{ ...reddit, authorEmail: 'private' }] }, location);
  assert.equal(result.posts.length, 1);
  assert.equal(JSON.stringify(result).includes('private'), false);
  for (const patch of [{ city: 'Ottawa' }, { region: 'Quebec' }, { countryCode: 'US' }]) assert.throws(() => normalizePublicCommunity({ ...payload, location: { ...location, ...patch } }, location), /did not match/);
  assert.throws(() => normalizePublicCommunity(payload, null), /did not match/);
});

test('valid public links retain attribution and Google listing dates are not publication dates', () => {
  const result = normalizePublicCommunity({ ...payload, posts: [reddit, x, { ...x, id: 'direct-x', url: 'https://x.com/PublicReports/status/123456' }] }, location);
  assert.equal(result.posts.length, 3);
  assert.match(publicCommunityDate(result.posts[0]), /^Published /);
  assert.match(publicCommunityDate(result.posts[1]), /^Google-listed /);
  assert.equal(result.posts[1].dateBasis, 'index');
});

test('unsafe, unrelated and disguised source links are removed, including arbitrary Google routes', () => {
  const bad = ['javascript:alert(1)', 'http://www.reddit.com/r/toronto/comments/abc123/closures/', 'https://x.com.evil.test/a/status/123', 'https://user:pass@x.com/a/status/123', 'https://news.google.com/url?q=https://evil.test', 'https://news.google.com/rss/articles/../redirect', 'https://example.com/post'];
  const result = normalizePublicCommunity({ ...payload, posts: bad.map((url, index) => ({ ...x, id: String(index), url })) }, location);
  assert.deepEqual(result.posts, []);
  assert.deepEqual(normalizePublicCommunity({ ...payload, posts: [{ ...x, dateBasis: 'published' }] }, location).posts, [], 'Google wrapper must identify an index date');
});

test('unknown dates stay unknown and duplicates cannot fill the report list', () => {
  const result = normalizePublicCommunity({ ...payload, posts: [reddit, reddit, { ...x, date: null }] }, location);
  assert.equal(result.posts.length, 2);
  assert.equal(result.posts[1].date, null);
  assert.equal(publicCommunityDate(result.posts[1]), 'Listing date unavailable');
  assert.match(publicCommunityDate({ date: '2026-10-29', dateBasis: 'published' }), /^Published .*29/);
});

test('source failures and missing counts remain explicit instead of becoming successful zeroes', () => {
  const result = normalizePublicCommunity({ ...payload, sources: [null, { name: 'X public index', status: 'unavailable', error: 'Try later' }, { name: 'Other', status: 'unknown' }] }, location);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].status, 'unavailable');
  assert.equal(result.sources[0].count, null);
  assert.equal(result.sources[0].error, 'Try later');
  assert.equal(result.sources[1].status, 'unavailable');
});

test('direct searches stay city-specific and use recent public results without query injection', () => {
  const links = publicCommunitySearches(location, Date.parse(payload.fetchedAt));
  const xUrl = new URL(links.x), redditUrl = new URL(links.reddit);
  assert.equal(xUrl.origin, 'https://x.com'); assert.equal(xUrl.searchParams.get('f'), 'live');
  assert.match(xUrl.searchParams.get('q'), /"Toronto"/); assert.match(xUrl.searchParams.get('q'), /since:2026-10-27/);
  assert.equal(redditUrl.origin, 'https://www.reddit.com'); assert.equal(redditUrl.searchParams.get('sort'), 'new'); assert.equal(redditUrl.searchParams.get('t'), 'week');
  assert.match(redditUrl.searchParams.get('q'), /"Toronto"/); assert.match(redditUrl.searchParams.get('q'), /"Ontario" OR "Canada"/);
  assert.throws(() => publicCommunitySearches({ ...location, city: 'Toronto" OR anything' }));
});

test('public fetch sends only coarse location with no credentials and rejects a wrong-city response', async () => {
  const result = await getPublicCommunity({ ...location, latitude: 43, ownerId: 'private' }, { fetchImpl: async (url, options) => {
    assert.match(url, /^\/api\/community-updates\?/);
    assert.equal(new URL(url, 'https://example.test').searchParams.get('city'), 'Toronto');
    assert.equal(url.includes('private'), false); assert.equal(url.includes('latitude'), false);
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    return Response.json(payload);
  } });
  assert.equal(result.location.city, 'Toronto');
  await assert.rejects(getPublicCommunity(location, { fetchImpl: async () => Response.json({ ...payload, location: { ...location, city: 'Ottawa' } }) }), /did not match/);
});

test('cancelled requests cannot fetch or publish late results from the previous city', async () => {
  let calls = 0;
  const before = new AbortController(); before.abort();
  await assert.rejects(getPublicCommunity(location, { signal: before.signal, fetchImpl: async () => { calls++; } }), { name: 'AbortError' });
  assert.equal(calls, 0);
  const during = new AbortController();
  await assert.rejects(getPublicCommunity(location, { signal: during.signal, fetchImpl: async () => { during.abort(); return Response.json(payload); } }), { name: 'AbortError' });
  const body = new AbortController();
  await assert.rejects(getPublicCommunity(location, { signal: body.signal, fetchImpl: async () => ({ ok: true, json: async () => { body.abort(); return payload; } }) }), { name: 'AbortError' });
});

test('public source errors are surfaced without assuming a successful empty feed', async () => {
  await assert.rejects(getPublicCommunity(location, { fetchImpl: async () => Response.json({ error: 'Public index unavailable' }, { status: 502 }) }), /Public index unavailable/);
  await assert.rejects(getPublicCommunity(location, { fetchImpl: async () => new Response('<html>unavailable</html>') }), /could not be checked/);
});
