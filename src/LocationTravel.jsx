import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { calculateRoute } from './offline-route.js';
import { isLocalEdition } from './runtime-mode.js';
import { LOCATION_DESTINATION_EVENT, LOCATION_DESTINATION_KEY, MAX_WATCHED_LOCATIONS, locationWatchKey, readLocationDestination, saveLocationDestination } from './location.js';
import './location-travel.css';

const MODES = [{ id: 'drive', label: 'Drive', icon: 'vehicle' }, { id: 'bike', label: 'Bike', icon: 'bike' }, { id: 'walk', label: 'Walk', icon: 'users' }];
const placeName = place => [place.name, place.region && place.region !== place.name ? place.region : place.country].filter(Boolean).join(', ');
const loadDestination = () => {
  try { return { value: readLocationDestination(localStorage), error: '' }; }
  catch (error) { return { value: null, error: error.message }; }
};
const timeLabel = seconds => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours.toLocaleString()} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
};
const distanceLabel = value => `${value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 })} km`;
const checkedAt = value => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function ModeIcon({ mode, size = 20 }) {
  if (mode !== 'bike') return <Icon name={mode === 'drive' ? 'vehicle' : 'users'} size={size}/>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="16" r="4"/><circle cx="19" cy="16" r="4"/><path d="m5 16 5-9 5 9H5Zm10 0 2-11h3M8 7h5"/></svg>;
}
function requestGap(signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1200);
    if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
  });
}
function TravelComparison({ home, destination, local, onSignIn, onOpenMaps }) {
  const [rows, setRows] = useState({});
  const [busy, setBusy] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const cancel = () => {
    controller.current?.abort(); setBusy(false);
    setRows(previous => Object.fromEntries(Object.entries(previous).map(([mode, row]) => [mode, ['loading', 'waiting'].includes(row.status) ? { status: 'cancelled' } : row])));
  };
  const compare = async () => {
    if (busy || local) return;
    controller.current?.abort(); const pending = new AbortController(); controller.current = pending;
    setBusy(true); setNeedsSignIn(false); setError('');
    setRows(Object.fromEntries(MODES.map(mode => [mode.id, { status: 'waiting' }])));
    const points = [home, destination].map(place => ({ name: place.name, latitude: place.latitude, longitude: place.longitude }));
    try {
      for (let index = 0; index < MODES.length; index += 1) {
        if (index) await requestGap(pending.signal);
        if (pending.signal.aborted) break;
        const mode = MODES[index].id;
        setRows(previous => ({ ...previous, [mode]: { status: 'loading' } }));
        try {
          const result = await calculateRoute({ mode, points, walkingSpeed: 4, cyclingSpeed: 15, avoidAreas: [] }, { signal: AbortSignal.any([pending.signal, AbortSignal.timeout(25000)]) });
          if (pending.signal.aborted) break;
          if (result.mode !== mode || result.points[0].latitude !== points[0].latitude || result.points[0].longitude !== points[0].longitude || result.points.at(-1).latitude !== points[1].latitude || result.points.at(-1).longitude !== points[1].longitude) throw new Error('The returned route did not match these locations. Compare again.');
          // Store only a summary in component memory. Geometry and directions
          // are neither retained in the saved destination nor written to storage.
          setRows(previous => ({ ...previous, [mode]: { status: 'ready', distanceKm: result.distanceKm, durationSeconds: result.durationSeconds, calculatedAt: result.calculatedAt, warnings: result.warnings } }));
        } catch (problem) {
          if (pending.signal.aborted || problem?.name === 'AbortError') break;
          const message = problem?.message || 'This travel mode could not be calculated. Try again.';
          const auth = [401, 403].includes(problem?.status) || /sign.?in|authenticat|unauthori/i.test(message);
          setRows(previous => ({ ...previous, [mode]: { status: 'error', error: message } }));
          if (auth) {
            setNeedsSignIn(true);
            setRows(previous => ({ ...previous, ...Object.fromEntries(MODES.slice(index + 1).map(entry => [entry.id, { status: 'error', error: 'Sign in to compare this travel mode.' }])) }));
            break;
          }
        }
      }
    } catch (problem) {
      if (!pending.signal.aborted) setError(problem?.message || 'The comparison could not finish. Try again.');
    } finally { if (!pending.signal.aborted) setBusy(false); }
  };
  const readyCount = Object.values(rows).filter(row => row.status === 'ready').length;
  return <div className="pv-location-travel-comparison">
    <div className="pv-location-travel-actions"><button type="button" className="pv-inventory-button pv-inventory-button-primary" disabled={busy || local} onClick={compare}><Icon name="compass" size={16}/>{busy ? 'Comparing routes…' : readyCount ? 'Compare again' : 'Compare routes'}</button>{busy && <button type="button" className="pv-text-link" onClick={cancel}>Cancel</button>}{onOpenMaps && <button type="button" className="pv-text-link" onClick={onOpenMaps}>Open Maps<Icon name="arrow" size={14}/></button>}</div>
    {local && <p className="pv-location-travel-note">Route comparison needs the online site. Your destination remains saved with your plan.</p>}
    {needsSignIn && <p className="pv-location-travel-error" role="alert">Sign in to calculate routes.{onSignIn && <button type="button" className="pv-text-link" onClick={onSignIn}>Sign in<Icon name="arrow" size={13}/></button>}</p>}
    {error && <p className="pv-location-travel-error" role="alert">{error}</p>}
    <div className="pv-location-travel-results" aria-live="polite" aria-label="Travel time comparison">{MODES.map(mode => {
      const row = rows[mode.id];
      return <article className="pv-location-travel-mode" key={mode.id}><header><ModeIcon mode={mode.id}/><h3>{mode.label}</h3><span>{row?.status === 'loading' ? 'Calculating…' : row?.status === 'waiting' ? 'Queued' : row?.status === 'error' ? 'Unavailable' : row?.status === 'cancelled' ? 'Cancelled' : row?.status === 'ready' ? 'Route found' : 'Not calculated'}</span></header>
        {row?.status === 'ready' ? <><strong className="pv-location-travel-time">{timeLabel(row.durationSeconds)}</strong><p className="pv-location-travel-distance">{distanceLabel(row.distanceKm)} <span>· estimated travel time</span></p><small className="pv-location-travel-checked">Calculated {checkedAt(row.calculatedAt)}</small>{row.warnings?.length > 0 && <details className="pv-location-travel-route-notes"><summary>Route notes</summary><ul>{row.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}</> : <div className="pv-location-travel-mode-state"><span aria-hidden="true">—</span><p>{row?.status === 'error' ? row.error : row?.status === 'loading' ? 'Checking the road and path network…' : row?.status === 'waiting' ? 'This mode will be checked next.' : row?.status === 'cancelled' ? 'Comparison stopped before this mode completed.' : 'Choose Compare routes to get an estimate.'}</p></div>}
      </article>;
    })}</div>
    <p className="pv-location-travel-note">City-centre estimates exclude breaks, overnight stops and live traffic. Walking pace: 4 km/h; cycling pace: 15 km/h. Terrain and conditions can change travel time. Use Maps for exact stops and a daily travel plan.</p>
    <details className="pv-location-travel-privacy"><summary>How the comparison works</summary><p>Compare routes sends the two city-centre coordinates to the routing service. Each mode uses the returned road or path route; an unavailable mode has no estimated time. Long journeys may need to be split into shorter routes. Only your destination selection is saved here.</p></details>
  </div>;
}

export default function LocationTravel({ home = null, locations = [], onAddLocation, onSignIn, onOpenMaps }) {
  const [saved, setSaved] = useState(loadDestination);
  const [error, setError] = useState('');
  const local = isLocalEdition();
  const homeKey = home ? locationWatchKey(home) : '';
  const savedKey = saved.value ? locationWatchKey(saved.value) : '';
  const choices = useMemo(() => locations.filter(place => locationWatchKey(place) !== homeKey), [locations, homeKey]);
  const destination = choices.find(place => locationWatchKey(place) === savedKey) || null;
  const unavailableSelection = Boolean(saved.value && !destination);
  useEffect(() => {
    const changed = () => setSaved(loadDestination());
    const storageChanged = event => { if (event.key === LOCATION_DESTINATION_KEY || event.key === null) changed(); };
    window.addEventListener(LOCATION_DESTINATION_EVENT, changed); window.addEventListener('storage', storageChanged);
    return () => { window.removeEventListener(LOCATION_DESTINATION_EVENT, changed); window.removeEventListener('storage', storageChanged); };
  }, []);
  const choose = value => {
    if (saved.error) return;
    try {
      const place = value ? choices.find(entry => locationWatchKey(entry) === value) : null;
      if (value && !place) throw new Error('Choose a destination from your city watchlist.');
      setSaved({ value: saveLocationDestination(localStorage, place), error: '' }); setError('');
    } catch (problem) { setError(problem.message || 'The destination could not be saved.'); }
  };
  return <section className="pv-location-travel" aria-labelledby="pv-location-travel-title">
    <header><div><p className="pv-inventory-eyebrow">FROM HOME TO YOUR NEXT PLACE</p><h2 id="pv-location-travel-title">Your destination plan</h2><p>Choose a second location and compare driving, cycling and walking from your planning area.</p></div><Icon name="map" size={22}/></header>
    <div className="pv-location-travel-places"><div className="pv-location-travel-home"><span className="pv-location-travel-marker">A</span><div><span>Home · planning area</span><strong>{home ? placeName(home) : 'Set your planning area above'}</strong></div></div><Icon name="arrow" size={18}/><label className="pv-location-travel-destination"><span><i className="pv-location-travel-marker">B</i>Destination</span><select value={savedKey} disabled={Boolean(saved.error)} onChange={event => choose(event.target.value)}><option value="">Choose a watched city</option>{unavailableSelection && <option value={savedKey} disabled>{saved.value.name} {savedKey === homeKey ? '(same as home)' : '(not on watchlist)'}</option>}{choices.map(place => <option key={locationWatchKey(place)} value={locationWatchKey(place)}>{placeName(place)}</option>)}</select></label></div>
    <div className="pv-location-travel-selection-note"><p>Your destination is saved separately. Choosing it does not change your home or the city selected for news.</p>{onAddLocation && <button type="button" className="pv-text-link" disabled={local || !home || Boolean(saved.error) || locations.length >= MAX_WATCHED_LOCATIONS} onClick={onAddLocation}><Icon name="plus" size={14}/>Add destination city</button>}</div>
    {(saved.error || error) && <p className="pv-location-travel-error" role="alert">{saved.error || error}</p>}
    {unavailableSelection && !saved.error && <p className="pv-location-travel-note">{savedKey === homeKey ? 'Your saved destination is now your home. Choose a different city.' : 'Your saved destination is no longer in the watchlist. Add it again or choose another city to compare routes.'}</p>}
    {home && destination ? <TravelComparison key={`${homeKey}|${locationWatchKey(destination)}`} home={home} destination={destination} local={local} onSignIn={onSignIn} onOpenMaps={onOpenMaps}/> : <p className="pv-location-travel-empty">{!home ? 'Add your home city or make a watched city your planning area to begin.' : !choices.length ? 'Add a second city to your watchlist, then choose it as your destination.' : 'Choose a destination to compare route-based travel estimates.'}</p>}
  </section>;
}
