import { getCached, setCache } from '../_lib/cache.js';
import { handleCors } from '../_lib/auth-middleware.js';

// Classify news articles into PrepVault-relevant tags
function classifyTag(title) {
  const t = title.toLowerCase();
  if (/power|grid|hydro|electri|blackout|outage/i.test(t)) return 'GRID';
  if (/food|grocery|farm|crop|supply chain|shortage/i.test(t)) return 'FOOD';
  if (/weather|storm|snow|hurricane|tornado|flood|heat|cold|wildfire|fire/i.test(t)) return 'WEATHER';
  if (/road|highway|bridge|route|traffic|closure|detour/i.test(t)) return 'ROUTES';
  if (/water|drought|contamina|boil/i.test(t)) return 'WATER';
  if (/cyber|hack|ransom|security/i.test(t)) return 'CYBER';
  if (/fuel|gas|oil|propane|energy/i.test(t)) return 'FUEL';
  if (/health|virus|pandemic|outbreak|hospital/i.test(t)) return 'HEALTH';
  return 'INFO';
}

function classifySeverity(title) {
  const t = title.toLowerCase();
  if (/emergency|critical|danger|evacuate|extreme|deadly|fatal/i.test(t)) return 'critical';
  if (/warning|alert|concern|risk|threat|increase|delay|shortage/i.test(t)) return 'amber';
  return 'info';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'News API key not configured' });
  }

  const { q, country = 'ca' } = req.query;
  const query = q || 'infrastructure OR weather OR supply chain OR power grid OR emergency';
  const cacheKey = `news_${country}_${query.slice(0, 30)}`;
  const cached = getCached(cacheKey, 30 * 60 * 1000);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&country=${country}&max=8&apikey=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`GNews API error: ${response.status}`);

    const data = await response.json();

    const result = {
      articles: (data.articles || []).map(a => ({
        title: a.title,
        source: a.source?.name || 'Unknown',
        time: timeAgo(a.publishedAt),
        url: a.url,
        severity: classifySeverity(a.title),
        tag: classifyTag(a.title),
      })),
      source: 'gnews',
      fetchedAt: new Date().toISOString(),
    };

    setCache(cacheKey, result);
    res.setHeader('Cache-Control', 's-maxage=1800');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);
  } catch (err) {
    console.error('News API error:', err);
    return res.status(502).json({ error: 'Failed to fetch news', detail: err.message });
  }
}
