import test from 'node:test';
import assert from 'node:assert/strict';
import { redditCommunityForLocation, redditSafetyRelevance, parseRedditCommunityFeed, parseRedditIndexedFeed, fetchPublicRedditSource, loadLocalReddit, REDDIT_RSS_SUNSET } from '../api/_lib/local-reddit.js';

const NOW = Date.parse('2026-10-29T20:00:00Z');
const location = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const community = redditCommunityForLocation(location);
const entry = ({ id = 't3_abc123', title = 'Power outage in Toronto', published = '2026-10-29T19:00:00+00:00', updated = published, url = 'https://www.reddit.com/r/toronto/comments/abc123/power_outage/', body = '' } = {}) => `<entry><id>${id}</id><title>${title}</title><published>${published}</published><updated>${updated}</updated><link href="${url}"/><content>${body}</content></entry>`;
const atom = rows => `<feed xmlns="http://www.w3.org/2005/Atom"><category term="toronto"/><updated>2026-10-29T19:59:59+00:00</updated>${rows}</feed>`;
const indexEntry = ({ title = 'Road closure after collision - Reddit', url = 'https://news.google.com/rss/articles/CBMiABC_123?oc=5', date = 'Thu, 29 Oct 2026 19:00:00 GMT', publisher = 'https://www.reddit.com/' } = {}) => `<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate><source url="${publisher}">Reddit</source></item>`;
const rss = rows => `<rss><channel><title>Reddit indexed headlines</title>${rows}</channel></rss>`;

test('community mapping is restricted to Toronto Ontario Canada, not similarly named cities', () => {
  assert.equal(community.community, 'toronto');
  assert.equal(redditCommunityForLocation({ ...location, region: 'ON', city: 'TORONTO' }).community, 'toronto');
  assert.equal(redditCommunityForLocation({ ...location, region: '' }).community, 'toronto');
  for (const other of [{ ...location, city: 'Ottawa' }, { ...location, region: 'Quebec' }, { ...location, countryCode: 'AU' }]) assert.equal(redditCommunityForLocation(other), null);
});
test('title-only relevance matches concrete safety topics without ranking routine politics or scenery as emergencies', () => {
  for (const title of ['Evacuation order after apartment fire', 'Power outage downtown', 'Flash flood warning', 'Shooting near station', 'Home invasions rising', 'Road closure', 'Measles outbreak', 'Fraud charges laid']) assert.ok(redditSafetyRelevance(title), title);
  for (const title of ['Fog over the skyline', 'Municipal election results', 'New fire chief appointed', 'Police department budget', 'Security guard job listings', 'Flood of new restaurant reviews', "Crypto King found guilty of fraud at his jury trial", 'Man sentenced in downtown stabbing', 'Anniversary of Toronto shooting', 'Filming a shooting scene downtown']) assert.equal(redditSafetyRelevance(title), null, title);
  assert.ok(redditSafetyRelevance('Police warn public after convicted attacker escapes'));
  assert.ok(redditSafetyRelevance('Boil water advisory').rank > redditSafetyRelevance('Fraud charges laid').rank);
});
test('direct RSS retains real post creation dates, canonical permalinks and unverified labels without bodies or authors', () => {
  const [post] = parseRedditCommunityFeed(atom(entry({ body: 'Private-looking post body and author metadata' })), community, NOW);
  assert.equal(post.publishedAt, '2026-10-29T19:00:00.000Z');
  assert.equal(post.dateBasis, 'published');
  assert.equal(post.sourceDate, null);
  assert.equal(post.url, 'https://www.reddit.com/r/toronto/comments/abc123/');
  assert.equal(post.community, 'r/toronto');
  assert.equal(post.verified, false);
  assert.equal(post.source, 'Reddit');
  assert.equal(post.author, undefined);
  assert.equal(post.body, undefined);
});
test('stale posts cannot be refreshed by an edit; future, unrelated, duplicate and cross-community entries are excluded', () => {
  const posts = parseRedditCommunityFeed(atom([
    entry(), entry(), entry({ id: 't3_old', url: 'https://www.reddit.com/r/toronto/comments/old/', published: '2026-10-01T12:00:00Z', updated: '2026-10-29T19:00:00Z' }),
    entry({ id: 't3_future', url: 'https://www.reddit.com/r/toronto/comments/future/', published: '2026-10-30T19:00:00Z' }),
    entry({ id: 't3_wrong', url: 'https://www.reddit.com/r/ottawa/comments/wrong/' }),
    entry({ id: 't3_other', url: 'https://www.reddit.com/r/toronto/comments/other/', title: 'New city skyline photo' }),
    entry({ id: 't3_mismatch', url: 'https://www.reddit.com/r/toronto/comments/different/' }),
  ].join('')), community, NOW);
  assert.equal(posts.length, 1);
});
test('RSS parser rejects wrong communities, block pages, XML entities and completely malformed entries', () => {
  for (const xml of ['<html>403 forbidden</html>', atom(entry()).replace('term="toronto"', 'term="ottawa"'), '<!DOCTYPE feed [<!ENTITY secret SYSTEM "file:///secret">]>' + atom(entry()), atom(entry({ published: 'not-date' }))]) assert.throws(() => parseRedditCommunityFeed(xml, community, NOW));
  assert.deepEqual(parseRedditCommunityFeed(atom(''), community, NOW), []);
  assert.equal(parseRedditCommunityFeed(atom(entry({ published: 'invalid' }) + entry()), community, NOW).length, 1);
});
test('heuristic ordering is explicit and bounded; no votes or fabricated popularity are returned', () => {
  const posts = parseRedditCommunityFeed(atom(Array.from({ length: 15 }, (_, index) => entry({ id: `t3_id${index}`, url: `https://www.reddit.com/r/toronto/comments/id${index}/`, title: index === 14 ? 'Evacuation order downtown' : 'Fraud warning' })).join('')), community, NOW);
  assert.equal(posts.length, 10);
  assert.equal(posts[0].title, 'Evacuation order downtown');
  assert.equal(posts[0].score, undefined);
});
test('index fallback preserves index-supplied date separately and exposes only Google News links', () => {
  const [post] = parseRedditIndexedFeed(rss(indexEntry()), community, NOW);
  assert.equal(post.publishedAt, null);
  assert.equal(post.sourceDate, '2026-10-29T19:00:00.000Z');
  assert.equal(post.dateBasis, 'index');
  assert.equal(post.source, 'Reddit via Google News');
  assert.equal(post.url, 'https://news.google.com/rss/articles/CBMiABC_123');
  assert.equal(post.title, 'Road closure after collision');
  assert.equal(post.verified, false);
});
test('index rejects forged publishers, arbitrary redirects and malformed feeds', () => {
  for (const row of [indexEntry({ publisher: 'https://evil.example/' }), indexEntry({ publisher: 'javascript://www.reddit.com' }), indexEntry({ url: 'https://evil.example/rss/articles/CBMiABC' }), indexEntry({ url: 'https://news.google.com/redirect?to=evil' })]) assert.throws(() => parseRedditIndexedFeed(rss(row), community, NOW));
  assert.deepEqual(parseRedditIndexedFeed(rss(''), community, NOW), []);
  assert.deepEqual(parseRedditIndexedFeed(rss(indexEntry({ date: 'Thu, 1 Oct 2026 19:00:00 GMT' })), community, NOW), []);
});
test('working direct feed makes one credential-free request and returns real posts', async () => {
  const calls = [];
  const result = await loadLocalReddit({ location, now: () => NOW, fetchImpl: async (url, options) => { calls.push(url); assert.equal(options.credentials, 'omit'); assert.equal(options.headers.Authorization, undefined); assert.equal(options.redirect, 'error'); return new Response(atom(entry())); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], community.feed);
  assert.equal(result.source.status, 'ready');
  assert.equal(result.posts.length, 1);
  assert.equal(result.sources.length, 1);
  assert.match(result.source.note, /November 13/);
});
test('blocked or empty direct RSS uses one public-index fallback and preserves both coverage statuses', async () => {
  for (const response of [new Response('denied', { status: 403 }), new Response(atom(''))]) {
    const calls = [];
    const result = await loadLocalReddit({ location, now: () => NOW, fetchImpl: async url => { calls.push(url); return calls.length === 1 ? response : new Response(rss(indexEntry())); } });
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[1]).hostname, 'news.google.com');
    assert.equal(result.posts[0].dateBasis, 'index');
    assert.equal(result.sources.length, 2);
    assert.ok(['unavailable', 'empty'].includes(result.sources[0].status));
    assert.equal(result.source.status, 'ready');
  }
});
test('after the announced RSS sunset, only the index is queried; no alternate Reddit host or bypass is attempted', async () => {
  const calls = [];
  const result = await loadLocalReddit({ location, now: () => REDDIT_RSS_SUNSET, fetchImpl: async url => { calls.push(url); return new Response(rss('')); } });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).hostname, 'news.google.com');
  assert.equal(result.sources[0].status, 'unavailable');
  assert.match(result.sources[0].error, /support has ended/);
  assert.equal(result.source.status, 'empty');
  assert.deepEqual(result.posts, []);
});
test('unsupported locations and provider failures are explicit and never invent posts', async () => {
  let fetched = false;
  const unsupported = await loadLocalReddit({ location: { ...location, city: 'Tokyo', countryCode: 'JP' }, now: () => NOW, fetchImpl: async () => { fetched = true; } });
  assert.equal(fetched, false);
  assert.equal(unsupported.source.status, 'unsupported');
  const failed = await loadLocalReddit({ location, now: () => NOW, fetchImpl: async () => { throw Error('raw private debug error'); } });
  assert.equal(failed.source.status, 'unavailable');
  assert.equal(failed.posts.length, 0);
  assert.doesNotMatch(JSON.stringify(failed), /raw private debug/);
  await assert.rejects(loadLocalReddit({ location: { ...location, url: 'https://evil.example' } }));
});
test('public fetch is byte/time bounded and only accepts the two exact allowlisted URLs', async () => {
  for (const url of ['https://www.reddit.com/r/other/new/.rss?limit=100', 'https://evil.example', community.feed + '&secret=1']) await assert.rejects(fetchPublicRedditSource(url, { fetchImpl: async () => assert.fail('no fetch expected') }));
  for (const response of [new Response('denied', { status: 403 }), new Response('large', { headers: { 'content-length': '1000001' } }), new Response('x'.repeat(1000001))]) await assert.rejects(fetchPublicRedditSource(community.feed, { fetchImpl: async () => response }));
  await assert.rejects(fetchPublicRedditSource(community.feed, { timeoutMs: 1, fetchImpl: async (_url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true })) }));
});
