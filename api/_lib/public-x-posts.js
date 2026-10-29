import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { briefingCountryName, readBriefingLocation } from './briefing-location.js';

const WINDOW_MS = 72 * 3600_000;
const MAX_BYTES = 750_000;
const TOPIC_PRIORITY = { emergency: 5, 'public-safety': 4, security: 4, health: 3, weather: 3, utilities: 3, transport: 2, preparedness: 1 };
const TERMS = '(evacuation OR "shelter in place" OR "police warning" OR shooting OR "gas leak" OR outage OR flooding OR wildfire OR "road closure" OR "boil water" OR "health warning")';
const SOURCE_NOTE = 'Public X snippets found by Google News, not a live X feed. Dates are listed by the search index and are not independently verified post times. Coverage can be incomplete or delayed; authors and claims are unverified.';
const clean = (value, limit = 900) => {
  if (typeof value !== 'string') return '';
  const $ = load(value); $('script,style,iframe').remove();
  return $.text().replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, limit);
};

export function buildPublicXSearches(input) {
  const location = readBriefingLocation(input);
  if (!location) throw new Error('Choose a city for public posts.');
  const places = [...new Set([location.region, briefingCountryName(location.countryCode)].filter(Boolean))];
  const queries = [`site:x.com "${location.city}" (${places.map(value => `"${value}"`).join(' OR ')}) ${TERMS} when:3d`];
  // TPS explicitly links this account from its official media centre. This
  // query is a discovery hint, not proof that any returned post has that author.
  if (location.countryCode === 'CA' && location.city.toLocaleLowerCase('en') === 'toronto' && ['', 'on', 'ontario'].includes(location.region.toLocaleLowerCase('en'))) queries.unshift('site:x.com/TPSOperations when:3d');
  // Use known canonical English editions. `hl=en` redirects, while inventing
  // e.g. JP:en can produce an unsupported edition. Country relevance comes
  // from the explicit place phrases, not this display/edition preference.
  const edition = location.countryCode === 'CA' ? { hl: 'en-CA', gl: 'CA', ceid: 'CA:en' } : { hl: 'en-US', gl: 'US', ceid: 'US:en' };
  return queries.map(query => {
    const params = new URLSearchParams({ q: query, ...edition });
    return { feed: `https://news.google.com/rss/search?${params}`, url: `https://news.google.com/search?${params}` };
  });
}

export function publicXCategory(title) {
  const value = clean(title);
  if (/\b(evacuat\w*|shelter.in.place|state of emergency)\b/i.test(value)) return 'emergency';
  if (/\b(gas.leak|hazardous.spill|hazmat|suspicious.package|explosion|(?:house|building|apartment|residential).fire)\b/i.test(value) || /^FIRE\s*:/i.test(value)) return 'public-safety';
  if (/\b(boil.water|water.contamination|power.outage|electricity.outage|blackout|water.main.break|water.service.disruption|live.wire.down|downed.power.line)\b/i.test(value)) return 'utilities';
  if (/\b(health.(?:warning|advisory)|disease.outbreak|measles.outbreak|food.recall|contaminated.(?:food|water)|hospital.lockdown)\b/i.test(value)) return 'health';
  if (/\b(wildfire|tornado|tsunami|earthquake|blizzard|flash.flood|flood.warning|storm.warning|severe.weather|heat.warning|extreme.cold|extreme.heat)\b/i.test(value) || /\b(flooding|winter.storm)\b.{0,70}\b(roads?|damage|closed|homes?|warning|rescue|power|evacuat\w*)\b/i.test(value)) return 'weather';
  if (/\b(police.(?:warn\w*|alert)|shots.fired|gunshots?|gunfire|stabbing|armed.robbery|armed.suspect|active.shooter|missing.person|person.missing)\b/i.test(value) || /^MISSING\s*:/i.test(value) ||
      (/\bshooting\b/i.test(value) && (/^SHOOTING\s*:/i.test(value) || /\b(police|injur\w*|hospital|killed|suspect|victim|residence|gun\w*)\b/i.test(value)))) return 'public-safety';
  if (/\b(road.closur\w*|roads?.(?:closed|reopened)|roads?.have.(?:now.)?reopened|traffic.lights.are.out|transit.disruption|subway.closure|highway.closed|travel.advisory)\b/i.test(value) ||
      (/\bcollision\b/i.test(value) && /\b(police|vehicle|truck|injur\w*|road|street|highway|airport|driver|pedestrian|hospital)\b/i.test(value))) return 'transport';
  return null;
}

function indexLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'news.google.com' || url.port || url.username || url.password ||
        !/^\/rss\/articles\/[A-Za-z0-9_-]{1,1800}$/.test(url.pathname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}
function xPublisher(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname);
  } catch { return false; }
}

export function parsePublicXIndex(xml, now = Date.now()) {
  if (typeof xml !== 'string' || !/<rss\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid public index.');
  const $ = load(xml, { xmlMode: true });
  if (!$('rss > channel').length) throw new Error('Missing public index channel.');
  const seen = new Set(); const posts = [];
  for (const element of $('rss > channel > item').slice(0, 150).toArray()) {
    const row = $(element); const publisher = row.children('source').first();
    if (!xPublisher(publisher.attr('url'))) continue;
    const publisherName = clean(publisher.text(), 100);
    const rawTitle = clean(row.children('title').first().text());
    const suffix = ` - ${publisherName}`;
    const title = publisherName && rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length).trim() : rawTitle;
    const url = indexLink(row.children('link').first().text().trim());
    const date = Date.parse(row.children('pubDate').first().text());
    const category = publicXCategory(title);
    if (!title || !url || !category || !Number.isFinite(date) || date < now - WINDOW_MS || date > now + 300_000 || seen.has(url)) continue;
    seen.add(url);
    posts.push({ id: createHash('sha256').update(url).digest('hex').slice(0, 24), title, url,
      sourceDate: new Date(date).toISOString(), dateBasis: 'index', publishedAt: null,
      source: 'X via public index', verified: false, category });
  }
  return posts;
}

async function fetchIndex(url, fetchImpl) {
  const target = new URL(url);
  if (target.origin !== 'https://news.google.com' || target.pathname !== '/rss/search' || target.username || target.password) throw new Error('Unsupported index.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetchImpl(url, { redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': 'PrepVault/2.0 public-index-reader' } });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body?.getReader) { await response.body?.cancel(); throw new Error('Index unavailable.'); }
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) throw new Error('Index too large.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { clearTimeout(timer); }
}

export async function loadPublicXPosts({ location: input, fetchImpl = fetch, now = Date.now } = {}) {
  const location = readBriefingLocation(input);
  const searches = buildPublicXSearches(location);
  const fetchedAt = new Date(now()).toISOString();
  const outcomes = await Promise.allSettled(searches.map(async search => parsePublicXIndex(await fetchIndex(search.feed, fetchImpl), now())));
  const failed = outcomes.filter(outcome => outcome.status === 'rejected').length;
  const found = outcomes.flatMap(outcome => outcome.status === 'fulfilled' ? outcome.value : []);
  const unique = new Map();
  for (const post of found) if (!unique.has(post.id)) unique.set(post.id, post);
  // Match the aggregate's topic/age ordering before limiting candidates, so
  // newer routine closures cannot discard a recent protective-action notice.
  // This is reading priority, not verification or a measure of actual danger.
  const timestamp = now();
  const priority = post => (TOPIC_PRIORITY[post.category] || 1) * Math.max(0.1, 1 - (timestamp - Date.parse(post.sourceDate)) / (7 * 86400_000));
  const posts = [...unique.values()].sort((a, b) => priority(b) - priority(a) || b.sourceDate.localeCompare(a.sourceDate)).slice(0, 30);
  return { location, fetchedAt, source: { id: 'public-x-index', name: 'X · public search index', url: searches.at(-1).url,
    status: failed === searches.length ? 'unavailable' : posts.length ? 'ready' : 'empty', count: posts.length,
    note: SOURCE_NOTE, ...(failed ? { error: failed === searches.length ? 'The public index could not be checked. Open the search source instead.' : 'Some public searches could not be checked.' } : {}),
    truncated: unique.size > posts.length }, posts };
}
