import { isLocalEdition } from './runtime-mode.js';
import { useEffect, useState } from 'react';
import { Icon } from './brand.jsx';
import { googleDirectionsUrl, googleRouteEmbedUrl, routePropertyId, routesForProperty, savedRoutePlaces, TRAVEL_MODES, upsertRoute, validateRoute } from './route-planner.js';
import './travel-routes.css';

function OnlineRouteMap({ route }) {
  const [frameState, setFrameState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setFrameState(state => state === 'loading' ? 'slow' : state), 15000);
    return () => clearTimeout(timer);
  }, [attempt]);
  return <section className="pv-route-map" aria-label="Route map">
    <div className="pv-route-map-heading"><div><span className="pv-eyebrow">GOOGLE MAPS</span><h3>{route.name}</h3></div><a className="pv-button" href={googleDirectionsUrl(route)} target="_blank" rel="noreferrer">Open directions <span aria-hidden="true">↗</span></a></div>
    <iframe key={attempt} title={`Route from ${route.origin} to ${route.destination}`} src={googleRouteEmbedUrl(route)} referrerPolicy="no-referrer-when-downgrade" allowFullScreen onLoad={() => setFrameState('loaded')} onError={() => setFrameState('error')}/>
    {frameState === 'loading' && <p className="pv-route-map-status" role="status">Loading Google Maps…</p>}
    {['error', 'slow'].includes(frameState) && <p className="pv-route-map-status" role="status">The map is taking longer to load. <a href={googleDirectionsUrl(route)} target="_blank" rel="noreferrer">Open in Google Maps</a> or <button type="button" onClick={() => { setFrameState('loading'); setAttempt(value => value + 1); }}>retry the preview</button>.</p>}
    <p className="pv-route-caption">Select an alternate route on the map where available. Saved routes keep your locations and travel mode; Google Maps recalculates the journey each time. Open directions for turn-by-turn navigation. Internet access is required.</p>
  </section>;
}

function RouteMap({ route }) {
  if (!isLocalEdition()) return <OnlineRouteMap route={route} />;
  return <section className="pv-route-map" aria-label="Saved route details"><div className="pv-route-map-heading"><div><span className="pv-eyebrow">SAVED ROUTE</span><h3>{route.name || 'Your route'}</h3></div><a className="pv-button" href={googleDirectionsUrl(route)} target="_blank" rel="noreferrer">Open Google directions ↗</a></div><p className="pv-route-caption"><strong>{route.origin}</strong> → <strong>{route.destination}</strong><br />Mode: {TRAVEL_MODES.find(mode => mode.value === route.travelMode)?.label || route.travelMode}</p>{route.notes && <p className="pv-route-caption">{route.notes}</p>}<p className="pv-route-caption">Your saved endpoints, travel mode and notes work locally. No road map or turn-by-turn route is stored. Open Google directions only when connected; doing so sends these locations to Google.</p></section>;
}

function LocationInput({ label, marker, value, onChange, places }) {
  const chosen = places.find(place => place.address && place.address === value)?.id || '';
  return <div className="pv-route-location"><span className="pv-route-letter" aria-hidden="true">{marker}</span><div><label className="pv-field">{label}<input value={value} onChange={event => onChange(event.target.value)} placeholder={marker === 'A' ? 'Address, place or coordinates' : 'Where are you going?'} maxLength={300} required autoComplete="off"/></label><select aria-label={`Use a saved location for ${label.toLowerCase()}`} value={chosen} onChange={event => { const place = places.find(entry => entry.id === event.target.value); if (place) onChange(place.address); }}><option value="">Use a saved location…</option>{places.map(place => <option key={place.id} value={place.id} disabled={!place.address}>{place.name}{!place.address ? ' — add an address in map setup' : ''}</option>)}</select></div></div>;
}

export default function TravelRoutes({ routes = [], setRoutes, properties = [], mapSetups = {}, propertyId, propAddress = '' }) {
  const scope = routePropertyId(propertyId);
  const places = savedRoutePlaces(properties, mapSetups, propAddress);
  const emptyDraft = () => ({ name: '', origin: places.find(place => place.id === scope)?.address || '', destination: '', travelMode: 'driving', notes: '' });
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedId, setSelectedId] = useState(null);
  const [mapped, setMapped] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleted, setDeleted] = useState(null);
  const propertyRoutes = routesForProperty(routes, scope);
  const selected = propertyRoutes.find(route => route.id === selectedId);
  const update = (field, value) => { setDraft(previous => ({ ...previous, [field]: value })); setMapped(null); setError(''); setNotice(''); };
  const choose = route => {
    setSelectedId(route.id); setDraft({ name: route.name || '', origin: route.origin || '', destination: route.destination || '', travelMode: route.travelMode || 'driving', notes: route.notes || '' }); setError(''); setNotice('');
    try { const valid = validateRoute(route); googleDirectionsUrl(valid); setMapped(valid); } catch { setMapped(null); }
  };
  const startNew = () => { setSelectedId(null); setDraft(emptyDraft()); setMapped(null); setError(''); setNotice(''); };
  const mapRoute = event => {
    event.preventDefault();
    try { const route = validateRoute(draft); googleDirectionsUrl(route); setMapped(route); setError(''); setNotice(''); } catch (issue) { setError(issue.message); }
  };
  const saveRoute = () => {
    try {
      const id = selected?.id || `route-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const next = upsertRoute(routes, draft, { id, propertyId: scope, now });
      setRoutes(next); setSelectedId(id); setDraft(validateRoute(draft)); setMapped(validateRoute(draft)); setError(''); setNotice(selected ? 'Route updated.' : 'Route added to your plan.');
    } catch (issue) { setError(issue.message); }
  };
  const removeRoute = () => {
    if (!selected) return;
    setDeleted(selected); setRoutes(previous => previous.filter(route => route.id !== selected.id)); startNew(); setNotice('Route removed.');
  };
  return <section className="pv-routes" aria-labelledby="travel-routes-title">
    <div className="pv-routes-heading"><div><span className="pv-eyebrow"><Icon name="compass" size={16}/> TRAVEL ROUTES</span><h2 id="travel-routes-title">Know your way there.</h2><p>Plan a journey between your places. Keep the routes you may need close at hand.</p></div><button type="button" className="pv-button" onClick={startNew}><Icon name="plus" size={15}/> New route</button></div>
    <div className="pv-routes-workspace">
      <aside className="pv-route-saved" aria-label="Saved routes"><div className="pv-route-list-heading"><h3>Saved routes</h3><span>{propertyRoutes.length}</span></div>{propertyRoutes.length ? <div className="pv-route-list">{propertyRoutes.map(route => <button key={route.id} type="button" onClick={() => choose(route)} className={selectedId === route.id ? 'is-selected' : ''} aria-pressed={selectedId === route.id}><span className="pv-route-mode">{TRAVEL_MODES.find(mode => mode.value === route.travelMode)?.label || 'Drive'}</span><strong>{route.name || 'Untitled route'}</strong><span>{route.origin || 'Choose a starting point'}</span><span className="pv-route-destination">↳ {route.destination || 'Choose a destination'}</span></button>)}</div> : <div className="pv-route-empty"><Icon name="map" size={28}/><h4>Your routes, ready when needed.</h4><p>Save a route to your cabin, a meeting point, or somewhere you can get help.</p></div>}</aside>
      <div className="pv-route-editor"><form onSubmit={mapRoute}><div className="pv-route-editor-heading"><h3>{selected ? 'Edit route' : 'Plan a route'}</h3>{selected && <button type="button" className="pv-route-remove" onClick={removeRoute}><Icon name="trash" size={14}/> Remove</button>}</div><label className="pv-field">Route name <span className="pv-route-optional">(optional)</span><input value={draft.name} onChange={event => update('name', event.target.value)} placeholder="e.g. Home to the cabin" maxLength={100}/></label><div className="pv-route-endpoints"><LocationInput label="From" marker="A" value={draft.origin} onChange={value => update('origin', value)} places={places}/><button className="pv-route-swap" type="button" aria-label="Swap starting point and destination" onClick={() => { setDraft(previous => ({ ...previous, origin: previous.destination, destination: previous.origin })); setMapped(null); setError(''); setNotice(''); }}>⇅</button><LocationInput label="To" marker="B" value={draft.destination} onChange={value => update('destination', value)} places={places}/></div><fieldset className="pv-route-modes"><legend>How will you travel?</legend>{TRAVEL_MODES.map(mode => <label key={mode.value} className={draft.travelMode === mode.value ? 'is-selected' : ''}><input type="radio" name="route-travel-mode" value={mode.value} checked={draft.travelMode === mode.value} onChange={() => update('travelMode', mode.value)}/>{mode.label}</label>)}</fieldset><label className="pv-field">Route notes <span className="pv-route-optional">(optional)</span><textarea value={draft.notes} onChange={event => update('notes', event.target.value)} placeholder="Meeting point, supplies to bring, or things to check before leaving." maxLength={2000} rows={2}/></label>{error && <p className="pv-route-error" role="alert">{error}</p>}<div className="pv-route-actions"><button type="submit" className="pv-button pv-primary"><Icon name="map" size={16}/> {isLocalEdition() ? 'Preview route details' : 'Map route'}</button><button type="button" className="pv-button" onClick={saveRoute}>{selected ? 'Save changes' : 'Save route'}</button></div><p className="pv-route-privacy">{isLocalEdition() ? 'Route details stay on this computer. Opening Google directions sends the two locations to Google Maps.' : 'Mapping a route sends the two locations to Google Maps. Your saved route and notes stay in your PrepVault plan.'}</p></form></div>
    </div>
    {(notice || deleted) && <div className="pv-route-notice" role="status"><span>{notice}</span>{deleted && <button type="button" onClick={() => { setRoutes(previous => previous.some(route => route.id === deleted.id) ? previous : [...previous, deleted]); choose(deleted); setDeleted(null); setNotice('Route restored.'); }}>Undo removal</button>}</div>}
    {mapped ? <RouteMap key={`${mapped.origin}|${mapped.destination}|${mapped.travelMode}`} route={mapped}/> : <div className="pv-route-map-empty"><Icon name="compass" size={28}/><div><h3>Two places. A clear way forward.</h3><p>{isLocalEdition() ? 'Enter your starting point and destination, then preview and save your route details for offline reference.' : 'Enter your starting point and destination, then choose Map route to see the journey.'}</p></div></div>}
  </section>;
}
