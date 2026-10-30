import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCommunityUpdates } from '../api/_lib/community-updates.js';
import { createCommunityUpdatesHandler } from '../api/community-updates.js';
const NOW = Date.parse('2026-10-29T16:00:00Z');
const location = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const xPost = n => ({ id: String(n), title: 'Toronto road closure', url: `https://news.google.com/rss/articles/test${n}`, sourceDate: new Date(NOW - 3600000).toISOString(), dateBasis: 'index', source: 'X · public index', category: 'transport' });
const redditPost = { id: 'reddit', title: 'Toronto transit disruption', url: 'https://www.reddit.com/r/toronto/comments/abc123/transit/', publishedAt: new Date(NOW - 7200000).toISOString(), source: 'Reddit · r/toronto', category: 'transport' };
const fixture = posts => ({ source: { id: 'source', name: 'Source', status: 'ready' }, posts });
test('combines public sources while preserving date provenance and showing both sources', async () => {
  const data = await loadCommunityUpdates({ location, now: () => NOW, loadX: async () => fixture([1, 2, 3, 4, 5].map(xPost)), loadReddit: async () => fixture([redditPost]) });
  assert.equal(data.posts.length, 6);
  assert.ok(data.posts.slice(0, 4).some(post => post.kind === 'reddit'));
  assert.equal(data.posts.find(post => post.kind === 'x').dateBasis, 'index');
  assert.equal(data.posts.find(post => post.kind === 'reddit').dateBasis, 'published');
  assert.deepEqual(data.location, location);
});
test('partial failures preserve the other source without leaking exception details', async () => {
  const data = await loadCommunityUpdates({ location, now: () => NOW, loadX: async () => { throw Error('secret token'); }, loadReddit: async () => fixture([redditPost]) });
  assert.equal(data.posts.length, 1); assert.equal(data.sources[0].status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(data), /secret token/);
});
test('equivalent cross-post headlines do not crowd the brief and raw shortened links are removed', async () => {
  const title = 'Two people injured after shooting at home in Toronto Bridle Path neighbourhood';
  const data = await loadCommunityUpdates({ location, now: () => NOW,
    loadX: async () => fixture([{ ...xPost(1), title: `${title} https://t.co/example` }]),
    loadReddit: async () => fixture([{ ...redditPost, title: title.replace('at home', 'a home') }]) });
  assert.equal(data.posts.length, 1);
  assert.equal(data.posts[0].title, title);
});
test('unsafe, duplicated, old and future records do not enter the combined response', async () => {
  const post = xPost(1);
  const bad = [post, post, { ...post, url: 'https://evil.example/item' }, { ...post, url: 'https://news.google.com/redirect?url=evil' }, { ...xPost(3), sourceDate: new Date(NOW + 86400000).toISOString() }, { ...xPost(4), sourceDate: new Date(NOW - 8 * 86400000).toISOString() }];
  const data = await loadCommunityUpdates({ location, now: () => NOW, loadX: async () => fixture(bad), loadReddit: async () => fixture([]) });
  assert.equal(data.posts.length, 1);
});
const response = () => ({ headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k.toLowerCase()] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }, end() {} });
async function request(handler, query = location, extras = {}) { const res = response(); await handler({ method: 'GET', query, ...extras }, res); return res; }
test('public endpoint caches/coalesces city requests and never requires account credentials', async () => {
  let calls = 0; let release;
  const handler = createCommunityUpdatesHandler({ now: () => NOW, load: async () => { calls++; await new Promise(resolve => { release = resolve; }); return { sources: [{ status: 'ready' }], posts: [] }; } });
  const a = request(handler); const b = request(handler);
  await new Promise(resolve => setTimeout(resolve, 0)); release();
  const results = await Promise.all([a, b]); await request(handler);
  assert.equal(calls, 1); assert.equal(results[0].statusCode, 200);
  assert.equal(results[0].headers['cache-control'], 'private, no-store');
});
test('invalid query, duplicate fields, and non-read methods do not reach public providers', async () => {
  let calls = 0; const handler = createCommunityUpdatesHandler({ load: async () => { calls++; return {}; } });
  for (const query of [{}, { ...location, city: ['Toronto', 'London'] }, { ...location, city: 'Toronto OR 1=1' }, { ...location, lat: '43.5' }, { ...location, url: 'https://evil.example' }]) assert.equal((await request(handler, query)).statusCode, 400);
  assert.equal((await request(handler, location, { url: '/api/community-updates?city=Toronto&city=London' })).statusCode, 400);
  assert.equal((await request(handler, location, { method: 'POST' })).statusCode, 405);
  assert.equal(calls, 0);
});
