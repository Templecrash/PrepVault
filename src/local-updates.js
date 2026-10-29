import { normalizeBriefingLocation, briefingLocationKey } from './briefing-relevance.js';

const clean = (value, max = 300) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : '';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const url = value => { try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.href.length < 2000 ? parsed.href : null; } catch { return null; } };
export function normalizeLocalUpdates(value, location) {
  if (!value || !date(value.fetchedAt) || !Array.isArray(value.updates) || !Array.isArray(value.sources) || briefingLocationKey(value.location) !== briefingLocationKey(location)) throw new Error('Local updates did not match this city. Refresh to try again.');
  return {
    location: normalizeBriefingLocation(value.location), fetchedAt: date(value.fetchedAt),
    updates: value.updates.slice(0, 40).flatMap(row => {
      const link = url(row?.url), title = clean(row?.title), publishedAt = date(row?.publishedAt);
      if (!link || !title || !publishedAt || !['police', 'city'].includes(row?.kind)) return [];
      return [{ id: clean(row.id) || link, title, url: link, publishedAt, datePrecision: row.datePrecision === 'day' ? 'day' : 'time', timestampBasis: row.timestampBasis === 'reported' ? 'reported' : 'published', source: clean(row.source, 100), kind: row.kind, summary: clean(row.summary, 500) }];
    }),
    sources: value.sources.slice(0, 12).map(row => ({ name: clean(row.name, 100), url: url(row.url), status: ['ready', 'empty', 'unavailable', 'unsupported'].includes(row.status) ? row.status : 'unavailable', error: clean(row.error), note: clean(row.note, 600) })),
    channels: (Array.isArray(value.channels) ? value.channels : []).slice(0, 12).flatMap(row => url(row?.url) && clean(row?.name) ? [{ name: clean(row.name, 100), url: url(row.url), kind: clean(row.kind, 20) }] : []),
  };
}

export async function getLocalUpdates(location, { signal, fetchImpl = fetch } = {}) {
  const context = normalizeBriefingLocation(location);
  if (!context) throw new Error('Choose a city for local updates.');
  const response = await fetchImpl(`/api/local-updates?${new URLSearchParams(context)}`, { credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(16000)]) : AbortSignal.timeout(16000) });
  const data = await response.json();
  if (!response.ok) throw new Error(clean(data?.error) || 'Local updates are unavailable.');
  return normalizeLocalUpdates(data, context);
}

export function recentPostsUrl(location, now = Date.now()) {
  const context = normalizeBriefingLocation(location);
  if (!context) return 'https://x.com/search';
  const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(context.countryCode);
  const area = context.region ? `("${context.region}" OR "${country}")` : `"${country}"`;
  const since = new Date(now - 48 * 3600000).toISOString().slice(0, 10);
  const q = `"${context.city}" ${area} (police OR emergency OR evacuation OR outage OR closure OR flood OR fire) -filter:retweets since:${since}`;
  return `https://x.com/search?${new URLSearchParams({ q, src: 'typed_query', f: 'live' })}`;
}

export function localUpdateDate(row) {
  if (row.datePrecision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(row.publishedAt)) return new Date(`${row.publishedAt}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return new Date(row.publishedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
