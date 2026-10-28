import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { hasMapCoordinates, searchMapPlaces } from './map-search.js';

export default function MapPlaceFields({ value, onChange, label, local, disabled, onSignIn }) {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const selected = hasMapCoordinates(value);
  const search = async () => {
    if (local || disabled || busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setNeedsSignIn(false); setResults([]);
    try {
      const places = await searchMapPlaces(value.name, { signal: controller.signal });
      if (request.current !== controller) return;
      setResults(places);
      if (!places.length) setError('No places found. Include the city or region, or enter coordinates below.');
    } catch (problem) {
      if (request.current !== controller || controller.signal.aborted) return;
      setError(problem.name === 'TimeoutError' ? 'Search took too long. Try again or enter coordinates below.' : problem.message);
      setNeedsSignIn(problem.status === 401 || problem.status === 403);
    } finally { if (request.current === controller) setBusy(false); }
  };
  const clearSearch = () => { request.current?.abort(); request.current = null; setBusy(false); setResults([]); setError(''); setNeedsSignIn(false); };
  const changeName = name => { clearSearch(); onChange({ ...value, name, latitude: '', longitude: '' }); };
  return <div className="pv-route-place">
    <div className="pv-route-place-search">
      <label><span>{label}</span><input maxLength={150} value={value.name} disabled={disabled} placeholder="Address, town or landmark" onChange={event => changeName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); search(); } }}/></label>
      <button type="button" className="pv-route-icon-button" title={local ? 'Search requires an internet connection' : 'Search address or place'} aria-label={`Search ${label}`} disabled={local || disabled || busy} onClick={search}><Icon name="search" size={17}/></button>
    </div>
    {busy && <p className="pv-route-place-status" role="status">Searching…</p>}
    {results.length > 0 && <div className="pv-route-search-results" aria-label={`${label} search results`}><p>Choose a location</p>{results.map(place => <button type="button" key={place.id} disabled={disabled} onClick={() => { clearSearch(); onChange({ ...value, name: place.label, latitude: String(place.latitude), longitude: String(place.longitude) }); }}><strong>{place.name}</strong><span>{place.detail}</span></button>)}</div>}
    {error && <p className="pv-route-inline-error" role="status">{error}</p>}
    {needsSignIn && onSignIn && <button type="button" className="pv-route-text-button" onClick={onSignIn}>Sign in to search places</button>}
    {!busy && !error && <p className="pv-route-place-status" role="status">{selected ? '✓ Location selected' : local ? 'Enter coordinates below.' : value.name.trim() ? 'Press Enter or search, then choose a result.' : 'Search and choose a location.'}</p>}
    <details className="pv-route-coordinate-details"><summary>{selected ? 'Coordinates' : 'Enter coordinates manually'}</summary><div className="pv-route-coordinates"><label>Latitude<input type="number" step="any" min="-85" max="85" value={value.latitude} disabled={disabled} placeholder="43.6532" onChange={event => { clearSearch(); onChange({ ...value, latitude: event.target.value }); }}/></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={value.longitude} disabled={disabled} placeholder="-79.3832" onChange={event => { clearSearch(); onChange({ ...value, longitude: event.target.value }); }}/></label></div></details>
  </div>;
}
