import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { LOCATION_EVENT, readLocation, saveLocation, searchLocations, getLocalConditions, weatherLabel, locationConsiderations } from './location.js';
import { isLocalEdition } from './runtime-mode.js';
import './location.css';

const number = (value, suffix = '') => Number.isFinite(value) ? `${Math.round(value)}${suffix}` : '—';
const clock = value => typeof value === 'string' && value.includes('T') ? value.split('T')[1].slice(0, 5) : '—';
const checked = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not checked';
function LocationPicker({ onChoose, onCancel }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [searched, setSearched] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  const search = async event => {
    event.preventDefault(); pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(''); setResults([]); setSearched(false);
    try { const rows = await searchLocations(query, { signal: controller.signal }); if (!controller.signal.aborted) { setResults(rows); setSearched(true); } }
    catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div className="pv-location-picker"><form onSubmit={search}><label>City or town<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Ottawa" minLength={2} maxLength={100} required/></label><button className="pv-inventory-button pv-inventory-button-primary" disabled={busy || query.trim().length < 2}>{busy ? 'Searching…' : 'Find location'}</button>{onCancel && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onCancel}>Cancel</button>}</form><p>Choose a nearby town for planning. Search uses Open-Meteo / GeoNames; an exact home address is not needed. Selecting a result sends its coordinates to the weather and official alert services.</p>{error && <p role="alert">{error}</p>}{searched && !results.length && <p role="status">No locations found. Try a nearby city or another spelling.</p>}<div className="pv-location-results">{results.map(value => <button type="button" key={value.id} onClick={() => onChoose(value)}><span><strong>{value.name}</strong><small>{[value.region, value.country].filter(Boolean).join(', ')}</small></span><Icon name="arrow" size={16}/></button>)}</div></div>;
}

function WeatherTimeline({ weather }) {
  const hours = weather.hourly.filter(hour => hour.time?.startsWith(weather.today.date) && Number.isFinite(hour.temperature));
  const samples = hours.filter((_, index) => index % 3 === 0);
  if (!samples.length) return <p>Hourly forecast is unavailable.</p>;
  const low = Math.min(...samples.map(hour => hour.temperature)); const high = Math.max(...samples.map(hour => hour.temperature));
  const points = samples.map((hour, index) => `${30 + index * (640 / Math.max(1, samples.length - 1))},${30 + (1 - (hour.temperature - low) / Math.max(4, high - low)) * 50}`).join(' ');
  return <div className="pv-weather-timeline"><div className="pv-location-subheading"><h3>Through the day</h3><span>{weather.today.date} · {weather.timezone}</span></div><svg viewBox="0 0 700 100" role="img" aria-label="Temperature forecast through the day; exact values are listed below"><path d="M25 90H675" fill="none" stroke="#e1e5df"/>{samples.map((hour, index) => <rect key={hour.time} x={20 + index * (640 / Math.max(1, samples.length - 1))} y={90 - (hour.precipitationProbability || 0) * .65} width="20" height={(hour.precipitationProbability || 0) * .65} rx="3" fill="#d7e1df"/>)}<polyline points={points} fill="none" stroke="#46644f" strokeWidth="2.5" strokeLinejoin="round"/>{samples.map((hour, index) => <circle key={hour.time} cx={30 + index * (640 / Math.max(1, samples.length - 1))} cy={30 + (1 - (hour.temperature - low) / Math.max(4, high - low)) * 50} r="3" fill="#46644f"/>)}</svg><div className="pv-weather-hours">{samples.map(hour => <div key={hour.time}><time>{clock(hour.time)}</time><strong>{number(hour.temperature, '°')}</strong><span>{weatherLabel(hour.weatherCode)}</span><small>{number(hour.precipitationProbability, '%')} precip.</small></div>)}</div><p className="pv-location-footnote">Line: temperature · bars: precipitation chance. Forecast timing is an estimate, not live storm tracking.</p></div>;
}

function OfficialWarnings({ alerts, stale }) {
  return <div className="pv-location-warnings"><div className="pv-location-subheading"><h3>Official weather warnings</h3><a href={alerts.sourceUrl} target="_blank" rel="noreferrer">Official source ↗</a></div>{stale && <p role="status">This information may be out of date. Check the official source.</p>}{alerts.status !== 'ready' ? <p role="status">{alerts.error}</p> : alerts.entries.length ? <div>{alerts.entries.map(alert => <details key={alert.id}><summary><span><strong>{alert.headline}</strong><small>{alert.severity} · {alert.area}</small></span><Icon name="chevron" size={16}/></summary><div><p className="pv-warning-text">{alert.description}</p>{alert.instruction && <p className="pv-warning-text"><strong>Instructions</strong><br/>{alert.instruction}</p>}<small>Begins {checked(alert.onset)} · Expires {checked(alert.expires)}</small><a href={alert.url} target="_blank" rel="noreferrer">Read the official notice ↗</a></div></details>)}</div> : <p>No active weather alerts were returned for this selected point at the last check.</p>}<p className="pv-location-footnote">{alerts.source} · Checked {checked(alerts.checkedAt)}. Weather alerts do not cover every evacuation, police, drinking-water or utility notice.</p></div>;
}

export default function LocationView({ compact = false, onOpen, onCategory, items = [] }) {
  const [location, setLocation] = useState(() => readLocation(localStorage));
  const [editing, setEditing] = useState(false); const [data, setData] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [refresh, setRefresh] = useState(0);
  const local = isLocalEdition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const changed = () => { setLocation(readLocation(localStorage)); setData(null); };
    window.addEventListener(LOCATION_EVENT, changed);
    return () => window.removeEventListener(LOCATION_EVENT, changed);
  }, []);
  useEffect(() => {
    if (!location || local) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true); setError('');
      getLocalConditions(location, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [location, local, refresh]);
  useEffect(() => {
    if (local || !location) return;
    const interval = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine !== false) setRefresh(value => value + 1); }, 300_000);
    const visible = () => { if (document.visibilityState === 'visible') setRefresh(value => value + 1); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('online', visible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible); };
  }, [location, local]);
  const choose = value => {
    try { saveLocation(localStorage, value); setEditing(false); setError(''); }
    catch { setError('The location could not be saved on this device. Free browser storage and try again.'); }
  };
  const weather = data?.weather; const stale = Boolean(error) || (data && now - Date.parse(data.fetchedAt) > 15 * 60_000);
  const considerations = locationConsiderations(data, items);
  return <section className={`pv-location ${compact ? 'is-compact' : 'pv-inventory'}`} aria-label={compact ? 'Local conditions overview' : 'Location and local conditions'}>
    <header className={compact ? 'pv-section-heading' : 'pv-inventory-heading'}><div>{!compact && <p className="pv-inventory-eyebrow">YOUR AREA</p>}{compact ? <h2>What’s happening around you</h2> : <h1>Location<span>.</span></h1>}<p>{location ? `${location.name}, ${location.region || location.country} · Your planning area` : 'Set a location for today’s weather and official warnings.'}</p></div><div className="pv-location-actions">{location && !local && <button type="button" className="pv-text-link" onClick={() => setEditing(value => !value)}>Change location</button>}{location && !local && <button type="button" className="pv-text-link" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{busy ? 'Refreshing…' : 'Refresh'}</button>}{compact && onOpen && <button type="button" className="pv-text-link" onClick={onOpen}>Location details<Icon name="arrow" size={15}/></button>}</div></header>
    {local ? <div className="pv-location-surface"><p>Live forecasts and official alerts require the online site. Your selected planning location is included in your backup.</p></div> : (!location || editing) && <div className="pv-location-surface"><LocationPicker onChoose={choose} onCancel={location ? () => setEditing(false) : undefined}/></div>}
    {error && <p role="alert" className="pv-location-error">{error}{data ? ' The previous information is shown below.' : ''}</p>}
    {busy && !data && <div className="pv-location-surface" role="status">Checking weather and official warnings…</div>}
    {!local && data && <div className="pv-location-surface"><OfficialWarnings alerts={data.alerts} stale={stale}/>{weather.status === 'ready' ? <><div className="pv-location-weather"><div className="pv-location-temperature"><Icon name="compass" size={25}/><strong>{number(weather.current.temperature, '°C')}</strong><div><h3>{weatherLabel(weather.current.weatherCode)}</h3><p>Feels like {number(weather.current.feelsLike, '°C')} · Forecast {clock(weather.current.time)}</p></div></div><dl><div><dt>Today’s range</dt><dd>{number(weather.today.low, '°')} / {number(weather.today.high, '°')}</dd></div><div><dt>Wind / gusts</dt><dd>{number(weather.current.windSpeed)} / {number(weather.current.windGusts)} km/h</dd></div><div><dt>Precipitation chance</dt><dd>{number(weather.today.precipitationProbability, '%')}</dd></div><div><dt>Sunset</dt><dd>{clock(weather.today.sunset)}</dd></div></dl></div><WeatherTimeline weather={weather}/>{!compact && <dl className="pv-location-extra"><div><dt>Rain today</dt><dd>{weather.today.rain ?? '—'} mm</dd></div><div><dt>Snow today</dt><dd>{weather.today.snow ?? '—'} cm</dd></div><div><dt>Maximum UV index</dt><dd>{number(weather.today.uvIndex)}</dd></div><div><dt>Sunrise</dt><dd>{clock(weather.today.sunrise)}</dd></div></dl>}</> : <p role="status">{weather.error}</p>}
      {considerations.length > 0 && <div className="pv-location-considerations"><h3>Consider for your plan</h3><div>{considerations.map(value => <article key={value.title}><strong>{value.title}</strong><p>{value.detail}</p>{value.category && onCategory && <button type="button" className="pv-text-link" onClick={() => onCategory(value.category)}>Review supplies<Icon name="arrow" size={14}/></button>}</article>)}</div><p className="pv-location-footnote">Based on the displayed forecast and recorded inventory. These planning prompts are not official warnings.</p></div>}
      <div className="pv-location-links"><a href={location.countryCode === 'CA' ? 'https://weather.gc.ca/radar/index_e.html' : location.countryCode === 'US' ? 'https://radar.weather.gov/' : 'https://severeweather.wmo.int/'} target="_blank" rel="noreferrer">Open official radar & storm movement ↗</a><a href={data.alerts.sourceUrl} target="_blank" rel="noreferrer">Check the weather authority ↗</a></div><p className="pv-location-footnote">Weather: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · Location search: GeoNames · Retrieved {checked(data.fetchedAt)}. Updates every five minutes while this page is visible.</p>
    </div>}
  </section>;
}
