import process from 'node:process';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';

const MAX_BYTES = 1_500_000;
const MAX_AGE = 14 * 86400_000;
const NEWS_QUERY = '("emergency preparedness" OR "civil defence" OR "emergency supplies" OR war OR conflict OR blackout OR "supply chain")';
const COUNTRY_TERMS = {
  CA: /\b(canada|canadian|ottawa|toronto|montreal|vancouver)\b/i,
  US: /\b(united states|u\.s\.|american|washington|california|florida|texas)\b/i,
  GB: /\b(united kingdom|u\.k\.|uk|britain|british|england|scotland|wales|northern ireland|london)\b/i,
  JP: /\b(japan|japanese|tokyo|osaka)\b/i,
  UA: /\b(ukraine|ukrainian|kyiv|kiev)\b/i,
  RU: /\b(russia|russian|moscow)\b/i,
  IL: /\b(israel|israeli|tel aviv)\b/i,
  PS: /\b(palestin\w*|gaza|west bank)\b/i,
  IR: /\b(iran|iranian|tehran)\b/i,
  LB: /\b(lebanon|lebanese|beirut)\b/i,
  SD: /\b(sudan|sudanese|khartoum|darfur)\b/i,
  AU: /\b(australia|australian|sydney|melbourne)\b/i,
  NZ: /\b(new zealand|auckland|wellington)\b/i,
  CN: /\b(china|chinese|beijing)\b/i,
  TW: /\b(taiwan|taiwanese|taipei)\b/i,
  KR: /\b(south korea|seoul)\b/i,
  KP: /\b(north korea|pyongyang)\b/i,
  PH: /\b(philippines|philippine|manila)\b/i,
  IN: /\b(india|indian|delhi|mumbai)\b/i,
  PK: /\b(pakistan|pakistani)\b/i,
  FR: /\b(france|french|paris)\b/i,
  DE: /\b(germany|german|berlin)\b/i,
  PL: /\b(poland|polish|warsaw)\b/i,
  FI: /\b(finland|finnish|helsinki)\b/i,
  SE: /\b(sweden|swedish|stockholm)\b/i,
  NO: /\b(norway|norwegian|oslo)\b/i,
  IT: /\b(italy|italian|rome)\b/i,
  ES: /\b(spain|spanish|madrid)\b/i,
  BR: /\b(brazil|brazilian)\b/i,
  MX: /\b(mexico|mexican)\b/i,
};
const TOPIC_TERMS = {
  preparedness: /\b(preparedness|emergency (?:kit|supplies|plan|planning)|civil defen[cs]e|stockpil\w*|evacuat\w*|shelter in place)\b|\bprepar\w*\b.{0,60}\b(emergency|disaster|flood|war|crisis|blackout)\b/i,
  conflict: /\b(war|conflict|missile|airstrike|air strike|invasion|ceasefire|hostilities|sanctions|embargo)\b|\b(armed|military|nuclear)\b.{0,40}\b(attack|threat|weapon|strike|offensive|inspection|escalation)\b/i,
  infrastructure: /\b(blackout|outage|cyberattack|cyber attack|ransomware|port closure|fuel shortage|energy crisis)\b|\b(power grid|electricity|energy|fuel|pipeline|infrastructure|supply chain)\b.{0,70}\b(disrupt\w*|shortage|failure|attack|warning|damage|shutdown|ration\w*)\b|\b(disrupt\w*|shortage|failure|attack|warning|damage|shutdown|ration\w*)\b.{0,70}\b(power grid|electricity|energy|fuel|pipeline|infrastructure|supply chain)\b/i,
  disasters: /\b(earthquake|tsunami|flood\w*|wildfire|hurricane|typhoon|cyclone|storm|volcan\w*|drought|landslide|disaster|extreme weather|heatwave)\b/i,
  health: /\b(outbreak|pandemic|epidemic|health emergency|cholera|measles|bird flu)\b|\b(hospital|medicine|medical)\b.{0,60}\b(shortage|outage|emergency|attack|collapse)\b/i,
  'food-water': /\b(famine|hunger crisis|food shortage|food insecurity|boil water|crop failure|water shortage|water contamination|drinking water warning)\b|\b(food|water supply|drinking water|crop)\b.{0,60}\b(shortage|contaminat\w*|failure|disrupt\w*|warning|ration\w*)\b/i,
};
const ROUTINE_POLICY = /\b(budget|loan scheme|factsheet|ceremony|anniversary|scholarship|award ceremony)\b/i;
const IMMEDIATE_DISRUPTION = /\b(blackout|outage|emergency|disrupt\w*|shortage|ration\w*|evacuat\w*|warning|alert|airstrike|invasion)\b/i;

export const GUIDANCE = [
  { id: 'uk-be-ready', country: 'GB', title: 'UK: Be Ready for emergencies', summary: 'Review the government household checklist, essential supplies and plans for disruptions. This is standing preparedness advice, not a live warning.', url: 'https://beready.campaign.gov.uk/', source: 'UK Government', kind: 'standing-guidance' },
  { id: 'japan-disaster-preparation', country: 'JP', title: 'Japan: disaster preparation and evacuation', summary: 'The Cabinet Office provides evacuation guidance and multilingual disaster information. Check current local instructions separately.', url: 'https://www.bousai.go.jp/index-e.html', source: 'Japan Cabinet Office', kind: 'standing-guidance' },
  { id: 'canada-get-prepared', country: 'CA', title: 'Canada: make an emergency plan', summary: 'Review your risks, household plan and emergency kit with the national preparedness guide.', url: 'https://www.getprepared.gc.ca/', source: 'Government of Canada', kind: 'standing-guidance' },
  { id: 'us-ready', country: 'US', title: 'US: prepare for hazards', summary: 'Use Ready.gov to review emergency supplies, communication plans and guidance for specific hazards.', url: 'https://www.ready.gov/', source: 'Ready.gov / FEMA', kind: 'standing-guidance' },
];

export function classifyNews(text) {
  return { topics: Object.entries(TOPIC_TERMS).filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic), countries: Object.entries(COUNTRY_TERMS).filter(([, pattern]) => pattern.test(text)).map(([country]) => country) };
}

const clean = (value, limit) => {
  if (typeof value !== 'string') return '';
  const $ = load(value); $('script,style').remove();
  return $.text().replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
};
function articleUrl(value, allowedHost) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' && ['www.gdacs.org', 'gdacs.org'].includes(url.hostname)) url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.username || url.password || (allowedHost && url.hostname !== allowedHost)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    return url.href.length <= 2000 ? url.href : null;
  } catch { return null; }
}
function recentDate(value, now) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= now - MAX_AGE && time <= now + 3600_000 ? new Date(time).toISOString() : null;
}
const idFor = url => createHash('sha256').update(url).digest('hex').slice(0, 24);

export function parseSyndicatedNews(xml, source, now = Date.now()) {
  if (!/<(?:rss|feed)\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid feed format.');
  const $ = load(xml, { xmlMode: true });
  const articles = [];
  for (const el of $('item, entry').slice(0, 150).toArray()) {
    const row = $(el);
    const title = clean(row.find('title').first().text(), 220);
    const description = clean(row.find('description,summary').first().text(), 1200);
    const link = row.find('link[rel="alternate"]').first().attr('href') || row.find('link').first().attr('href') || row.find('link').first().text();
    const url = articleUrl(link, source.allowedHost);
    const publication = row.find('published, pubDate').first().text();
    const publishedAt = recentDate(publication || row.find('updated').first().text(), now);
    const dateBasis = publication ? 'published' : 'updated';
    const { topics, countries } = classifyNews(`${title} ${description}`);
    if (ROUTINE_POLICY.test(title) && !IMMEDIATE_DISRUPTION.test(`${title} ${description}`)) continue;
    if (!title || !url || !publishedAt || !topics.length) continue;
    articles.push({ id: idFor(url), title, summary: source.headlinesOnly ? '' : description.slice(0, 300), url, source: source.name, sourceId: source.id, sourceUrl: source.url, publishedAt, observedAt: null, dateBasis, kind: source.kind, topics, countries });
    if (articles.length >= 12) break;
  }
  return articles;
}

export function parseGdeltNews(data, now = Date.now()) {
  if (!data || !Array.isArray(data.articles)) throw new Error('Invalid news response.');
  return data.articles.slice(0, 60).flatMap(row => {
    const title = clean(row.title, 220); const url = articleUrl(row.url);
    const observedAt = recentDate(String(row.seendate || '').replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'), now);
    const { topics, countries } = classifyNews(title);
    if (ROUTINE_POLICY.test(title) && !IMMEDIATE_DISRUPTION.test(title)) return [];
    if (!title || !url || !observedAt || !topics.length) return [];
    return [{ id: idFor(url), title, summary: '', url, source: new URL(url).hostname.replace(/^www\./, ''), sourceId: 'gdelt', sourceUrl: 'https://www.gdeltproject.org/', publishedAt: null, observedAt, dateBasis: 'indexed', kind: 'news', topics, countries }];
  }).slice(0, 16);
}

export function parseGnews(data, now = Date.now()) {
  if (!data || !Array.isArray(data.articles)) throw new Error('Invalid news response.');
  return data.articles.slice(0, 20).flatMap(row => {
    const title = clean(row.title, 220); const summary = clean(row.description, 300); const url = articleUrl(row.url);
    const publishedAt = recentDate(row.publishedAt, now); const { topics, countries } = classifyNews(`${title} ${summary}`);
    if (ROUTINE_POLICY.test(title) && !IMMEDIATE_DISRUPTION.test(`${title} ${summary}`)) return [];
    if (!title || !url || !publishedAt || !topics.length) return [];
    return [{ id: idFor(url), title, summary, url, source: clean(row.source?.name, 100) || new URL(url).hostname, sourceId: 'gnews', sourceUrl: 'https://gnews.io/', publishedAt, observedAt: null, dateBasis: 'published', kind: 'news', topics, countries }];
  }).slice(0, 12);
}

export async function fetchBriefingSource(url, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(6000, Math.max(1, timeoutMs)));
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/rss+xml, application/atom+xml, application/json, text/xml, */*;q=0.5', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)' } });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('Feed unavailable.'); }
    if (!response.body?.getReader) throw new Error('Invalid feed response.');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Feed too large.'); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { clearTimeout(timer); }
}

export async function loadPreparednessBriefing({ fetchImpl = fetch, now = Date.now, gnewsKey = process.env.GNEWS_API_KEY } = {}) {
  const timestamp = now();
  // Fixed public sources only: no location, inventory or caller-provided URL goes upstream.
  const sources = [
    { id: 'govuk-preparedness', name: 'GOV.UK preparedness updates', url: 'https://www.gov.uk/search/news-and-communications?keywords=preparedness', feed: 'https://www.gov.uk/search/news-and-communications.atom?keywords=preparedness', allowedHost: 'www.gov.uk', kind: 'official' },
    { id: 'govuk-international', name: 'GOV.UK international updates', url: 'https://www.gov.uk/search/news-and-communications?keywords=conflict', feed: 'https://www.gov.uk/search/news-and-communications.atom?keywords=conflict', allowedHost: 'www.gov.uk', kind: 'official' },
    { id: 'gdacs', name: 'GDACS global disaster reports', url: 'https://www.gdacs.org/', feed: 'https://www.gdacs.org/xml/rss.xml', allowedHost: 'www.gdacs.org', kind: 'official' },
    // Linked headline metadata only; publisher article text and photographs are not copied.
    { id: 'un-news', name: 'UN News · peace and security', url: 'https://news.un.org/en/news/topic/peace-and-security', feed: 'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml', allowedHost: 'news.un.org', kind: 'news', headlinesOnly: true },
    ...(gnewsKey ? [{ id: 'gnews', name: 'GNews international reporting', url: 'https://gnews.io/', feed: `https://gnews.io/api/v4/search?${new URLSearchParams({ q: NEWS_QUERY, lang: 'en', max: '10', sortby: 'publishedAt', apikey: gnewsKey })}`, json: true }] : [{ id: 'gdelt', name: 'GDELT international reporting', url: 'https://www.gdeltproject.org/', feed: `https://api.gdeltproject.org/api/v2/doc/doc?${new URLSearchParams({ query: `${NEWS_QUERY} sourcelang:english`, mode: 'artlist', format: 'json', timespan: '3d', maxrecords: '30', sort: 'datedesc' })}`, json: true }]),
  ];
  const outcomes = await Promise.all(sources.map(async source => {
    try {
      const raw = await fetchBriefingSource(source.feed, { fetchImpl });
      const articles = source.id === 'gdelt' ? parseGdeltNews(JSON.parse(raw), timestamp) : source.id === 'gnews' ? parseGnews(JSON.parse(raw), timestamp) : parseSyndicatedNews(raw, source, timestamp);
      return { source: { id: source.id, name: source.name, url: source.url, status: 'ready', count: articles.length, checkedAt: new Date(timestamp).toISOString() }, articles };
    } catch {
      return { source: { id: source.id, name: source.name, url: source.url, status: 'unavailable', count: 0, checkedAt: new Date(timestamp).toISOString(), error: 'This source could not be checked. Coverage is incomplete.' }, articles: [] };
    }
  }));
  const seen = new Set();
  const articles = outcomes.flatMap(outcome => outcome.articles).filter(article => { if (seen.has(article.url)) return false; seen.add(article.url); return true; }).sort((a, b) => Date.parse(b.publishedAt || b.observedAt) - Date.parse(a.publishedAt || a.observedAt)).slice(0, 60);
  return { fetchedAt: new Date(timestamp).toISOString(), articles, sources: outcomes.map(outcome => outcome.source), guidance: GUIDANCE, coverage: 'Selected public sources worldwide; not a complete news feed or local emergency alert system. Country tags reflect places mentioned in the returned text, not verified impact on your city.', attribution: 'GOV.UK content is used under the Open Government Licence v3.0. UN News headlines link to the original reporting. GDACS reports are from the European Commission and United Nations. GDELT metadata is credited to the GDELT Project.' };
}
