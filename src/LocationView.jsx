import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import LocationBriefing from './LocationBriefing.jsx';
import { LOCATION_EVENT, readLocation, saveLocation, searchLocations, getLocalConditions, weatherLabel, locationConsiderations, readLocationWatchlist, saveLocationWatchlist, locationWatchKey, MAX_WATCHED_LOCATIONS } from './location.js';
import { isLocalEdition } from './runtime-mode.js';
import './location.css';

const number = (value, suffix = '') => Number.isFinite(value) ? `${Math.round(value)}${suffix}` : '—';
const clock = value => typeof value === 'string' && value.includes('T') ? value.split('T')[1].slice(0, 5) : '—';
const checked = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not checked';
const locationName = value => [value?.name, value?.region && value.region !== value.name ? value.region : value?.country].filter(Boolean).join(', ');
const isStale = (row, now) => Boolean(row?.error) || Boolean(row?.data && (!Number.isFinite(Date.parse(row.data.fetchedAt)) || now - Date.parse(row.data.fetchedAt) > 15 * 60_000));
const readPlaces = () => {
  const primary = readLocation(localStorage);
  try { return { primary, locations: readLocationWatchlist(localStorage), error: '' }; }
  catch (error) { return { primary, locations: [], error: `${error.message} Your saved watchlist has not been overwritten. Restore a valid backup in Settings & backups.` }; }
};

function LocationPicker({ onChoose, onCancel }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [searched, setSearched] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  const changeQuery = value => { pending.current?.abort(); setQuery(value); setResults([]); setSearched(false); setError(''); setBusy(false); };
  const search = async event => {
    event.preventDefault(); pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(''); setResults([]); setSearched(false);
    try { const rows = await searchLocations(query, { signal: controller.signal }); if (!controller.signal.aborted) { setResults(rows); setSearched(true); } }
    catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div className="pv-location-picker"><form onSubmit={search}><label>City or town<input type="search" value={query} onChange={event => changeQuery(event.target.value)} placeholder="e.g. Ottawa, London or Tokyo" minLength={2} maxLength={100} required/></label><button className="pv-inventory-button pv-inventory-button-primary" disabled={busy || query.trim().length < 2}>{busy ? 'Searching…' : 'Find city'}</button>{onCancel && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onCancel}>Cancel</button>}</form><p>Search uses Open-Meteo / GeoNames. An exact address is not needed. Adding a city sends its coordinates to the forecast and official alert services.</p>{error && <p role="alert">{error}</p>}{searched && !results.length && <p role="status">No locations found. Try a nearby city or another spelling.</p>}<div className="pv-location-results">{results.map(value => <button type="button" key={value.id} onClick={() => onChoose(value)}><span><strong>{value.name}</strong><small>{[value.region, value.country].filter(Boolean).join(', ')}</small></span><Icon name="plus" size={16}/></button>)}</div></div>;
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

function Conditions({ location, row, now, items, onCategory }) {
  const data = row?.data;
  const weather = data?.weather;
  const stale = isStale(row, now);
  const considerations = locationConsiderations(data, items);
  return <>
    {row?.error && <p role="alert" className="pv-location-error">{row.error}{data ? ' Previous information is shown below.' : ''}</p>}
    {!data && !row?.error && <p className="pv-location-empty" role="status">Checking weather and official warnings for {location.name}…</p>}
    {data && <><OfficialWarnings alerts={data.alerts} stale={stale}/>{weather.status === 'ready' ? <><div className="pv-location-weather"><div className="pv-location-temperature"><strong>{number(weather.current.temperature, '°C')}</strong><div><h3>{weatherLabel(weather.current.weatherCode)}</h3><p>Feels like {number(weather.current.feelsLike, '°C')} · {clock(weather.current.time)}</p></div></div><dl><div><dt>Low / high</dt><dd>{number(weather.today.low, '°')} / {number(weather.today.high, '°')}</dd></div><div><dt>Wind / gusts</dt><dd>{number(weather.current.windSpeed)} / {number(weather.current.windGusts)} km/h</dd></div><div><dt>Rain chance</dt><dd>{number(weather.today.precipitationProbability, '%')}</dd></div><div><dt>Sunset</dt><dd>{clock(weather.today.sunset)}</dd></div></dl></div><details className="pv-location-forecast"><summary>Hourly forecast & weather details<Icon name="chevron" size={15}/></summary><WeatherTimeline weather={weather}/><dl className="pv-location-extra"><div><dt>Rain today</dt><dd>{weather.today.rain ?? '—'} mm</dd></div><div><dt>Snow today</dt><dd>{weather.today.snow ?? '—'} cm</dd></div><div><dt>Maximum UV</dt><dd>{number(weather.today.uvIndex)}</dd></div><div><dt>Sunrise</dt><dd>{clock(weather.today.sunrise)}</dd></div></dl></details></> : <p role="status">{weather.error}</p>}
      {considerations.length > 0 && <details className="pv-location-considerations"><summary>Consider for your plan<Icon name="chevron" size={15}/></summary><div>{considerations.map(value => <article key={value.title}><strong>{value.title}</strong><p>{value.detail}</p>{value.category && onCategory && <button type="button" className="pv-text-link" onClick={() => onCategory(value.category)}>Review supplies<Icon name="arrow" size={14}/></button>}</article>)}</div><p className="pv-location-footnote">Based on the displayed forecast and recorded inventory. These planning prompts are not official warnings.</p></details>}
      <div className="pv-location-links"><a href={location.countryCode === 'CA' ? 'https://weather.gc.ca/radar/index_e.html' : location.countryCode === 'US' ? 'https://radar.weather.gov/' : 'https://severeweather.wmo.int/'} target="_blank" rel="noreferrer">Radar & storm movement ↗</a><a href={data.alerts.sourceUrl} target="_blank" rel="noreferrer">Weather authority ↗</a></div><p className="pv-location-footnote">Weather: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · Search: GeoNames · Retrieved {checked(data.fetchedAt)}. Updates every five minutes while this page is visible.</p>
    </>}
  </>;
}

function CityCard({ location, row, selected, primary, now, local, onSelect }) {
  const weather = row?.data?.weather;
  const alerts = row?.data?.alerts;
  const stale = isStale(row, now);
  const warningText = local ? 'Live conditions need internet' : row?.busy && !row?.data ? 'Checking conditions…' : alerts?.status === 'ready' ? `${alerts.entries.length} official weather ${alerts.entries.length === 1 ? 'alert' : 'alerts'}${stale ? ' · outdated' : ''}` : alerts?.status === 'unsupported' ? 'Official alerts not covered' : row?.error ? 'Conditions unavailable' : alerts ? 'Alerts unavailable' : 'Checking conditions…';
  return <button type="button" className="pv-location-city" aria-pressed={selected} onClick={onSelect} aria-label={`View ${locationName(location)}`} aria-description={`${primary ? 'Planning area. ' : ''}${weather?.status === 'ready' ? `${number(weather.current.temperature, '°C')}, ${weatherLabel(weather.current.weatherCode)}. ` : ''}${warningText}`}><span className="pv-location-city-top"><strong>{location.name}</strong>{primary && <span>Planning area</span>}</span><span className="pv-location-city-region">{location.region ? `${location.region}, ` : ''}{location.country}</span><span className="pv-location-city-weather"><strong>{weather?.status === 'ready' ? number(weather.current.temperature, '°C') : '—'}</strong><span>{local ? 'Offline' : weather?.status === 'ready' ? weatherLabel(weather.current.weatherCode) : row?.busy ? 'Loading forecast' : 'Forecast unavailable'}</span></span><span className="pv-location-city-alerts"><Icon name="compass" size={13}/>{warningText}</span>{stale && !local && <span className="pv-location-city-stale">Previous check · {checked(row?.data?.fetchedAt)}</span>}</button>;
}

export default function LocationView({ compact = false, onOpen, onCategory, items = [] }) {
  const [places, setPlaces] = useState(readPlaces);
  const [selectedKey, setSelectedKey] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState({});
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState(null);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const local = isLocalEdition();
  const primaryKey = places.primary ? locationWatchKey(places.primary) : '';
  const targets = useMemo(() => compact ? places.primary ? [places.primary] : [] : places.locations, [compact, places]);
  const location = compact ? places.primary : targets.find(value => locationWatchKey(value) === selectedKey) || targets.find(value => locationWatchKey(value) === primaryKey) || targets[0];
  const activeKey = location ? locationWatchKey(location) : '';
  const busy = targets.some(value => rows[locationWatchKey(value)]?.busy);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const changed = () => setPlaces(readPlaces());
    window.addEventListener(LOCATION_EVENT, changed);
    return () => window.removeEventListener(LOCATION_EVENT, changed);
  }, []);
  useEffect(() => {
    if (!targets.length || local) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setRows(previous => Object.fromEntries(targets.map(value => { const key = locationWatchKey(value); return [key, { ...previous[key], busy: true, error: '' }]; })));
      for (const value of targets) {
        const key = locationWatchKey(value);
        getLocalConditions(value, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setRows(previous => ({ ...previous, [key]: { data, busy: false, error: '' } })); }).catch(problem => { if (!controller.signal.aborted) setRows(previous => ({ ...previous, [key]: { ...previous[key], busy: false, error: problem.message } })); });
      }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [targets, local, refresh]);
  useEffect(() => {
    if (local || !targets.length) return;
    const update = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) setRefresh(value => value + 1); };
    const interval = setInterval(update, 300_000);
    document.addEventListener('visibilitychange', update); window.addEventListener('online', update);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', update); window.removeEventListener('online', update); };
  }, [targets.length, local]);
  const choose = value => {
    try {
      if (compact) saveLocation(localStorage, value);
      else {
        const key = locationWatchKey(value);
        if (!places.locations.some(entry => locationWatchKey(entry) === key)) saveLocationWatchlist(localStorage, [...places.locations, value]);
        if (!places.primary) saveLocation(localStorage, value);
        setSelectedKey(key);
        setDetailsOpen(true);
        setNotice(`${value.name} is on your watchlist.`);
      }
      setEditing(false); setError(''); setRemoved(null);
    } catch (problem) { setError(problem.message || 'The city could not be saved on this device.'); }
  };
  const makePrimary = () => {
    try { saveLocation(localStorage, location); setNotice(`${location.name} is now the planning area for Overview and Calendar.`); setError(''); }
    catch { setError('The planning area could not be saved. Free browser storage and try again.'); }
  };
  const remove = () => {
    try { const next = places.locations.filter(value => locationWatchKey(value) !== activeKey); saveLocationWatchlist(localStorage, next); setRemoved(location); setSelectedKey(''); setNotice(`${location.name} removed from your watchlist.${activeKey === primaryKey ? ' It remains your planning area for Overview and Calendar.' : ''}`); setError(''); }
    catch (problem) { setError(problem.message || 'This city could not be removed.'); }
  };
  const undo = () => {
    try { if (!places.locations.some(value => locationWatchKey(value) === locationWatchKey(removed))) saveLocationWatchlist(localStorage, [...places.locations, removed]); setSelectedKey(locationWatchKey(removed)); setNotice(`${removed.name} restored to your watchlist.`); setRemoved(null); setError(''); }
    catch (problem) { setError(problem.message || 'The city could not be restored.'); }
  };
  const localDetail = !local && location && <section className="pv-location-surface pv-location-detail" aria-label={`Local details for ${locationName(location)}`}><div className="pv-location-detail-heading"><div><p className="pv-inventory-eyebrow">LOCAL CONDITIONS</p><h2>{locationName(location)}</h2></div>{!compact && <div className="pv-location-actions">{activeKey === primaryKey ? <span className="pv-location-planning-label">Planning area</span> : <button type="button" className="pv-text-link" onClick={makePrimary}>Make planning area</button>}<button type="button" className="pv-text-link" onClick={remove}>Remove city</button></div>}</div><Conditions location={location} row={rows[activeKey]} now={now} items={items} onCategory={onCategory}/></section>;
  return <section className={`pv-location ${compact ? 'is-compact' : 'pv-inventory'}`} aria-label={compact ? 'Local conditions overview' : 'Location and local conditions'}>
    <header className={compact ? 'pv-section-heading' : 'pv-inventory-heading'}><div>{!compact && <p className="pv-inventory-eyebrow">KNOW WHAT’S CHANGING</p>}{compact ? <h2>What’s happening around you</h2> : <h1>Location<span>.</span></h1>}<p>{compact ? location ? `${locationName(location)} · Your planning area` : 'Set a location for weather and official warnings.' : 'Follow your places. Catch the headlines that matter. Keep the bigger picture in view.'}</p></div><div className="pv-location-actions">{!local && (compact ? location && <button type="button" className="pv-text-link" onClick={() => setEditing(value => !value)}>Change location</button> : <button type="button" className="pv-inventory-button pv-inventory-button-secondary" disabled={places.locations.length >= MAX_WATCHED_LOCATIONS || Boolean(places.error)} onClick={() => setEditing(value => !value)}><Icon name="plus" size={15}/>Add city</button>)}{targets.length > 0 && !local && <button type="button" className="pv-text-link" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{busy ? 'Refreshing…' : compact ? 'Refresh' : 'Refresh conditions'}</button>}{compact && onOpen && <button type="button" className="pv-text-link" onClick={onOpen}>Location details<Icon name="arrow" size={15}/></button>}</div></header>
    {(error || (!compact && places.error)) && <p role="alert" className="pv-location-error">{error || places.error}</p>}
    {notice && !compact && <p className="pv-location-notice" role="status">{notice}{removed && <button type="button" onClick={undo}>Undo</button>}</p>}
    {local && <div className="pv-location-surface"><p>Live forecasts, warnings and news need the online site. Your saved cities and planning area remain in your backup.</p></div>}
    {!local && (compact || !places.error) && (editing || (compact ? !location : targets.length === 0)) && <div className="pv-location-surface pv-location-picker-surface"><LocationPicker onChoose={choose} onCancel={editing ? () => setEditing(false) : undefined}/></div>}
    {!compact && <section className="pv-location-watchlist" aria-label="Watched cities"><div className="pv-location-subheading"><h2>Your city watchlist</h2><span>{places.locations.length} / {MAX_WATCHED_LOCATIONS} cities</span></div>{targets.length > 0 ? <div className="pv-location-city-grid">{targets.map(value => { const key = locationWatchKey(value); return <CityCard key={key} location={value} row={rows[key]} selected={key === activeKey} primary={key === primaryKey} now={now} local={local} onSelect={() => { setSelectedKey(key); setDetailsOpen(true); }}/>; })}</div> : <p className="pv-location-empty">Add cities to follow their forecasts and official weather notices in one place.</p>}<p className="pv-location-footnote">Choose a city for its local details below. Your planning area is used by Overview and Calendar; selecting another city here does not change it.</p></section>}
    {localDetail && (compact ? localDetail : <details className="pv-location-detail-disclosure" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary><span>Weather & warnings · {location.name}</span><Icon name="chevron" size={16}/></summary>{localDetail}</details>)}
    {!compact && <LocationBriefing locations={places.locations}/>}

  </section>;
}
