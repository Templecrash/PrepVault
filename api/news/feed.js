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

/**
 * Reverse geocode lat/lng to a city/region name using OpenWeatherMap's free geocoding API
 * Falls back to country-level search if geocoding fails
 */
async function reverseGeocode(lat, lng) {
  try {
    const owmKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!owmKey) return null;
    const res = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lng}&limit=1&appid=${owmKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      const loc = data[0];
      // Return city + state/region for US/CA, city + country otherwise
      const parts = [loc.name];
      if (loc.state) parts.push(loc.state);
      return { city: parts.join(', '), country: (loc.country || 'us').toLowerCase() };
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Detect country code from lat/lng roughly (for GNews country param)
 */
function guessCountry(lat, lng) {
  // Rough bounding boxes for common countries
  if (lat >= 24.5 && lat <= 49.5 && lng >= -125 && lng <= -66) return 'us';
  if (lat >= 41.5 && lat <= 83.5 && lng >= -141 && lng <= -52) return 'ca';
  if (lat >= 49 && lat <= 61 && lng >= -11 && lng <= 2) return 'gb';
  if (lat >= -44 && lat <= -10 && lng >= 112 && lng <= 154) return 'au';
  return 'us'; // default
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'News API key not configured' });
  }

  const { q, lat, lng, country: countryParam } = req.query;

  // Determine location context
  let locationQuery = '';
  let country = countryParam || 'us';

  if (lat && lng) {
    const geo = await reverseGeocode(parseFloat(lat), parseFloat(lng));
    if (geo) {
      locationQuery = geo.city;
      country = geo.country;
    } else {
      country = guessCountry(parseFloat(lat), parseFloat(lng));
    }
  }

  // Build search query: combine location with preparedness topics
  const baseTopics = 'weather OR emergency OR power OR infrastructure OR safety';
  const query = q || (locationQuery ? `(${locationQuery}) AND (${baseTopics})` : baseTopics);

  const cacheKey = `news_${country}_${query.slice(0, 50)}`;
  const cached = getCached(cacheKey, 30 * 60 * 1000);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    // Try location-specific search first
    let articles = [];

    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&country=${country}&max=8&sortby=publishedAt&apikey=${apiKey}`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      articles = data.articles || [];
    }

    // If location search returned too few results, supplement with general preparedness news
    if (articles.length < 4 && locationQuery) {
      try {
        const fallbackUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(baseTopics)}&lang=en&country=${country}&max=6&sortby=publishedAt&apikey=${apiKey}`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const existingUrls = new Set(articles.map(a => a.url));
          const newArticles = (fallbackData.articles || []).filter(a => !existingUrls.has(a.url));
          articles = [...articles, ...newArticles].slice(0, 8);
        }
      } catch { /* ignore fallback errors */ }
    }

    if (!response.ok && articles.length === 0) {
      throw new Error(`GNews API error: ${response.status}`);
    }

    const result = {
      articles: articles.map(a => ({
        title: a.title,
        source: a.source?.name || 'Unknown',
        time: timeAgo(a.publishedAt),
        url: a.url,
        severity: classifySeverity(a.title),
        tag: classifyTag(a.title),
      })),
      location: locationQuery || null,
      country,
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
