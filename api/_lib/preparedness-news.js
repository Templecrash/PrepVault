import process from 'node:process';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { briefingCountryName, readBriefingLocation } from './briefing-location.js';

const MAX_BYTES = 1_500_000;
const MAX_AGE = 14 * 86400_000;
const NEWS_QUERY = '("oil prices" OR "shipping disruption" OR "supply chain" OR "food shortage" OR "nuclear threat" OR "military escalation" OR "global outage" OR "pandemic warning")';
const AREA_TOPICS = '(emergency OR outage OR evacuation OR flood OR wildfire OR storm OR "boil water" OR shortage OR outbreak OR preparedness)';
const NATIONAL_TOPICS = '(preparedness OR emergency OR blackout OR shortage OR outbreak OR "civil defence" OR "supply chain")';
const COUNTRY_TERMS = {
  CA: /\b(canada|canadian|ottawa|toronto|montreal|vancouver)\b/i,
  US: /\b(united states|u\.s\.|american|california|florida|texas)\b/i,
  GB: /\b(united kingdom|u\.k\.|uk|britain|british|england|scotland|wales|northern ireland)\b/i,
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
  preparedness: /\b(preparedness|emergency (?:kit|supplies|plan|planning)|civil defen[cs]e|stockpil\w*|evacuat\w*|shelter in place)\b|\bprepar\w*\b.{0,60}\b(emergency|disaster|flood\w*|war|crisis|blackout)\b/i,
  conflict: /\b(war|conflict|missile|airstrike|air strike|invasion|ceasefire|hostilities|sanctions|embargo)\b|\b(armed|military|nuclear)\b.{0,40}\b(attack|threat|weapon|strike|offensive|inspection|escalation)\b/i,
  infrastructure: /\b(blackout|outage|cyberattack|cyber attack|ransomware|port closure|fuel shortage|energy crisis)\b|\b(power grid|electricity|energy|fuel|pipeline|infrastructure|supply chain)\b.{0,70}\b(disrupt\w*|shortage|failure|attack|warning|damage|shutdown|ration\w*)\b|\b(disrupt\w*|shortage|failure|attack|warning|damage|shutdown|ration\w*)\b.{0,70}\b(power grid|electricity|energy|fuel|pipeline|infrastructure|supply chain)\b/i,
  disasters: /\b(earthquake|aftershock\w*|tsunami|wildfire|hurricane|typhoon|cyclone|volcan\w*|drought|extreme weather|heatwave|blizzard|tornado|thunderstorm|storm surge)\b/i,
  health: /\b(outbreak|pandemic|epidemic|health emergency|cholera|measles|bird flu)\b|\b(hospital|medicine|medical)\b.{0,60}\b(shortage|outage|emergency|attack|collapse)\b/i,
  'food-water': /\b(famine|hunger crisis|food shortage|food insecurity|boil water|crop failure|water shortage|water contamination|drinking water warning)\b|\b(food|water supply|drinking water|crop)\b.{0,60}\b(shortage|contaminat\w*|failure|disrupt\w*|warning|ration\w*)\b/i,
};
const ROUTINE_POLICY = /\b(budget|loan scheme|factsheet|ceremony|anniversary|scholarship|award ceremony|longevity|retirement planning)\b/i;
const IMMEDIATE_DISRUPTION = /\b(blackout|outage|emergency|disrupt\w*|shortage|ration\w*|evacuat\w*|warning|alert|airstrike|invasion)\b/i;
const ENERGY_MARKET = /\b(oil|crude|gas|petrol|diesel|energy|fuel)\b.{0,60}\b(prices?|markets?|supply|exports?)\b|\b(prices?|markets?|supply|exports?)\b.{0,60}\b(oil|crude|gas|petrol|diesel|energy|fuel)\b/i;
const ENERGY_CHANGE = /\b(rise|rises|rising|rose|surge\w*|spik\w*|jump\w*|soar\w*|hike\w*|fall\w*|fell|drop\w*|plung\w*|higher|lower|record|volatil\w*|disrupt\w*|shortage|crisis|ration\w*|cut\w*|halt\w*|blockade|sanction\w*|warn\w*|threat)\b/i;
const SHIPPING_DISRUPTION = /\b(shipping|freight|suez|hormuz|red sea|panama canal)\b.{0,70}\b(disrupt\w*|shortage|attack\w*|closure|closed|blockade|delay\w*|rerout\w*|warning)\b|\b(disrupt\w*|shortage|attack\w*|closure|closed|blockade|delay\w*|rerout\w*|warning)\b.{0,70}\b(shipping|freight|suez|hormuz|red sea|panama canal)\b/i;
// These words are also used in advertising, sport and politics. Require
// physical weather, warning, recovery or impact evidence in the same sentence.
const AMBIGUOUS_HAZARD = /\b(storms?|flood(?:s|ing|ed)?|landslides?|disasters?)\b/i;
const HAZARD_CONTEXT = /\b(weather|rain\w*|snow\w*|wind\w*|ice|tropical|winter|coastal|flash|severe|river|water|warning|watch|alert|evacuat\w*|rescue\w*|damage\w*|outage|roads?|closed|homes?|fatal\w*|killed|displac\w*|shelter|victims?|recovery|relief|prepar\w*|risk|hazard|forecast\w*|approach\w*|batters?|sweeps?)\b/i;

export const GUIDANCE = [
  { id: 'uk-be-ready', country: 'GB', title: 'UK: Be Ready for emergencies', summary: 'Review the government household checklist, essential supplies and plans for disruptions. This is standing preparedness advice, not a live warning.', url: 'https://beready.campaign.gov.uk/', source: 'UK Government', kind: 'standing-guidance' },
  { id: 'japan-disaster-preparation', country: 'JP', title: 'Japan: disaster preparation and evacuation', summary: 'The Cabinet Office provides evacuation guidance and multilingual disaster information. Check current local instructions separately.', url: 'https://www.bousai.go.jp/index-e.html', source: 'Japan Cabinet Office', kind: 'standing-guidance' },
  { id: 'canada-get-prepared', country: 'CA', title: 'Canada: make an emergency plan', summary: 'Review your risks, household plan and emergency kit with the national preparedness guide.', url: 'https://www.getprepared.gc.ca/', source: 'Government of Canada', kind: 'standing-guidance' },
  { id: 'us-ready', country: 'US', title: 'US: prepare for hazards', summary: 'Use Ready.gov to review emergency supplies, communication plans and guidance for specific hazards.', url: 'https://www.ready.gov/', source: 'Ready.gov / FEMA', kind: 'standing-guidance' },
];

export function classifyNews(text) {
  const topics = Object.entries(TOPIC_TERMS).filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
  const sentences = String(text).split(/[.!?\n]+/);
  if (!topics.includes('infrastructure') && (sentences.some(sentence => ENERGY_MARKET.test(sentence) && ENERGY_CHANGE.test(sentence)) || SHIPPING_DISRUPTION.test(text))) topics.push('infrastructure');
  if (!topics.includes('disasters') && sentences.some(sentence => AMBIGUOUS_HAZARD.test(sentence) && (HAZARD_CONTEXT.test(sentence) || /\bflood(?:s|ing)? (?:in|across|near|hits|forces)\b/i.test(sentence)))) topics.push('disasters');
  return { topics, countries: Object.entries(COUNTRY_TERMS).filter(([, pattern]) => pattern.test(text)).map(([country]) => country) };
}

function classifyArticle(title, summary, headlinesOnly = false) {
  const headline = classifyNews(title);
  if (headlinesOnly) return headline;
  const detail = classifyNews(summary);
  // A passing reference to oil prices in a housing/business excerpt does not
  // make energy the story's subject. Direct disruptions can still be reported
  // in the excerpt when a short headline omits the hazard.
  const topics = [...new Set([...headline.topics, ...detail.topics.filter(topic => topic !== 'infrastructure' || TOPIC_TERMS.infrastructure.test(summary) || SHIPPING_DISRUPTION.test(summary))])];
  return { topics, countries: [...new Set([...headline.countries, ...detail.countries])] };
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
    const publisher = source.publisherMetadata ? clean(row.find('source').first().text(), 100) : '';
    const rawTitle = clean(row.find('title').first().text(), 220);
    const suffix = publisher ? ` - ${publisher}` : '';
    const title = suffix && rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length).trim() : rawTitle;
    const description = clean(row.find('description,summary').first().text(), 1200);
    const link = row.find('link[rel="alternate"]').first().attr('href') || row.find('link').first().attr('href') || row.find('link').first().text();
    const url = articleUrl(link, source.allowedHost);
    const publication = row.find('published, pubDate').first().text();
    const publishedAt = recentDate(publication || row.find('updated').first().text(), now);
    const dateBasis = publication ? 'published' : 'updated';
    // For headline-only sources, evidence must be visible in the headline;
    // hidden excerpts and repeated publisher names cannot supply relevance.
    const { topics, countries } = classifyArticle(title, description, source.headlinesOnly || source.publisherMetadata);
    if (ROUTINE_POLICY.test(title) && !IMMEDIATE_DISRUPTION.test(`${title} ${description}`)) continue;
    if (!title || !url || !publishedAt || !topics.length) continue;
    articles.push({ id: idFor(url), title, summary: source.headlinesOnly ? '' : description.slice(0, 300), url, source: publisher || source.name, sourceId: source.id, sourceUrl: source.url, publishedAt, observedAt: null, dateBasis, kind: source.kind, topics, countries });
    if (articles.length >= (source.limit || 12)) break;
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
  }).slice(0, 30);
}

export function parseGnews(data, now = Date.now()) {
  if (!data || !Array.isArray(data.articles)) throw new Error('Invalid news response.');
  return data.articles.slice(0, 20).flatMap(row => {
    const title = clean(row.title, 220); const summary = clean(row.description, 300); const url = articleUrl(row.url);
    const publishedAt = recentDate(row.publishedAt, now); const { topics, countries } = classifyArticle(title, summary);
    if (ROUTINE_POLICY.test(title) && !IMMEDIATE_DISRUPTION.test(`${title} ${summary}`)) return [];
    if (!title || !url || !publishedAt || !topics.length) return [];
    return [{ id: idFor(url), title, summary, url, source: clean(row.source?.name, 100) || new URL(url).hostname, sourceId: 'gnews', sourceUrl: 'https://gnews.io/', publishedAt, observedAt: null, dateBasis: 'published', kind: 'news', topics, countries }];
  }).slice(0, 12);
}

export async function fetchBriefingSource(url, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(6000, Math.max(1, timeoutMs)));
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/rss+xml, application/atom+xml, application/json, text/xml, */*;q=0.5', 'User-Agent': 'PrepVault/2.0' } });
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

// Regional feeds are listed at https://www.cbc.ca/rss/; never derive a feed
// hostname or path from caller input. Headline metadata only, not article text.
const CBC_CITIES = {
  ottawa: 'ottawa', toronto: 'toronto', london: 'london', windsor: 'windsor',
  hamilton: 'hamiltonnews', kitchener: 'kitchenerwaterloo', waterloo: 'kitchenerwaterloo',
  sudbury: 'sudbury', 'thunder bay': 'thunderbay', montreal: 'montreal', montréal: 'montreal',
  calgary: 'calgary', edmonton: 'edmonton', saskatoon: 'saskatoon', kamloops: 'kamloops',
};
const CBC_REGIONS = {
  'british columbia': 'britishcolumbia', manitoba: 'manitoba', saskatchewan: 'saskatchewan',
  'new brunswick': 'newbrunswick', 'prince edward island': 'pei', 'nova scotia': 'novascotia',
  'newfoundland and labrador': 'newfoundland', yukon: 'north', nunavut: 'north', 'northwest territories': 'north',
};
function cbcSources(location) {
  if (location?.countryCode !== 'CA') return [];
  const feed = (suffix, name, scope) => ({ id: `cbc-${suffix || 'canada'}`, name: `CBC · ${name} preparedness reporting`, url: 'https://www.cbc.ca/news', feed: `https://www.cbc.ca/webfeed/rss/rss-canada${suffix ? `-${suffix}` : ''}`, allowedHost: 'www.cbc.ca', kind: 'news', headlinesOnly: true, limit: 24, retrievalScope: scope, retrievalCountryCode: 'CA' });
  const cityFeed = CBC_CITIES[location.city.toLocaleLowerCase('en')];
  const regionFeed = CBC_REGIONS[location.region.toLocaleLowerCase('en')];
  const cityRegion = { montreal: 'Quebec', calgary: 'Alberta', edmonton: 'Alberta', saskatoon: 'Saskatchewan', kamloops: 'British Columbia' }[cityFeed] || 'Ontario';
  return [...(cityFeed || regionFeed ? [{ ...feed(cityFeed || regionFeed, cityFeed ? `${location.city} region` : location.region, 'regional'), retrievalEvidence: 'regional-feed', retrievalRegion: cityFeed ? cityRegion : location.region }] : []), feed('', 'Canada', 'national')];
}

export function buildBriefingSearches(location) {
  const macro = { scope: 'macro', name: 'Wider preparedness developments', query: NEWS_QUERY };
  if (!location) return [macro];
  const country = briefingCountryName(location.countryCode);
  const area = [location.city, location.region].filter(Boolean).join(', ');
  // All names have been validated and are quoted. GDELT supports adjacent OR
  // blocks, not nested ones. GNews uses explicit AND for the same search.
  const context = location.region && location.region.toLowerCase() !== location.city.toLowerCase()
    ? `("${location.region}" OR "${country}")` : `"${country}"`;
  return [
    { scope: 'local', name: `${area} · local preparedness search`, query: `"${location.city}" ${context} ${AREA_TOPICS}`, countryCode: location.countryCode },
    { scope: 'national', name: `${country} · national preparedness search`, query: `"${country}" ${NATIONAL_TOPICS}`, countryCode: location.countryCode },
    macro,
  ];
}

function searchSources(search, gnewsKey) {
  const gnewsQuery = search.query.replace(/" (\(|")/g, '" AND $1').replace(/\) \(/g, ') AND (');
  const useGnews = Boolean(gnewsKey) && gnewsQuery.length <= 200;
  const provider = useGnews ? 'gnews' : 'gdelt';
  const id = search.scope === 'macro' ? provider : `${provider}-${search.scope}`;
  const metadata = { retrievalScope: search.scope, retrievalCountryCode: search.countryCode || null };
  const primary = {
    id, name: `${useGnews ? 'GNews' : 'GDELT'} · ${search.name}`, kind: 'news', parser: provider,
    url: useGnews ? 'https://gnews.io/' : 'https://www.gdeltproject.org/', ...metadata,
    feed: useGnews
      ? `https://gnews.io/api/v4/search?${new URLSearchParams({ q: gnewsQuery, lang: 'en', max: '10', sortby: 'publishedAt', apikey: gnewsKey })}`
      : `https://api.gdeltproject.org/api/v2/doc/doc?${new URLSearchParams({ query: `${search.query} sourcelang:english`, mode: 'artlist', format: 'json', timespan: '7d', maxrecords: '50', sort: 'datedesc' })}`,
  };
  // Public RSS fallback is deliberately headline-only. Links stay on Google
  // News; the publisher remains credited. No private account or key is used.
  const edition = search.countryCode === 'CA' ? 'CA' : search.countryCode === 'GB' ? 'GB' : search.countryCode === 'AU' ? 'AU' : 'US';
  const fallback = {
    id: `google-news-${search.scope}`, name: `Google News · ${search.name} (fallback)`, kind: 'news',
    url: 'https://news.google.com/', ...metadata, allowedHost: 'news.google.com',
    feed: `https://news.google.com/rss/search?${new URLSearchParams({ q: `${search.query} when:7d`, hl: `en-${edition}`, gl: edition, ceid: `${edition}:en` })}`,
    headlinesOnly: true, publisherMetadata: true, limit: 30,
  };
  return { primary, fallback };
}

export async function loadPreparednessBriefing({ fetchImpl = fetch, now = Date.now, gnewsKey = process.env.GNEWS_API_KEY, location: inputLocation = null } = {}) {
  const location = inputLocation ? readBriefingLocation(inputLocation) : null;
  const timestamp = now();
  const sources = [
    ...cbcSources(location),
    { id: 'govuk-preparedness', name: 'GOV.UK preparedness updates', url: 'https://www.gov.uk/search/news-and-communications?keywords=preparedness', feed: 'https://www.gov.uk/search/news-and-communications.atom?keywords=preparedness', allowedHost: 'www.gov.uk', kind: 'official', retrievalScope: 'macro' },
    { id: 'govuk-international', name: 'GOV.UK international updates', url: 'https://www.gov.uk/search/news-and-communications?keywords=conflict', feed: 'https://www.gov.uk/search/news-and-communications.atom?keywords=conflict', allowedHost: 'www.gov.uk', kind: 'official', retrievalScope: 'macro' },
    { id: 'gdacs', name: 'GDACS global disaster reports', url: 'https://www.gdacs.org/', feed: 'https://www.gdacs.org/xml/rss.xml', allowedHost: 'www.gdacs.org', kind: 'official', retrievalScope: 'macro' },
    { id: 'un-news', name: 'UN News · peace and security', url: 'https://news.un.org/en/news/topic/peace-and-security', feed: 'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml', allowedHost: 'news.un.org', kind: 'news', headlinesOnly: true, retrievalScope: 'macro' },
  ];
  async function readSource(source, timeoutMs = 6000) {
    const checkedAt = new Date(timestamp).toISOString();
    const metadata = { retrievalScope: source.retrievalScope, retrievalCountryCode: source.retrievalCountryCode || null,
      ...(source.retrievalEvidence ? { retrievalEvidence: source.retrievalEvidence, retrievalRegion: source.retrievalRegion } : {}) };
    try {
      const raw = await fetchBriefingSource(source.feed, { fetchImpl, timeoutMs });
      const rows = source.parser === 'gdelt' ? parseGdeltNews(JSON.parse(raw), timestamp) : source.parser === 'gnews' ? parseGnews(JSON.parse(raw), timestamp) : parseSyndicatedNews(raw, source, timestamp);
      const articles = rows.map(article => ({ ...article, ...metadata }));
      return { source: { id: source.id, name: source.name, url: source.url, status: 'ready', count: articles.length, checkedAt, scope: source.retrievalScope, ...metadata }, articles };
    } catch {
      return { source: { id: source.id, name: source.name, url: source.url, status: 'unavailable', count: 0, checkedAt, scope: source.retrievalScope, ...metadata, error: 'This source could not be checked. Coverage for this area is incomplete.' }, articles: [] };
    }
  }
  const batches = await Promise.all([
    ...sources.map(async source => [await readSource(source)]),
    ...buildBriefingSearches(location).map(async search => {
      const { primary, fallback } = searchSources(search, gnewsKey);
      const outcome = await readSource(primary);
      // Empty indexed results also benefit from an independent public feed;
      // keep the primary status visible rather than hiding a provider failure.
      return outcome.articles.length ? [outcome] : [outcome, await readSource(fallback, 4500)];
    }),
  ]);
  const outcomes = batches.flat();
  const recency = (a, b) => Date.parse(b.publishedAt || b.observedAt) - Date.parse(a.publishedAt || a.observedAt);
  const candidates = outcomes.flatMap(outcome => outcome.articles);
  const scopeOrder = { local: 0, regional: 1, national: 2 };
  const area = candidates.filter(article => article.retrievalScope !== 'macro').sort((a, b) => scopeOrder[a.retrievalScope] - scopeOrder[b.retrievalScope] || recency(a, b));
  const macro = candidates.filter(article => article.retrievalScope === 'macro').sort(recency);
  const seen = new Set();
  const unique = rows => rows.filter(article => { if (seen.has(article.url)) return false; seen.add(article.url); return true; });
  // Preserve a local/national candidate budget before global feed limits. Scope
  // describes retrieval only, never verified impact on the user's location.
  const areaArticles = unique(area).slice(0, 68);
  const articles = [...areaArticles, ...unique(macro).slice(0, 100 - areaArticles.length)];
  return { fetchedAt: new Date(timestamp).toISOString(), articles, sources: outcomes.map(outcome => outcome.source), guidance: GUIDANCE,
    coverageContext: location,
    coverage: location ? `Searches for ${[location.city, location.region, briefingCountryName(location.countryCode)].filter(Boolean).join(', ')}, national preparedness reporting and wider developments. Search matches are not verified local impact or emergency alerts.` : 'Selected public sources worldwide; not a complete news feed or local emergency alert system.',
    attribution: 'GOV.UK content is used under the Open Government Licence v3.0. Publisher headlines link to the original reporting or Google News. CBC and UN News article text and photographs are not copied. GDACS reports are from the European Commission and United Nations. Search metadata is credited to GDELT, GNews and Google News as available.' };
}
