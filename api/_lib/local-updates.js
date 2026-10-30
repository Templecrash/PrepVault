import { createHash } from 'node:crypto';
import { load as loadHtml } from 'cheerio';
import { readBriefingLocation } from './briefing-location.js';

export const LOCAL_UPDATES_WINDOW_DAYS = 7;
const MAX_BYTES = 2_000_000;
const MAX_AGE = LOCAL_UPDATES_WINDOW_DAYS * 86400_000;
const POLICE_WINDOW_MS = 4 * 3600_000;
const cleanText = (value, max = 240) => {
  if (typeof value !== 'string') return '';
  const $ = loadHtml(value); $('script,style,iframe').remove();
  return $.text().replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
};

export function localUpdateArea(location) {
  return location?.countryCode === 'CA' && location.city.toLocaleLowerCase('en') === 'toronto' &&
    ['', 'ontario', 'on'].includes(location.region.toLocaleLowerCase('en')) ? 'toronto' : null;
}

export function classifyLocalUpdate(title, kind) {
  if (kind === 'police' && /\b(impaired.driver|mvc|traffic.hazard)\b/i.test(title)) return 'transport';
  if (kind === 'police' && /\b(gunshots?|shots.fired|explosion\w*|break\s*(?:&|and)\s*enter)\b/i.test(title)) return 'public-safety';
  if (/\b(evacuat\w*|shelter.in.place|state of emergency)\b/i.test(title)) return 'emergency';
  if (/\b(boil.water|drinking.water|water.main|power.outage|blackout|hydro|water.service|water.disruption)\b/i.test(title)) return 'utilities';
  if (/\b(outbreak|measles|rabies|health.advisory|health.warning|food.recall|contaminat\w*)\b/i.test(title)) return 'health';
  if (/\b(flood\w*|storm\w*|heat.warning|extreme.cold|extreme.heat|wildfire\w*|snow\w*|blizzard|ice.storm|weather.warning)\b/i.test(title)) return 'weather';
  if (/\b(road.closur\w*|roads?.closed|highway.clos\w*|parkway.closed|expressway.closed|traffic|collision\w*|transit.disruption|ttc.disruption|subway.clos\w*|travel.advisory)\b/i.test(title)) return 'transport';
  if (/\b(emergency.prepar\w*|emergency.kit\w*|emergency.plan\w*|disaster.prepar\w*)\b/i.test(title)) return 'preparedness';
  if (kind === 'police' && /\b(public.safety|warning|alert|advisory|missing|locat\w*|shooting\w*|stabbing\w*|homicide\w*|firearm\w*|armed|threat\w*|robber\w*|assault\w*|kidnap\w*|abduct\w*|suspicious|dangerous|sexual|arson|hate.crime|fraud|scam\w*|weapon\w*|fatal|pedestrian.struck|hit.and.run|break.and.enter|wanted)\b/i.test(title)) return 'public-safety';
  if (/\b(fire.at|fire.in|hazardous.spill|public.safety|safety.advisory|safety.warning|service.disruption|emergency.shelter|warming.cent\w*|cooling.cent\w*)\b/i.test(title)) return 'public-safety';
  return null;
}

function officialUrl(value, source) {
  try {
    const url = new URL(value, source.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname !== new URL(source.url).hostname || !url.pathname.startsWith(source.articlePath)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    return url.href.length <= 1800 ? url.href : null;
  } catch { return null; }
}

const torontoDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

function normalizeUpdate(raw, source, now) {
  const title = cleanText(raw.title);
  const url = typeof raw.url === 'string' ? officialUrl(raw.url, source) : null;
  const published = typeof raw.publishedAt === 'string' ? Date.parse(raw.publishedAt) : NaN;
  if (!title || !url || !Number.isFinite(published)) return { valid: false };
  const category = classifyLocalUpdate(title, source.kind);
  const recent = raw.datePrecision === 'day'
    ? raw.publishedAt >= torontoDay(now - MAX_AGE) && raw.publishedAt <= torontoDay(now)
    : published >= now - MAX_AGE && published <= now + 3600_000;
  if (!category || !recent) return { valid: true, update: null };
  return { valid: true, update: {
    id: createHash('sha256').update(`${source.id}:${url}`).digest('hex').slice(0, 24),
    title, url, publishedAt: raw.datePrecision === 'day' ? raw.publishedAt : new Date(published).toISOString(), datePrecision: raw.datePrecision || 'time', publishedTimezone: 'America/Toronto', timestampBasis: 'published', source: source.name, sourceId: source.id,
    authority: source.authority, kind: source.kind, category,
  } };
}

export async function fetchLocalUpdateSource(url, { fetchImpl = globalThis.fetch, timeoutMs = 6500 } = {}) {
  const allowed = new URL(url);
  if (allowed.protocol !== 'https:' || allowed.username || allowed.password || allowed.port || !SOURCE_ENDPOINTS.has(allowed.href)) throw new Error('Unsupported official source.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(6500, timeoutMs)));
  try {
    const response = await fetchImpl(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json, application/rss+xml, text/html;q=0.8', 'User-Agent': 'PrepVault/2.0 (https://prepvault-xi.vercel.app)' } });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body?.getReader) { await response.body?.cancel(); throw new Error('Official source unavailable.'); }
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) { await reader.cancel(); throw new Error('Official response too large.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { clearTimeout(timer); }
}

// Public ownership/provenance: Toronto Police's official Public Safety Data
// Portal links this map; its web map 26a2caadab744ac7a698f400a799df44 contains
// the C4S layer below. Its dateFieldsTimeReference explicitly specifies UTC.
const POLICE_MAP = 'https://experience.arcgis.com/experience/a22f5295933e48a5b0a4c90cd3c4cae1/';
const POLICE_QUERY = 'https://services.arcgis.com/S9th0jAJ7bqgIRjw/arcgis/rest/services/C4S_Public_NoGO/FeatureServer/0/query?' + new URLSearchParams({
  where: '1=1', outFields: 'OCCURRENCE_TIME,CALL_TYPE,CROSS_STREETS,LATITUDE,LONGITUDE',
  returnGeometry: 'false', orderByFields: 'OCCURRENCE_TIME DESC', resultRecordCount: '500', f: 'json',
}).toString();
export const TORONTO_LOCAL_SOURCES = Object.freeze([
  Object.freeze({ id: 'toronto-police-calls', name: 'Toronto Police · public calls', authority: 'Toronto Police Service', kind: 'police', url: POLICE_MAP, feed: POLICE_QUERY,
    note: 'Reported calls from the past four hours. Approximate streets only; calls may be resolved. Some incidents are withheld by police.' }),
  Object.freeze({ id: 'toronto-city-news', name: 'City of Toronto · official news', authority: 'City of Toronto', kind: 'city', url: 'https://www.toronto.ca/news/', feed: 'https://www.toronto.ca/news/', articlePath: '/news/',
    note: 'Relevant official notices published in the past seven days. Publication does not confirm that a notice is still in effect.' }),
]);
const SOURCE_ENDPOINTS = new Set(TORONTO_LOCAL_SOURCES.map(source => source.feed));
const TORONTO_CHANNELS = Object.freeze([
  { name: 'Toronto Police public calls map', url: POLICE_MAP, kind: 'police' },
  { name: 'Toronto Police news releases', url: 'https://www.tps.ca/media-centre/news-releases/', kind: 'police' },
  { name: 'TPS Operations on X', url: 'https://x.com/TPSOperations', kind: 'social' },
  { name: 'City of Toronto official news', url: 'https://www.toronto.ca/news/', kind: 'city' },
]);

export function parseTorontoPoliceCalls(data, now = Date.now()) {
  if (!data || typeof data !== 'object' || data.error || !Array.isArray(data.features) || data.features.length > 500) throw new Error('Invalid police call response.');
  const source = TORONTO_LOCAL_SOURCES[0]; const seen = new Set(); const updates = []; let valid = 0;
  for (const row of data.features) {
    const values = row?.attributes;
    const type = cleanText(values?.CALL_TYPE, 120);
    const time = values?.OCCURRENCE_TIME;
    const latitude = values?.LATITUDE; const longitude = values?.LONGITUDE;
    if (!type || typeof time !== 'number' || !Number.isFinite(time) || time <= 0 ||
        typeof latitude !== 'number' || !Number.isFinite(latitude) || typeof longitude !== 'number' || !Number.isFinite(longitude)) continue;
    valid++;
    const streets = cleanText(values.CROSS_STREETS, 200).replace(/\s*-\s*$/, '').replace(/^\s*-\s*/, '').trim();
    // Withheld locations have sentinels outside Toronto; do not display those
    // points as real places or return any coordinates to the browser.
    if (latitude < 43.55 || latitude > 43.9 || longitude < -79.65 || longitude > -79 || !/\p{L}/u.test(streets) || time < now - POLICE_WINDOW_MS || time > now + 300_000) continue;
    // The public source already excludes sensitive calls. Retain incident types
    // relevant to situational awareness, rather than administrative call codes.
    const category = classifyLocalUpdate(type, 'police') || (/\b(arrest|disorderl\w*|theft|break\s*and\s*enter|fire|alarm|unknown.trouble|person.with|hazard|rescue)\b/i.test(type) ? 'public-safety' : null);
    if (!category) continue;
    const id = createHash('sha256').update(`${source.id}:${time}:${type}:${streets}`).digest('hex').slice(0, 24);
    if (seen.has(id)) continue;
    seen.add(id);
    updates.push({ id, title: `${type} · ${streets}`, url: source.url, publishedAt: new Date(time).toISOString(), datePrecision: 'time', publishedTimezone: 'America/Toronto', timestampBasis: 'reported',
      source: source.name, sourceId: source.id, authority: source.authority, kind: 'police', category, status: 'reported', area: streets });
  }
  if (data.features.length && !valid) throw new Error('No valid police call records.');
  return { updates: updates.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 24), truncated: data.exceededTransferLimit === true || updates.length > 24 };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function torontoNewsDate(value) {
  const match = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(value);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]); const day = Number(match[2]); const year = Number(match[3]);
  if (month < 0 || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCMonth() === month && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}
export function parseTorontoCityNews(html, now = Date.now()) {
  if (typeof html !== 'string' || !html.includes('post-type-archive-news')) throw new Error('Invalid city news page.');
  const $ = loadHtml(html); const table = $('table.cot-table').filter((_i, el) => /List of Media Room Items/i.test($(el).find('caption').text())).first();
  if (!table.length) throw new Error('Missing city news list.');
  const rows = table.find('tr').filter((_i, el) => $(el).children('td').length > 0).toArray();
  const source = TORONTO_LOCAL_SOURCES[1]; const updates = []; const seen = new Set(); let valid = 0;
  for (const element of rows.slice(0, 100)) {
    const cells = $(element).children('td'); const link = cells.eq(0).find('a').first();
    const publishedAt = torontoNewsDate(cleanText(cells.eq(1).text(), 40));
    const result = normalizeUpdate({ title: link.text(), url: link.attr('href'), publishedAt, datePrecision: 'day' }, source, now);
    if (!result.valid) continue;
    valid++;
    if (!result.update || seen.has(result.update.id)) continue;
    seen.add(result.update.id); updates.push(result.update);
  }
  if (rows.length && !valid) throw new Error('No valid city news records.');
  return { updates: updates.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 12), truncated: rows.length > 100 || updates.length > 12 };
}

export async function loadLocalUpdates({ location: inputLocation, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const location = inputLocation ? readBriefingLocation(inputLocation) : null;
  if (!location) throw new Error('Choose a city to check local updates.');
  const fetchedAt = new Date(now()).toISOString();
  if (!localUpdateArea(location)) return { location, fetchedAt, windowDays: LOCAL_UPDATES_WINDOW_DAYS, updates: [], channels: [], sources: [
    { id: 'local-official-updates', name: 'Official local updates', url: null, kind: 'city', status: 'unsupported', count: 0, checkedAt: null, error: 'An official local feed is not connected for this city yet.' },
  ] };
  const outcomes = await Promise.all(TORONTO_LOCAL_SOURCES.map(async source => {
    const metadata = { id: source.id, name: source.name, url: source.url, authority: source.authority, kind: source.kind, note: source.note, checkedAt: fetchedAt };
    try {
      const body = await fetchLocalUpdateSource(source.feed, { fetchImpl });
      const result = source.kind === 'police' ? parseTorontoPoliceCalls(JSON.parse(body), now()) : parseTorontoCityNews(body, now());
      return { updates: result.updates, source: { ...metadata, status: result.updates.length ? 'ready' : 'empty', count: result.updates.length, truncated: result.truncated } };
    } catch {
      return { updates: [], source: { ...metadata, status: 'unavailable', count: 0, error: 'This official source could not be checked. Open the source for current information.' } };
    }
  }));
  return { location, fetchedAt, windowDays: LOCAL_UPDATES_WINDOW_DAYS, updates: outcomes.flatMap(outcome => outcome.updates).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), sources: outcomes.map(outcome => outcome.source), channels: TORONTO_CHANNELS.map(channel => ({ ...channel })) };
}
