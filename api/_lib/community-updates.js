import { readBriefingLocation } from './briefing-location.js';
import { loadPublicXPosts } from './public-x-posts.js';
import { loadLocalReddit } from './local-reddit.js';

const clean = (value, max = 300) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : '';
const displayTitle = value => {
  const text = clean(value, 1000).replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  return text.length > 280 ? `${text.slice(0, 277).replace(/\s+\S*$/, '')}…` : text;
};
const priority = { emergency: 5, 'public-safety': 4, security: 4, health: 3, weather: 3, utilities: 3, transport: 2, preparedness: 1 };
const allowedUrl = value => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2200) return null;
    if (url.hostname === 'news.google.com' && url.pathname.startsWith('/rss/articles/')) return url.href;
    if (['www.reddit.com', 'reddit.com'].includes(url.hostname) && /^\/r\/[^/]+\/comments\/[^/]+\//.test(url.pathname)) return url.href;
    if (['x.com', 'twitter.com'].includes(url.hostname) && /^\/[A-Za-z0-9_]+\/status\/\d+\/?$/.test(url.pathname)) return url.href;
  } catch { /* Ignore malformed upstream links. */ }
  return null;
};

export async function loadCommunityUpdates({ location: input, now = Date.now, loadX = loadPublicXPosts, loadReddit = loadLocalReddit } = {}) {
  const location = readBriefingLocation(input);
  if (!location) throw new Error('Choose a city.');
  const results = await Promise.allSettled([loadX({ location, now }), loadReddit({ location, now })]);
  const kinds = ['x', 'reddit']; const sources = []; const posts = []; const seen = new Set(); const headlines = new Set();
  results.forEach((result, index) => {
    const kind = kinds[index];
    if (result.status !== 'fulfilled') { sources.push({ id: kind, name: kind === 'x' ? 'Public X index' : 'Reddit', status: 'unavailable', note: 'This source could not be checked.' }); return; }
    const data = result.value;
    if (Array.isArray(data.sources)) sources.push(...data.sources);
    else if (data.source) sources.push(data.source);
    for (const row of (data.posts || []).slice(0, 30)) {
      const title = displayTitle(row.title); const url = allowedUrl(row.url);
      const headlineKey = title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\b(a|an|the|in|at|on|and)\b/g, '').replace(/\s+/g, ' ').trim();
      const indexed = row.dateBasis === 'index' || !row.publishedAt;
      const date = indexed ? row.sourceDate || row.indexedAt : row.publishedAt;
      const time = Date.parse(date);
      if (!title || !url || seen.has(url) || (headlineKey.length > 60 && headlines.has(headlineKey)) || !Number.isFinite(time) || time > now() + 3600000 || time < now() - 7 * 86400000) continue;
      seen.add(url); headlines.add(headlineKey);
      posts.push({ id: `${kind}:${clean(row.id, 160) || url}`, title, url, source: clean(kind === 'reddit' && row.community ? `Reddit · ${row.community}` : row.source || (kind === 'x' ? 'X · public index' : 'Reddit'), 100), kind, date: new Date(time).toISOString(), dateBasis: indexed ? 'index' : 'published', category: clean(row.category, 40) });
    }
  });
  // Relevance orders reports, not danger levels. Age reduces each report's
  // reading priority; source provenance remains explicit in the response.
  const score = post => (priority[post.category] || 1) * Math.max(0.1, 1 - (now() - Date.parse(post.date)) / (7 * 86400000));
  posts.sort((a, b) => score(b) - score(a) || Date.parse(b.date) - Date.parse(a.date));
  // Keep both public sources visible when they returned relevant results.
  const chosen = posts.slice(0, 4);
  for (const kind of kinds) {
    const missing = posts.find(post => post.kind === kind);
    if (missing && !chosen.some(post => post.kind === kind)) chosen.splice(Math.max(0, chosen.length - 1), 1, missing);
  }
  const ordered = [...chosen, ...posts.filter(post => !chosen.includes(post))];
  return { location, fetchedAt: new Date(now()).toISOString(), sources, posts: ordered.slice(0, 20) };
}
