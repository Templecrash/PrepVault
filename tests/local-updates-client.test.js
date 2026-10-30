import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocalUpdates, recentPostsUrl, localUpdateDate, getLocalUpdates } from '../src/local-updates.js';
import { normalizeLocalPosts } from '../src/local-posts.js';
const location = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const payload = { location, fetchedAt: '2026-10-29T12:00:00Z', sources: [], updates: [] };
test('public updates reject cross-city results, unsafe links and malformed records', () => {
  assert.throws(() => normalizeLocalUpdates({ ...payload, location: { ...location, city: 'Ottawa' } }, location));
  const row = { id: 'one', title: 'Police advisory', url: 'https://www.tps.ca/advisory', publishedAt: '2026-10-29', datePrecision: 'day', kind: 'police' };
  const result = normalizeLocalUpdates({ ...payload, updates: [row, { ...row, url: 'javascript:alert(1)' }, { ...row, publishedAt: 'invalid' }, { ...row, kind: 'rumour' }], channels: [{ name: 'Bad', url: 'http://unsafe.test' }] }, location);
  assert.equal(result.updates.length, 1); assert.equal(result.channels.length, 0);
  assert.ok(localUpdateDate(result.updates[0]).includes('29'));
});
test('X links use live search, coarse selected city, and recent dates', () => {
  const link = new URL(recentPostsUrl(location, Date.parse('2026-10-29T12:00:00Z')));
  assert.equal(link.origin, 'https://x.com'); assert.equal(link.searchParams.get('f'), 'live');
  assert.match(link.searchParams.get('q'), /"Toronto"/); assert.match(link.searchParams.get('q'), /"Ontario" OR "Canada"/); assert.match(link.searchParams.get('q'), /since:2026-10-27/);
  assert.throws(() => recentPostsUrl({ ...location, city: 'Toronto" OR anything' }));
});
test('public reads use no credentials and preserve source errors', async () => {
  const result = await getLocalUpdates(location, { fetchImpl: async (url, options) => { assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.match(url, /city=Toronto/); return Response.json(payload); } });
  assert.equal(result.location.city, 'Toronto');
  await assert.rejects(getLocalUpdates(location, { fetchImpl: async () => Response.json({ error: 'Try later' }, { status: 429 }) }), /Try later/);
});
test('X response normalization fixes permalinks and drops invalid authors, IDs and wrong cities', () => {
  const data = { ...payload, configured: true, posts: [{ id: '123', text: 'Road closed', createdAt: payload.fetchedAt, url: 'javascript:bad', author: { username: 'TPSOperations', name: 'Toronto Police Operations' } }, { id: '456', text: 'bad', createdAt: payload.fetchedAt, author: { username: '../unsafe' } }] };
  const result = normalizeLocalPosts(data, location); assert.equal(result.posts.length, 1); assert.equal(result.posts[0].url, 'https://x.com/TPSOperations/status/123');
  assert.throws(() => normalizeLocalPosts({ ...data, location: { ...location, city: 'Ottawa' } }, location));
});
