import { Buffer } from 'node:buffer';
import { briefingCountryName, readBriefingLocation } from './briefing-location.js';

const X_RECENT_SEARCH = 'https://api.x.com/2/tweets/search/recent';
const BODY_LIMIT = 262144;
const SEARCH_WINDOW = 48 * 60 * 60 * 1000;
const TERMS = '(warning OR evacuation OR emergency OR outage OR wildfire OR flooding OR police OR shooting OR collision OR "road closure" OR "boil water")';

export class LocalPostsError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const invalid = () => new LocalPostsError(400, 'invalid_request', 'Choose a saved city, region and country before loading local posts.');
const unavailable = () => new LocalPostsError(502, 'upstream_unavailable', 'X posts could not be checked. Try again later or open the official source.');

export function localPostsToken(env) {
  const token = typeof env.X_BEARER_TOKEN === 'string' ? env.X_BEARER_TOKEN.trim() : '';
  return token.length >= 20 && token.length <= 8192 && /^[\x21-\x7e]+$/.test(token) ? token : '';
}

export function readLocalPostsQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !['action', 'city', 'region', 'countryCode'].includes(key))) throw invalid();
  const action = query.action === undefined ? 'status' : query.action;
  if (!['status', 'search'].includes(action)) throw invalid();
  const place = Object.fromEntries(Object.entries(query).filter(([key]) => key !== 'action'));
  let location;
  try { location = readBriefingLocation(place); } catch { throw invalid(); }
  if (action === 'search' && !location) throw invalid();
  return { action, location };
}

export function buildLocalPostsRequest(input, timestamp = Date.now()) {
  let location;
  try { location = readBriefingLocation(input); } catch { throw invalid(); }
  if (!location || !Number.isFinite(timestamp)) throw invalid();
  // All labels pass the shared Unicode place-name allowlist, which excludes
  // quotes, colons, parentheses, URLs and other X query operators.
  const quote = value => `"${value}"`;
  const disambiguation = [...new Set([location.region, briefingCountryName(location.countryCode)].filter(Boolean))];
  const query = `${quote(location.city)} (${disambiguation.map(quote).join(' OR ')}) ${TERMS} -is:retweet -is:reply`;
  if (query.length > 512) throw invalid();
  const startTime = timestamp - SEARCH_WINDOW;
  // X requires end_time to be at least ten seconds behind the request time.
  const endTime = timestamp - 15000;
  const url = new URL(X_RECENT_SEARCH);
  url.search = new URLSearchParams({ query, max_results: '10', sort_order: 'recency',
    start_time: new Date(startTime).toISOString(), end_time: new Date(endTime).toISOString(),
    'tweet.fields': 'created_at,author_id,referenced_tweets', expansions: 'author_id', 'user.fields': 'username,name' }).toString();
  return { url: url.href, startTime, endTime, location };
}

const text = (value, limit) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, character => ['\n', '\r', '\t'].includes(character) ? character : '').trim().slice(0, limit) : '';
const id = value => typeof value === 'string' && /^\d{1,25}$/.test(value);

export function parseLocalPosts(payload, { startTime, endTime }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (Array.isArray(payload.errors) && payload.errors.length) ||
      (!Array.isArray(payload.data) && (payload.data !== undefined || payload.meta?.result_count !== 0))) throw unavailable();
  const users = new Map((Array.isArray(payload.includes?.users) ? payload.includes.users.slice(0, 100) : [])
    .filter(user => id(user?.id) && typeof user.username === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(user.username))
    .map(user => [user.id, { username: user.username, name: text(user.name, 100) || user.username }]));
  const seen = new Set();
  return (payload.data || []).slice(0, 100).flatMap(post => {
    const author = users.get(post?.author_id);
    const content = text(post?.text, 4000);
    const date = typeof post?.created_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(post.created_at) ? Date.parse(post.created_at) : NaN;
    if (!id(post?.id) || seen.has(post.id) || !author || !content || !Number.isFinite(date) || date < startTime || date > endTime ||
        (Array.isArray(post.referenced_tweets) && post.referenced_tweets.some(ref => ['retweeted', 'replied_to'].includes(ref?.type)))) return [];
    seen.add(post.id);
    return [{ id: post.id, text: content, createdAt: new Date(date).toISOString(), url: `https://x.com/${author.username}/status/${post.id}`, author }];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
}

async function boundedJson(response) {
  if (Number(response.headers?.get('content-length')) > BODY_LIMIT) throw unavailable();
  if (!String(response.headers?.get('content-type') || '').toLowerCase().includes('application/json')) throw unavailable();
  const reader = response.body?.getReader();
  let raw;
  if (reader) {
    const chunks = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > BODY_LIMIT) throw unavailable();
        chunks.push(value);
      }
      raw = Buffer.concat(chunks).toString('utf8');
    } finally { await reader.cancel().catch(() => {}); }
  } else {
    raw = await response.text();
    if (Buffer.byteLength(raw) > BODY_LIMIT) throw unavailable();
  }
  try { return JSON.parse(raw); } catch { throw unavailable(); }
}

export async function fetchLocalPosts(location, { token, fetchImpl = fetch, now = Date.now } = {}) {
  if (!localPostsToken({ X_BEARER_TOKEN: token })) throw new LocalPostsError(503, 'needs_connection', 'X search needs a server connection before posts can be loaded.');
  const request = buildLocalPostsRequest(location, now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetchImpl(request.url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error', cache: 'no-store', signal: controller.signal });
    if ([401, 403].includes(response.status)) throw new LocalPostsError(503, 'needs_connection', 'The X connection needs attention. Check its access in the X Developer Console.');
    if (response.status === 402) throw new LocalPostsError(503, 'credits_required', 'X search needs available API credits. Check the X Developer Console.');
    if (response.status === 429) throw new LocalPostsError(429, 'rate_limited', 'X has temporarily limited this search. Wait before loading posts again.');
    if (!response.ok) throw unavailable();
    const posts = parseLocalPosts(await boundedJson(response), request);
    return { configured: true, fetchedAt: new Date(now()).toISOString(), location: request.location, posts };
  } catch (error) { throw error instanceof LocalPostsError ? error : unavailable(); }
  finally { clearTimeout(timer); }
}
