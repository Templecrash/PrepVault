import { normalizeBriefingLocation, briefingLocationKey } from './briefing-relevance.js';
const clean = (value, max) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, character => character === '\n' ? '\n' : '').slice(0, max) : '';
async function request(action, location, { signal, fetchImpl = fetch } = {}) {
  const context = normalizeBriefingLocation(location);
  const response = await fetchImpl(`/api/local-posts?${new URLSearchParams({ ...context, action })}`, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(clean(data?.error, 300) || 'Recent X posts are unavailable. Try the direct search.'); error.status = response.status; error.code = clean(data?.code, 60); throw error; }
  if (typeof data?.configured !== 'boolean') throw new Error('The X connection returned an incomplete response.');
  return data;
}
export async function getLocalPostsStatus(location, options) { return request('status', location, options); }
export function normalizeLocalPosts(data, location) {
  if (data?.configured !== true || !Array.isArray(data.posts) || !Number.isFinite(Date.parse(data.fetchedAt)) || briefingLocationKey(data.location) !== briefingLocationKey(location)) throw new Error('The X posts did not match this city. Try again.');
  const seen = new Set();
  return { fetchedAt: data.fetchedAt, posts: data.posts.slice(0, 10).flatMap(post => {
    if (!/^\d{1,30}$/.test(post?.id) || !/^[A-Za-z0-9_]{1,15}$/.test(post.author?.username) || !Number.isFinite(Date.parse(post.createdAt)) || seen.has(post.id)) return [];
    seen.add(post.id);
    return [{ id: post.id, text: clean(post.text, 5000), createdAt: post.createdAt, url: `https://x.com/${post.author.username}/status/${post.id}`, author: { username: post.author.username, name: clean(post.author.name, 100) || post.author.username } }];
  }) };
}
export async function getLocalPosts(location, options) { return normalizeLocalPosts(await request('search', location, options), location); }
