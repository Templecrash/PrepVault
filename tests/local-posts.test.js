import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalPostsRequest, fetchLocalPosts, localPostsToken, parseLocalPosts, readLocalPostsQuery } from '../api/_lib/local-posts.js';

const epoch = Date.parse('2026-10-29T20:00:00Z');
const location = { city: 'Toronto', region: 'Ontario', countryCode: 'CA' };
const token = 'private-test-token-not-real';
const user = { id: '123', username: 'TPSOperations', name: 'Toronto Police Operations' };
const post = (extra = {}) => ({ id: '987654321', author_id: user.id, text: 'Toronto road closure in Ontario', created_at: '2026-10-29T19:55:00.000Z', ...extra });
const payload = (data = [post()]) => ({ data, includes: { users: [user] }, meta: { result_count: data.length } });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('query accepts only normalized coarse location and status/search actions', () => {
  assert.deepEqual(readLocalPostsQuery({}), { action: 'status', location: null });
  assert.deepEqual(readLocalPostsQuery({ ...location, city: ' Toronto  ', countryCode: 'ca' }), { action: 'status', location });
  for (const query of [{ action: 'search' }, { ...location, query: 'from:anyone' }, { ...location, lat: '43.65' }, { ...location, city: 'Toronto" OR anything' }, { ...location, city: 'from:someone' }, { ...location, countryCode: 'ZZ' }, { ...location, action: ['search', 'status'] }, { ...location, city: ['Toronto', 'Ottawa'] }]) {
    assert.throws(() => readLocalPostsQuery(query), error => error.code === 'invalid_request');
  }
});

test('request uses only fixed X host, disambiguated place phrases and bounded recent search', () => {
  const request = buildLocalPostsRequest(location, epoch);
  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://api.x.com/2/tweets/search/recent');
  assert.match(url.searchParams.get('query'), /^"Toronto" \("Ontario" OR "Canada"\)/);
  assert.match(url.searchParams.get('query'), /-is:retweet -is:reply$/);
  assert.equal(url.searchParams.get('max_results'), '10');
  assert.equal(url.searchParams.get('sort_order'), 'recency');
  assert.equal(url.searchParams.get('start_time'), '2026-10-27T20:00:00.000Z');
  assert.equal(url.searchParams.get('end_time'), '2026-10-29T19:59:45.000Z');
  assert.equal(url.searchParams.has('next_token'), false);
  assert.match(new URL(buildLocalPostsRequest({ city: 'London', region: '', countryCode: 'CA' }, epoch).url).searchParams.get('query'), /^"London" \("Canada"\)/);
  assert.match(new URL(buildLocalPostsRequest({ city: 'And', region: '', countryCode: 'NO' }, epoch).url).searchParams.get('query'), /^"And" \("Norway"\)/);
  const unicode = buildLocalPostsRequest({ city: 'Montréal', region: 'Québec', countryCode: 'CA' }, epoch);
  assert.match(decodeURIComponent(unicode.url), /Montréal/);
});

test('parser filters stale, future, missing author, invalid IDs, replies and duplicate posts', () => {
  const request = buildLocalPostsRequest(location, epoch);
  const data = [post(), post(), post({ id: '2', created_at: '2026-10-27T19:59:59Z' }), post({ id: '3', created_at: '2026-10-29T20:00:00Z' }),
    post({ id: '4', author_id: 'unreturned' }), post({ id: '../../escape' }), post({ id: '6', created_at: 'not-a-date' }),
    post({ id: '7', referenced_tweets: [{ type: 'replied_to', id: '1' }] }), post({ id: '8', referenced_tweets: [{ type: 'retweeted', id: '1' }] }),
    post({ id: '9', created_at: '2026-10-29T19:58:00Z' })];
  const result = parseLocalPosts(payload(data), request);
  assert.deepEqual(result.map(item => item.id), ['9', '987654321']);
  assert.deepEqual(result[0].author, { username: 'TPSOperations', name: user.name });
  assert.equal(result[0].url, 'https://x.com/TPSOperations/status/9');
  assert.deepEqual(parseLocalPosts({ meta: { result_count: 0 } }, request), []);
  for (const value of [{}, { errors: [{ detail: token }] }, { data: 'wrong', meta: { result_count: 0 } }]) assert.throws(() => parseLocalPosts(value, request), error => error.code === 'upstream_unavailable');
});

test('parser caps output, keeps content as plain text and constructs only trusted permalinks', () => {
  const input = payload(Array.from({ length: 15 }, (_, index) => post({ id: String(index + 1), text: '<b>Warning</b>\u0000\nLiteral post text' })));
  const result = parseLocalPosts(input, buildLocalPostsRequest(location, epoch));
  assert.equal(result.length, 10);
  assert.equal(result[0].text, '<b>Warning</b>\nLiteral post text');
  assert.equal(result[0].html, undefined);
  input.includes.users[0] = { ...user, username: 'evil/../../url' };
  assert.deepEqual(parseLocalPosts(input, buildLocalPostsRequest(location, epoch)), []);
});

test('provider sends credential only in header and rejects redirects and unexpected bodies', async () => {
  let calls = 0;
  const result = await fetchLocalPosts(location, { token, now: () => epoch, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.includes(token), false);
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return json(payload());
  } });
  assert.equal(calls, 1);
  assert.equal(result.configured, true);
  assert.deepEqual(result.location, location);
  assert.equal(result.posts.length, 1);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(localPostsToken({ X_BEARER_TOKEN: `${token}\nInjected: header` }), '');
  for (const response of [new Response('<html>blocked</html>', { headers: { 'content-type': 'text/html' } }), new Response('x'.repeat(262145), { headers: { 'content-type': 'application/json' } }), json(payload(), 302)]) {
    await assert.rejects(fetchLocalPosts(location, { token, now: () => epoch, fetchImpl: async () => response }), error => error.code === 'upstream_unavailable' && !error.message.includes(token));
  }
});

test('provider errors never return raw X bodies or credential-bearing exceptions', async () => {
  for (const [status, code] of [[401, 'needs_connection'], [403, 'needs_connection'], [402, 'credits_required'], [429, 'rate_limited'], [500, 'upstream_unavailable']]) {
    await assert.rejects(fetchLocalPosts(location, { token, now: () => epoch, fetchImpl: async () => json({ detail: token }, status) }), error => error.code === code && !error.message.includes(token));
  }
  await assert.rejects(fetchLocalPosts(location, { token, fetchImpl: async () => { throw Error(token); } }), error => error.code === 'upstream_unavailable' && !error.message.includes(token));
});
