import { createHash } from 'node:crypto';
import { load as loadXml } from 'cheerio';
import { readBriefingLocation } from './briefing-location.js';

const MAX_BYTES = 1_000_000;
const WINDOW_MS = 7 * 86400_000;
// Reddit's official October 8 changelog announces this public RSS sunset:
// https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026
export const REDDIT_RSS_SUNSET = Date.parse('2026-11-13T00:00:00Z');
const SUNSET_URL = 'https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026';
const TORONTO = Object.freeze({ city: 'Toronto', community: 'toronto', url: 'https://www.reddit.com/r/toronto/', feed: 'https://www.reddit.com/r/toronto/new/.rss?limit=100' });
const INDEX_QUERY = 'site:reddit.com/r/toronto when:7d';
const INDEX_URL = 'https://news.google.com/rss/search?' + new URLSearchParams({ q: INDEX_QUERY, hl: 'en-CA', gl: 'CA', ceid: 'CA:en' }).toString();
const ALLOWED_URLS = new Set([TORONTO.feed, INDEX_URL]);
const plain = (value, max = 300) => {
  if (typeof value !== 'string') return '';
  const $ = loadXml(value); $('script,style,iframe').remove();
  return $.text().replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
};
const recent = (value, now) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= now - WINDOW_MS && time <= now + 3600_000 ? new Date(time).toISOString() : null;
};
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);

export function redditCommunityForLocation(location) {
  return location?.countryCode === 'CA' && location.city.toLocaleLowerCase('en') === 'toronto' && ['', 'on', 'ontario'].includes(location.region.toLocaleLowerCase('en')) ? TORONTO : null;
}

// This is a topic-match order, not a prediction or verification of danger.
// Only the visible title contributes; no usernames, comments or bodies are read.
export function redditSafetyRelevance(title) {
  if (typeof title !== 'string') return null;
  const protectiveNotice = /\b(public.warning|police.warn|safety.warning|amber.alert|evacuat\w*|shelter.in.place|boil.water)\b/i.test(title);
  const retrospective = /\b(found.guilty|sentenc\w*|jury.trial|court.hears|on.trial|convict\w*|verdict|anniversary|on.this.day|documentary|filming|film.shoot|movie.review|film.review|movie.set|film.set|tv.show)\b|\b\d+.years?.(?:after|since)\b/i.test(title);
  if (retrospective && !protectiveNotice) return null;
  if (/\b(evacuat\w*|shelter.in.place|boil.water|bomb.threat|amber.alert)\b/i.test(title)) return { category: 'emergency', rank: 3, reason: 'Mentions an emergency notice or protective action.' };
  if (/\b(power.outage|blackout|water.main.break|gas.leak|water.contaminat\w*|drinking.water.warning)\b/i.test(title)) return { category: 'utilities', rank: 3, reason: 'Mentions a utility disruption or hazard.' };
  if (/\b(tornado|wildfire|blizzard|ice.storm|weather.warning|flash.flood|heat.warning|extreme.cold)\b/i.test(title) || /\b(flood\w*|storm)\b.{0,60}\b(warning|road|closed|evacuat\w*|damage|outage)\b/i.test(title)) return { category: 'weather', rank: 3, reason: 'Mentions severe weather or disruption.' };
  if (/\b(shooting|stabbing|gunshots?|shots.fired|homicide|assault|robbery|home.invasion\w*|kidnap\w*|abduct\w*|arson|missing.child|missing.person|hit.and.run|fatal.collision|struck.by|fire.at|fire.in|blaze)\b/i.test(title)) return { category: 'public-safety', rank: 2, reason: 'Mentions a public safety incident.' };
  if (/\b(road.closur\w*|roads?.closed|traffic.hazard|subway.clos\w*|transit.disruption|collision|impaired.driver|dangerous.driver)\b/i.test(title)) return { category: 'transport', rank: 2, reason: 'Mentions a travel disruption or road hazard.' };
  if (/\b(health.warning|outbreak|food.recall|measles|rabies)\b/i.test(title)) return { category: 'health', rank: 2, reason: 'Mentions a public health concern.' };
  if (protectiveNotice) return { category: 'public-safety', rank: 2, reason: 'Mentions a public safety notice.' };
  if (/\b(scam\w*|fraud|break.in\w*|break.and.enter|theft|stolen)\b/i.test(title)) return { category: 'security', rank: 1, reason: 'Mentions a security concern.' };
  return null;
}

function ordered(posts) {
  const seen = new Set();
  return posts.filter(post => { if (seen.has(post.id)) return false; seen.add(post.id); return true; })
    .sort((a, b) => b.relevance.rank - a.relevance.rank || Date.parse(b.publishedAt || b.sourceDate) - Date.parse(a.publishedAt || a.sourceDate))
    .slice(0, 10);
}

function redditPermalink(value, community, entryId) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.reddit.com', 'reddit.com'].includes(url.hostname) || url.port || url.username || url.password) return null;
    const match = /^\/r\/([^/]+)\/comments\/([a-z0-9]+)(?:\/[^/]*)?\/?$/i.exec(url.pathname);
    if (!match || match[1].toLowerCase() !== community.community || entryId !== `t3_${match[2]}`) return null;
    return `https://www.reddit.com/r/${community.community}/comments/${match[2]}/`;
  } catch { return null; }
}

export function parseRedditCommunityFeed(xml, community = TORONTO, now = Date.now()) {
  if (typeof xml !== 'string' || !/<feed\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Invalid Reddit feed.');
  const $ = loadXml(xml, { xmlMode: true }); const feed = $('feed').first();
  if (feed.attr('xmlns') !== 'http://www.w3.org/2005/Atom' || feed.children('category').first().attr('term')?.toLowerCase() !== community.community) throw Error('Different Reddit community.');
  const rows = feed.children('entry').slice(0, 100).toArray(); const posts = []; let valid = 0;
  for (const element of rows) {
    const row = $(element); const entryId = row.children('id').first().text().trim();
    const title = plain(row.children('title').first().text());
    const url = redditPermalink(row.children('link').first().attr('href'), community, entryId);
    // Entry updated time can change after an edit; use the actual creation date.
    const publishedValue = row.children('published').first().text();
    if (!/^t3_[a-z0-9]+$/.test(entryId) || !title || !url || !Number.isFinite(Date.parse(publishedValue))) continue;
    valid++;
    const publishedAt = recent(publishedValue, now); const relevance = redditSafetyRelevance(title);
    if (!publishedAt || !relevance) continue;
    posts.push({ id: entryId, title, url, publishedAt, sourceDate: null, dateBasis: 'published', community: `r/${community.community}`, source: 'Reddit', verified: false, category: relevance.category, relevance });
  }
  if (rows.length && !valid) throw Error('No valid Reddit entries.');
  return ordered(posts);
}

function googleNewsLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'news.google.com' || url.port || url.username || url.password || !/^\/rss\/articles\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;
    url.search = ''; url.hash = ''; return url.href;
  } catch { return null; }
}
export function parseRedditIndexedFeed(xml, community = TORONTO, now = Date.now()) {
  if (typeof xml !== 'string' || !/<rss\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Invalid public index feed.');
  const $ = loadXml(xml, { xmlMode: true }); const rows = $('rss > channel > item').slice(0, 100).toArray(); const posts = []; let valid = 0;
  if (!$('rss > channel > title').length) throw Error('Missing public index channel.');
  for (const element of rows) {
    const row = $(element); const publisher = row.children('source').first();
    let publisherUrl;
    try { publisherUrl = new URL(publisher.attr('url')); } catch { continue; }
    if (publisherUrl.protocol !== 'https:' || publisherUrl.username || publisherUrl.password || publisherUrl.port || !['reddit.com', 'www.reddit.com'].includes(publisherUrl.hostname)) continue;
    const title = plain(row.children('title').first().text()).replace(/\s+-\s+Reddit$/i, '').trim();
    const url = googleNewsLink(row.children('link').first().text().trim());
    const indexDate = row.children('pubDate').first().text();
    if (!title || !url || !Number.isFinite(Date.parse(indexDate))) continue;
    valid++;
    const indexedAt = recent(indexDate, now); const relevance = redditSafetyRelevance(title);
    if (!indexedAt || !relevance) continue;
    // Google's supplied date is not independently verified as the post's
    // creation time; keep it separate from actual Reddit publication dates.
    posts.push({ id: `reddit-index-${hash(url)}`, title, url, publishedAt: null, sourceDate: indexedAt, dateBasis: 'index', community: `r/${community.community}`, source: 'Reddit via Google News', verified: false, category: relevance.category, relevance, retrieval: 'community-index-search' });
  }
  if (rows.length && !valid) throw Error('No valid indexed Reddit entries.');
  return ordered(posts);
}

export async function fetchPublicRedditSource(url, { fetchImpl = globalThis.fetch, timeoutMs = 6500 } = {}) {
  if (!ALLOWED_URLS.has(url)) throw Error('Unsupported public source.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, 6500)));
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml', 'User-Agent': 'PrepVault/2.0 public RSS reader (https://prepvault-xi.vercel.app)' } });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body?.getReader) { await response.body?.cancel(); throw Error('Public feed unavailable.'); }
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) { await reader.cancel(); throw Error('Public feed too large.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { clearTimeout(timer); }
}

export async function loadLocalReddit({ location: input, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const location = input ? readBriefingLocation(input) : null;
  if (!location) throw Error('Choose a city for community discussions.');
  const timestamp = now(); const fetchedAt = new Date(timestamp).toISOString();
  const community = redditCommunityForLocation(location);
  const base = { location, fetchedAt, posts: [], windowDays: 7, rankedBy: 'Safety topic match, then recency. Posts are unverified community reports.' };
  if (!community) {
    const source = { id: 'reddit-community', name: 'Reddit community discussions', url: null, status: 'unsupported', count: 0, checkedAt: null, note: 'A community feed is not connected for this city yet.' };
    return { ...base, source, sources: [source] };
  }
  const direct = { id: 'reddit-toronto', name: 'Reddit · r/toronto', url: community.url, checkedAt: fetchedAt, count: 0, status: 'unavailable',
    note: 'Unverified community discussion, not an official warning. Reddit has announced that public RSS support ends November 13, 2026.', supportEndsAt: new Date(REDDIT_RSS_SUNSET).toISOString(), supportNoticeUrl: SUNSET_URL };
  const sources = [direct]; let posts = [];
  if (timestamp < REDDIT_RSS_SUNSET) {
    try {
      posts = parseRedditCommunityFeed(await fetchPublicRedditSource(community.feed, { fetchImpl }), community, timestamp);
      direct.status = posts.length ? 'ready' : 'empty'; direct.count = posts.length;
    } catch { direct.error = 'The public Reddit feed could not be checked.'; }
  } else { direct.error = 'Reddit public RSS support has ended. Checking public search-index listings instead.'; }
  if (posts.length) return { ...base, posts, source: direct, sources };
  const indexed = { id: 'reddit-toronto-index', name: 'Reddit · public search index', url: 'https://news.google.com/search?' + new URLSearchParams({ q: INDEX_QUERY, hl: 'en-CA', gl: 'CA', ceid: 'CA:en' }).toString(), checkedAt: fetchedAt, count: 0, status: 'unavailable',
    note: 'Search-index headlines only. Index dates are not verified post dates; coverage can be sparse or delayed.' };
  sources.push(indexed);
  try {
    posts = parseRedditIndexedFeed(await fetchPublicRedditSource(INDEX_URL, { fetchImpl }), community, timestamp);
    indexed.status = posts.length ? 'ready' : 'empty'; indexed.count = posts.length;
  } catch { indexed.error = 'The public search index could not be checked.'; }
  return { ...base, posts, source: indexed, sources };
}
