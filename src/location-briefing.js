import { normalizeBriefingLocation, briefingLocationKey } from './briefing-relevance.js';
export { briefingLocationKey, selectRelevantBriefing, articleRelevance } from './briefing-relevance.js';

export const BRIEFING_TOPICS = {
  preparedness: 'Preparedness', conflict: 'Conflict & security', disasters: 'Disasters',
  infrastructure: 'Power & infrastructure', 'food-water': 'Food & water', health: 'Health',
};

const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function normalizeBriefing(value) {
  if (!value || !Array.isArray(value.articles) || !Array.isArray(value.sources) || !date(value.fetchedAt)) throw new Error('The briefing returned an incomplete response. Try again shortly.');
  const seen = new Set();
  const articles = value.articles.slice(0, 100).flatMap(row => {
    const url = safeUrl(row?.url); const title = clean(row?.title, 300);
    if (!url || !title || seen.has(url)) return [];
    seen.add(url);
    return [{ id: clean(row.id, 200) || url, title, url, summary: clean(row.summary, 500), source: clean(row.source, 100) || 'Source',
      publishedAt: date(row.publishedAt), observedAt: date(row.observedAt), dateBasis: ['published', 'updated', 'indexed'].includes(row.dateBasis) ? row.dateBasis : null, kind: row.kind === 'official' ? 'official' : 'news',
      topics: Array.isArray(row.topics) ? [...new Set(row.topics.filter(topic => BRIEFING_TOPICS[topic]))] : [],
      countries: Array.isArray(row.countries) ? [...new Set(row.countries.filter(code => typeof code === 'string' && /^[A-Z]{2}$/.test(code)))] : [],
      retrievalScope: ['local', 'regional', 'national', 'macro'].includes(row.retrievalScope) ? row.retrievalScope : null,
      retrievalCountryCode: typeof row.retrievalCountryCode === 'string' && /^[A-Z]{2}$/.test(row.retrievalCountryCode) ? row.retrievalCountryCode : null,
      retrievalEvidence: row.retrievalEvidence === 'regional-feed' ? 'regional-feed' : null,
      retrievalRegion: clean(row.retrievalRegion, 100),
    }];
  });
  let coverageContext = null;
  try { coverageContext = normalizeBriefingLocation(value.coverageContext); } catch { /* Ignore invalid optional source context. */ }
  return { fetchedAt: date(value.fetchedAt), articles, coverageContext, attribution: clean(value.attribution, 800),
    sources: value.sources.slice(0, 20).map(row => ({ name: clean(row.name, 100) || 'Source', status: clean(row.status, 30), url: safeUrl(row.url), error: clean(row.error, 250), scope: ['local', 'regional', 'national', 'macro'].includes(row.scope) ? row.scope : null })),
    guidance: (Array.isArray(value.guidance) ? value.guidance : []).slice(0, 8).flatMap(row => {
      const url = safeUrl(row?.url); const title = clean(row?.title, 200);
      return url && title ? [{ title, url, summary: clean(row.summary, 400), country: clean(row.country, 100), kind: 'standing-guidance' }] : [];
    }),
  };
}

export async function getPreparednessBriefing({ location, signal, fetchImpl = fetch } = {}) {
  const timeout = AbortSignal.timeout(15000);
  const context = normalizeBriefingLocation(location);
  const query = context ? `?${new URLSearchParams(context)}` : '';
  const response = await fetchImpl(`/api/location-briefing${query}`, {
    credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(clean(data?.error, 300) || 'The briefing could not be checked. Try again later.');
  const result = normalizeBriefing(data);
  if (context && briefingLocationKey(result.coverageContext) !== briefingLocationKey(context)) throw new Error('The briefing did not match the selected city. Refresh to check this area again.');
  return result;
}

export function filterBriefing(articles, { topic = 'all', country = 'all', watchedCountries = [] } = {}) {
  return articles.filter(article => (topic === 'all' || article.topics.includes(topic)) &&
    (country === 'all' || (country === 'watched' ? article.countries.some(code => watchedCountries.includes(code)) : article.countries.includes(country))))
    .sort((a, b) => (Date.parse(b.publishedAt || b.observedAt) || 0) - (Date.parse(a.publishedAt || a.observedAt) || 0));
}

export function availableBriefingCountry(country, countryCodes, hasWatchedCities) {
  return country === 'all' || (country === 'watched' ? hasWatchedCities : countryCodes.includes(country)) ? country : 'all';
}

// Select recent source material across topics; never infer a personal warning
// or a claim that a country is preparing for war from a preparedness article.
export function briefingHighlights(articles, limit = 4) {
  const chosen = []; const topics = new Set();
  if (articles.some(article => article.relevance)) {
    // Reserve room for local information before the national and wider picture.
    for (const scopes of [['local', 'regional'], ['national'], ['macro']]) {
      const article = articles.find(value => scopes.includes(value.relevance?.scope));
      if (article && chosen.length < limit) chosen.push(article);
    }
    for (const article of articles) { if (chosen.length >= limit) break; if (!chosen.includes(article)) chosen.push(article); }
    return chosen;
  }
  for (const article of articles) {
    if (chosen.length >= limit) break;
    if (article.topics.some(topic => !topics.has(topic)) || !chosen.length) {
      chosen.push(article); article.topics.forEach(topic => topics.add(topic));
    }
  }
  for (const article of articles) { if (chosen.length >= limit) break; if (!chosen.includes(article)) chosen.push(article); }
  return chosen;
}

export function shortBriefingText(article) {
  const text = article.summary || article.title;
  if (text.length <= 220) return text;
  const sentence = text.match(/^.{40,219}?[.!?](?:\s|$)/)?.[0]?.trim();
  if (sentence) return sentence;
  return `${text.slice(0, 217).replace(/\s+\S*$/, '')}…`;
}
