import { useEffect, useRef, useState } from 'react';
import { isLocalEdition } from './runtime-mode.js';
import LocalServiceNotice from './LocalServiceNotice.jsx';

export default function WeatherNews() {
  const [weather, setWeather] = useState(null);
  const [news, setNews] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const load = async type => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(type); setError('');
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      let endpoint = '/api/news/feed';
      if (type === 'weather') {
        if (!navigator.geolocation) throw new Error('This browser cannot provide a location.');
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 300000 }));
        if (controller.signal.aborted) return;
        endpoint = `/api/weather/current?lat=${position.coords.latitude}&lng=${position.coords.longitude}`;
      }
      const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'This feed is unavailable.');
      if (type === 'weather') {
        if (!data?.current || !Number.isFinite(data.current.temp)) throw new Error('The weather provider returned incomplete data.');
        setWeather(data);
      } else {
        if (!Array.isArray(data?.articles)) throw new Error('The news provider returned incomplete data.');
        setNews({ articles: data.articles, fetchedAt: data.fetchedAt || new Date().toISOString() });
      }
    } catch (problem) {
      if (problem.name !== 'AbortError') setError(problem.code === 1 ? 'Location access was declined. No weather location was sent.' : problem.message);
      else setError('The feed request timed out. Try again when connected.');
    } finally { clearTimeout(timeout); request.current = null; setBusy(''); }
  };
  if (isLocalEdition()) return <LocalServiceNotice title="Weather & news" detail="Live feeds require an internet connection and the hosted service. This local edition does not request your location or show sample weather alerts." />;
  return <section className="pv-card" style={{ padding: 24, marginBottom: 20 }} aria-label="Weather and news">
    <h3>Weather & news</h3><p>Load current information when you need it. Weather uses your browser location only after you choose the button below.</p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="pv-button pv-secondary" disabled={Boolean(busy)} onClick={() => load('weather')}>{busy === 'weather' ? 'Checking weather…' : 'Use my location for weather'}</button><button className="pv-button pv-secondary" disabled={Boolean(busy)} onClick={() => load('news')}>{busy === 'news' ? 'Loading news…' : 'Load news'}</button></div>
    {error && <p role="alert">{error}</p>}
    {weather && <div><h4>{weather.current.city || 'Local weather'}</h4><p>{weather.current.temp}°C · {weather.current.description}</p><p>Updated {weather.fetchedAt ? new Date(weather.fetchedAt).toLocaleString() : 'on this request'}. Check official alerts before acting.</p>{(weather.alerts || []).map((alert, index) => <p key={index}>{alert.title || alert.desc}</p>)}</div>}
    {news && <div><h4>News</h4><p>Retrieved {new Date(news.fetchedAt).toLocaleString()}</p>{news.articles.length ? <ul>{news.articles.slice(0, 6).map((article, index) => <li key={index}>{/^https:\/\//.test(article.url || '') ? <a href={article.url} target="_blank" rel="noreferrer">{article.title}</a> : article.title} <span>— {article.source}</span></li>)}</ul> : <p>No articles returned.</p>}</div>}
  </section>;
}
