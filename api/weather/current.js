import { getCached, setCache } from '../_lib/cache.js';
import { handleCors } from '../_lib/auth-middleware.js';

const WEATHER_ICONS = {
  '01': '☀️', '02': '⛅', '03': '☁️', '04': '☁️',
  '09': '🌧️', '10': '🌦️', '11': '⛈️', '13': '🌨️', '50': '🌫️'
};

function mapIcon(iconCode) {
  const base = iconCode?.slice(0, 2) || '01';
  return WEATHER_ICONS[base] || '☁️';
}

function windDir(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng query params required' });
  }

  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Weather API key not configured' });
  }

  // Cache by location (rounded to ~1km precision)
  const cacheKey = `weather_${parseFloat(lat).toFixed(2)}_${parseFloat(lng).toFixed(2)}`;
  const cached = getCached(cacheKey, 30 * 60 * 1000); // 30 min
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    // Use OpenWeatherMap One Call API 3.0
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      // Fallback to free 2.5 API if 3.0 isn't available
      const fallbackUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
      const fallback = await fetch(fallbackUrl);
      if (!fallback.ok) throw new Error(`Weather API error: ${fallback.status}`);

      const data = await fallback.json();
      const result = {
        current: {
          temp: Math.round(data.main.temp),
          feels_like: Math.round(data.main.feels_like),
          humidity: data.main.humidity,
          wind_speed: Math.round(data.wind.speed * 3.6), // m/s to km/h
          wind_dir: windDir(data.wind.deg),
          description: data.weather[0].description,
          icon: mapIcon(data.weather[0].icon),
          city: data.name,
        },
        forecast: [],
        alerts: [],
        source: 'openweathermap-2.5',
        fetchedAt: new Date().toISOString(),
      };

      setCache(cacheKey, result);
      res.setHeader('Cache-Control', 's-maxage=1800');
      return res.status(200).json(result);
    }

    const data = await response.json();

    const result = {
      current: {
        temp: Math.round(data.current.temp),
        feels_like: Math.round(data.current.feels_like),
        humidity: data.current.humidity,
        wind_speed: Math.round(data.current.wind_speed * 3.6),
        wind_dir: windDir(data.current.wind_deg),
        description: data.current.weather[0].description,
        icon: mapIcon(data.current.weather[0].icon),
      },
      forecast: (data.daily || []).slice(0, 5).map(d => ({
        day: new Date(d.dt * 1000).toLocaleDateString('en', { weekday: 'short' }),
        icon: mapIcon(d.weather[0].icon),
        hi: Math.round(d.temp.max),
        lo: Math.round(d.temp.min),
        desc: d.weather[0].main,
      })),
      alerts: (data.alerts || []).map(a => ({
        title: a.event,
        desc: a.description?.slice(0, 200),
        severity: a.tags?.includes('Extreme') ? 'critical' : 'warning',
        start: new Date(a.start * 1000).toISOString(),
        end: new Date(a.end * 1000).toISOString(),
      })),
      source: 'openweathermap-3.0',
      fetchedAt: new Date().toISOString(),
    };

    setCache(cacheKey, result);
    res.setHeader('Cache-Control', 's-maxage=1800');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Weather API error:', err);
    return res.status(502).json({ error: 'Failed to fetch weather data', detail: err.message });
  }
}
