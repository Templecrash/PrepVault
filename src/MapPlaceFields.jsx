import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { hasMapCoordinates, searchMapPlaces } from './map-search.js';

export default function MapPlaceFields({ value, onChange, label, local, disabled, onSignIn, onPickMap, picking = false }) {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  // A pin drag/placement is an external selection. An older search must not
  // replace it or leave stale results open after coordinates have changed.
  useEffect(() => {
    request.current?.abort(); request.current = null;
    const timer = setTimeout(() => { setBusy(false); setResults([]); setError(''); setNeedsSignIn(false); }, 0);
    return () => clearTimeout(timer);
  }, [value.latitude, value.longitude]);
  const selected = hasMapCoordinates(value);
  const search = async () => {
    if (local || disabled || busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setNeedsSignIn(false); setResults([]);
    try {
      const places = await searchMapPlaces(value.name, { signal: controller.signal });
      if (request.current !== controller || controller.signal.aborted) return;
      setResults(places);
      if (!places.length) setError(onPickMap ? 'This address may not be mapped. Try the road and nearest town, or choose the exact spot on the map.' : 'No places found. Include the city or region, or enter coordinates below.');
    } catch (problem) {
      if (request.current !== controller || controller.signal.aborted) return;
      setError(problem.name === 'TimeoutError' ? 'Search took too long. Try again or enter coordinates below.' : problem.message);
      setNeedsSignIn(problem.status === 401 || problem.status === 403);
    } finally { if (request.current === controller) setBusy(false); }
  };
  const clearSearch = () => { request.current?.abort(); request.current = null; setBusy(false); setResults([]); setError(''); setNeedsSignIn(false); };
  const changeName = name => { clearSearch(); onChange(value.selectionSource === 'map' ? { ...value, name } : { ...value, name, latitude: '', longitude: '', matchType: undefined, matchLabel: undefined }); };
  return <div className="pv-route-place">
    <div className="pv-route-place-search">
      <label><span>{label}</span><input maxLength={150} value={value.name} disabled={disabled} placeholder="Address, town or landmark" onChange={event => changeName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (value.selectionSource !== 'map') search(); } }}/></label>
      <button type="button" className="pv-route-icon-button" title={local ? 'Search requires an internet connection' : 'Search address or place'} aria-label={`Search ${label}`} disabled={local || disabled || busy} onClick={search}><Icon name="search" size={17}/></button>
    </div>
    {busy && <p className="pv-route-place-status" role="status">Searching…</p>}
    {results.length > 0 && <div className="pv-route-search-results" aria-label={`${label} search results`}><p>Choose a location</p>{results.map(place => <button type="button" key={place.id} disabled={disabled} onClick={() => { clearSearch(); onChange({ ...value, name: place.label, latitude: String(place.latitude), longitude: String(place.longitude), selectionSource: 'search', matchType: place.matchType, matchLabel: place.matchLabel }); }}><strong>{place.name}</strong>{place.matchLabel && <small className="pv-route-match-label">{place.matchLabel}</small>}<span>{place.detail}</span></button>)}</div>}
    {error && <p className="pv-route-inline-error" role="status">{error}</p>}
    {needsSignIn && onSignIn && <button type="button" className="pv-route-text-button" onClick={onSignIn}>Sign in to search places</button>}
    {!busy && !error && <p className="pv-route-place-status" role="status">{selected ? value.selectionSource === 'map' ? 'Pin placed on map · edit the name above to label it.' : value.matchType && value.matchType !== 'address' ? `${value.matchLabel || 'Approximate location'} · refine the pin on the map.` : '✓ Location selected' : local ? 'Enter coordinates below.' : value.name.trim() ? 'Press Enter or search, then choose a result.' : 'Search or choose a point on the map.'}</p>}
    {onPickMap && !local && <button type="button" className="pv-route-text-button pv-route-pick-button" aria-pressed={picking} disabled={disabled} onClick={() => { clearSearch(); onPickMap(); }}><Icon name="map" size={14}/>{picking ? `Placing ${label.toLowerCase()}…` : selected ? 'Adjust on map' : 'Choose on map'}</button>}
    <details className="pv-route-coordinate-details"><summary>{selected ? 'Coordinates' : 'Enter coordinates manually'}</summary><div className="pv-route-coordinates"><label>Latitude<input type="number" step="any" min="-85" max="85" value={value.latitude} disabled={disabled} placeholder="43.6532" onChange={event => { clearSearch(); onChange({ ...value, latitude: event.target.value, selectionSource: 'map', matchType: undefined, matchLabel: undefined }); }}/></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={value.longitude} disabled={disabled} placeholder="-79.3832" onChange={event => { clearSearch(); onChange({ ...value, longitude: event.target.value, selectionSource: 'map', matchType: undefined, matchLabel: undefined }); }}/></label></div></details>
  </div>;
}
