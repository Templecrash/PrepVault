import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicXSearches, loadPublicXPosts, parsePublicXIndex, publicXCategory } from '../api/_lib/public-x-posts.js';

const NOW = Date.parse('2026-10-29T20:00:00Z');
const location = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const entry = ({ title = 'SHOOTING: Police report injuries at Toronto residence', key = 'example1', date = 'Thu, 29 Oct 2026 10:09:04 GMT', source = 'https://x.com', link = `https://news.google.com/rss/articles/${key}?oc=5`, description = '' } = {}) => `<item><title>${title} - X</title><link>${link.replaceAll('&', '&amp;')}</link><pubDate>${date}</pubDate><source url="${source}">X</source><description>${description}</description></item>`;
const rss = (...items) => `<rss><channel>${items.join('')}</channel></rss>`;

test('queries use fixed public RSS, exact city/disambiguation and known account hint only for Toronto', () => {
  const searches = buildPublicXSearches(location);
  assert.equal(searches.length, 2);
  assert.match(new URL(searches[0].feed).searchParams.get('q'), /^site:x.com\/TPSOperations/);
  const query = new URL(searches[1].feed);
  assert.equal(query.origin + query.pathname, 'https://news.google.com/rss/search');
  assert.match(query.searchParams.get('q'), /"Toronto" \("Ontario" OR "Canada"\)/);
  assert.match(query.searchParams.get('q'), /when:3d$/);
  const elsewhere = buildPublicXSearches({ city: 'London', region: 'Ontario', countryCode: 'CA' });
  assert.equal(elsewhere.length, 1);
  assert.match(new URL(elsewhere[0].feed).searchParams.get('q'), /"London" \("Ontario" OR "Canada"\)/);
  assert.equal(new URL(searches[0].feed).searchParams.get('hl'), 'en-CA');
  assert.equal(new URL(buildPublicXSearches({ city: 'Tokyo', region: 'Tokyo', countryCode: 'JP' })[0].feed).searchParams.get('hl'), 'en-US');
  assert.throws(() => buildPublicXSearches({ ...location, city: 'Toronto" OR site:evil.example' }));
  assert.throws(() => buildPublicXSearches({ ...location, lat: '43.6' }));
});

test('only safety-specific visible headlines qualify, not hidden excerpts or generic police mentions', () => {
  for (const title of ['Toronto police charity fundraiser', 'Shooting a film in Toronto this weekend', 'Toronto football team faces a storm of criticism', 'My opinion of Toronto police funding', 'Toronto safety-themed merchandise sale']) assert.equal(publicXCategory(title), null, title);
  for (const title of ['SHOOTING: Police report injuries in Toronto', 'Gas leak: residents shelter in place', 'Power outage affects Toronto homes', 'Toronto winter storm warning issued', 'Collision: vehicle strikes pole and traffic lights are out', 'Toronto police warn of armed suspect', 'Health advisory after measles outbreak']) assert.ok(publicXCategory(title), title);
  assert.equal(publicXCategory('FIRE: Residential address affected, ROAD CLOSURES nearby'), 'public-safety');
  assert.equal(publicXCategory('Hazard: live wire down across Islington'), 'utilities');
  assert.deepEqual(parsePublicXIndex(rss(entry({ title: 'Toronto celebration', description: 'Police shooting with injuries' })), NOW), []);
});

test('posts expose index-listed date without claiming publication time or verified author', () => {
  const [post] = parsePublicXIndex(rss(entry({ title: '&lt;b&gt;SHOOTING:&lt;/b&gt; Police report injuries' })), NOW);
  assert.equal(post.title, 'SHOOTING: Police report injuries');
  assert.equal(post.url, 'https://news.google.com/rss/articles/example1');
  assert.equal(post.sourceDate, '2026-10-29T10:09:04.000Z');
  assert.equal(post.publishedAt, null);
  assert.equal(post.dateBasis, 'index');
  assert.equal(post.verified, false);
  assert.equal(post.author, undefined);
  assert.equal(post.source, 'X via public index');
});

test('parser rejects non-X publishers, dangerous links, old/future dates, duplicates and malformed feeds', () => {
  const xml = rss(entry(), entry(), entry({ key: 'old', date: 'Mon, 26 Oct 2026 19:59:59 GMT' }), entry({ key: 'future', date: 'Fri, 30 Oct 2026 10:00:00 GMT' }),
    entry({ key: 'news', source: 'https://newspaper.example' }), entry({ key: 'spoof', source: 'https://x.com.evil.example' }),
    entry({ key: 'evil', link: 'https://news.google.com.evil.example/rss/articles/example' }), entry({ key: 'credentials', link: 'https://secret@news.google.com/rss/articles/example' }),
    entry({ key: 'path', link: 'https://news.google.com/search?q=anything' }));
  assert.equal(parsePublicXIndex(xml, NOW).length, 1);
  for (const bad of ['<html>Access denied</html>', '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss><channel/></rss>', '<rss/>']) assert.throws(() => parsePublicXIndex(bad, NOW));
});

test('loader makes no authenticated/paid requests, deduplicates sources and bounds results', async () => {
  const calls = [];
  const result = await loadPublicXPosts({ location, now: () => NOW, fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(new URL(url).origin, 'https://news.google.com');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.signal);
    return new Response(rss(...Array.from({ length: 40 }, (_, index) => entry({ key: `post${index}` }))));
  } });
  assert.equal(calls.length, 2);
  assert.deepEqual(result.location, location);
  assert.equal(result.posts.length, 30);
  assert.equal(result.source.count, 30);
  assert.equal(result.source.status, 'ready');
  assert.equal(result.source.truncated, true);
  assert.match(result.source.note, /not a live X feed/);
});

test('older protective-action post survives many newer closures and the candidate limit', async () => {
  const closures = Array.from({ length: 42 }, (_, index) => entry({ key: `closure${index}`, title: 'Toronto road closure', date: new Date(NOW - (index + 1) * 60000).toUTCString() }));
  const emergency = entry({ key: 'protective-action', title: 'Toronto residents told to shelter in place after gas leak', date: new Date(NOW - 2 * 3600_000).toUTCString() });
  const result = await loadPublicXPosts({ location, now: () => NOW, fetchImpl: async () => new Response(rss(...closures, emergency)) });
  assert.equal(result.posts.length, 30);
  assert.equal(result.posts[0].category, 'emergency');
  assert.match(result.posts[0].url, /protective-action$/);
  assert.equal(result.source.truncated, true);
});

test('empty, partial and unavailable source states remain distinct and error details are not exposed', async () => {
  const empty = await loadPublicXPosts({ location, now: () => NOW, fetchImpl: async () => new Response(rss()) });
  assert.equal(empty.source.status, 'empty');
  let calls = 0;
  const partial = await loadPublicXPosts({ location, now: () => NOW, fetchImpl: async () => ++calls === 1 ? new Response(rss(entry())) : new Response('blocked', { status: 403 }) });
  assert.equal(partial.source.status, 'ready');
  assert.match(partial.source.error, /Some public searches/);
  const failed = await loadPublicXPosts({ location, now: () => NOW, fetchImpl: async () => { throw Error('private transport details'); } });
  assert.equal(failed.source.status, 'unavailable');
  assert.deepEqual(failed.posts, []);
  assert.equal(JSON.stringify(failed).includes('private transport'), false);
});

test('oversized source responses fail without returning invented posts', async () => {
  const result = await loadPublicXPosts({ location, now: () => NOW, fetchImpl: async () => new Response('x'.repeat(750001)) });
  assert.equal(result.source.status, 'unavailable');
  assert.deepEqual(result.posts, []);
});
