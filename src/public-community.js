import { briefingLocationKey, normalizeBriefingLocation } from './briefing-relevance.js';
import { recentPostsUrl } from './local-updates.js';

const clean = (value, limit = 300) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, limit) : '';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
const REDDIT_HOSTS = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com']);
function parsedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.href.length < 2400 ? url : null;
  } catch { return null; }
}
function publicPostUrl(value, kind, basis) {
  const url = parsedUrl(value);
  if (!url) return null;
  const direct = kind === 'x' ? X_HOSTS.has(url.hostname) && /^\/[^/]+\/status\/\d+\/?$/.test(url.pathname)
    : REDDIT_HOSTS.has(url.hostname) && /^\/r\/[^/]+\/comments\/[^/]+(?:\/[^/]*)?\/?$/.test(url.pathname);
  const indexed = basis === 'index' && url.hostname === 'news.google.com' && /^\/rss\/articles\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  if (!direct && !indexed) return null;
  url.hash = '';
  return url.href;
}
function sourceUrl(value) {
  const url = parsedUrl(value);
  return url && (X_HOSTS.has(url.hostname) || REDDIT_HOSTS.has(url.hostname) || ['news.google.com', 'www.google.com', 'google.com'].includes(url.hostname)) ? url.href : null;
}

export function normalizePublicCommunity(value, expectedLocation) {
  const expected = normalizeBriefingLocation(expectedLocation);
  if (!expected || !value || !date(value.fetchedAt) || !Array.isArray(value.posts) || !Array.isArray(value.sources) || briefingLocationKey(value.location) !== briefingLocationKey(expected)) throw new Error('Public reports did not match this city. Refresh to try again.');
  const seen = new Set();
  return {
    location: expected, fetchedAt: value.fetchedAt,
    sources: value.sources.slice(0, 12).flatMap(source => source && typeof source === 'object' ? [{
      id: clean(source.id, 100), name: clean(source.name, 100) || 'Public source', url: sourceUrl(source.url),
      status: ['ready', 'empty', 'unavailable', 'unsupported'].includes(source.status) ? source.status : 'unavailable',
      count: Number.isInteger(source.count) && source.count >= 0 ? source.count : null, note: clean(source.note, 600), error: clean(source.error),
    }] : []),
    posts: value.posts.slice(0, 40).flatMap(post => {
      if (!post || !['x', 'reddit'].includes(post.kind) || !['published', 'index'].includes(post.dateBasis)) return [];
      const url = publicPostUrl(post.url, post.kind, post.dateBasis), title = clean(post.title, 600);
      if (!url || !title || seen.has(url)) return [];
      seen.add(url);
      return [{ id: clean(post.id, 256) || url, title, url, source: clean(post.source, 100) || (post.kind === 'x' ? 'X' : 'Reddit'), kind: post.kind,
        date: date(post.date), dateBasis: post.dateBasis, category: clean(post.category, 80) }];
    }),
  };
}

export async function getPublicCommunity(location, { signal, fetchImpl = fetch } = {}) {
  const context = normalizeBriefingLocation(location);
  if (!context) throw new Error('Choose a city for public reports.');
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  const check = () => { if (combined.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  try {
    const response = await fetchImpl(`/api/community-updates?${new URLSearchParams(context)}`, {
      credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: combined,
    });
    check();
    const body = await response.json();
    check();
    if (!response.ok) throw new Error(clean(body?.error) || 'Public reports could not be checked. Try the source searches below.');
    return normalizePublicCommunity(body, context);
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (combined.aborted) throw new Error('Public reports took too long to load. Try refreshing or open a source search.');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Public reports could not be checked. Try refreshing or open a source search.');
    throw error;
  }
}

export function publicCommunitySearches(location, now = Date.now()) {
  const context = normalizeBriefingLocation(location);
  if (!context) throw new Error('Choose a city for public searches.');
  const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(context.countryCode);
  const area = context.region ? `("${context.region}" OR "${country}")` : `"${country}"`;
  const query = `"${context.city}" ${area} (police OR emergency OR evacuation OR outage OR closure OR flood OR fire)`;
  return { x: recentPostsUrl(context, now), reddit: `https://www.reddit.com/search/?${new URLSearchParams({ q: query, sort: 'new', t: 'week' })}` };
}

export function publicCommunityDate(post) {
  const value = date(post?.date);
  if (!value) return post?.dateBasis === 'index' ? 'Listing date unavailable' : 'Publication date unavailable';
  const label = post.dateBasis === 'index' ? 'Google-listed' : 'Published';
  const formatted = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${label} ${formatted}`;
}
