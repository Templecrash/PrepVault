import { useEffect, useMemo, useRef, useState } from 'react';
import { routeToOfflineHtml } from './offline-route-document.js';
import RouteStreetMap from './RouteStreetMap.jsx';
import { Icon } from './brand.jsx';
import MapPlaceFields from './MapPlaceFields.jsx';
import { hasMapCoordinates } from './map-search.js';
import { readLocation } from './location.js';
import { nextUnplacedPoint, routePointLabel, routePointLetter, withMapPin } from './route-pins.js';
import { isLocalEdition } from './runtime-mode.js';
import { calculateRoute, getAvoidanceBudget, MAX_AVOIDANCE_BOUNDARY_KM, MIN_AVOIDANCE_RADIUS_KM, planTravelDays, readRoutePlans, routeToGpx, saveRoutePlans } from './offline-route.js';
import './inventory.css';
import './offline-maps.css';

const MODES = { drive: 'Fastest driving', 'avoid-highways': 'Avoid highways', bike: 'Cycling', walk: 'Walking' };
const uid = () => globalThis.crypto?.randomUUID?.() || `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankPoint = () => ({ id: uid(), name: '', latitude: '', longitude: '' });
const DEFAULT_TRAVEL = { hoursPerDay: 6, walkingSpeed: 4, cyclingHours: 6, cyclingSpeed: 15, drivingHours: 6, breakMinutes: 15 };
const distance = value => Number.isFinite(value) ? `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} km` : '—';
const placeTitle = name => String(name || '').split(',')[0];
const duration = seconds => { const minutes = Math.round(seconds / 60); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; };
const readSaved = () => { try { return { plans: readRoutePlans(localStorage), error: '' }; } catch (error) { return { plans: [], error: error.message }; } };
const asPoint = (value, index) => {
  if (String(value.latitude).trim() === '' || String(value.longitude).trim() === '' || !Number.isFinite(Number(value.latitude)) || Math.abs(Number(value.latitude)) > 85 || !Number.isFinite(Number(value.longitude)) || Math.abs(Number(value.longitude)) > 180) throw new Error(`Choose a place or enter valid coordinates for ${value.name || `point ${index + 1}`}.`);
  return { name: value.name.trim() || `Point ${index + 1}`, latitude: Number(value.latitude), longitude: Number(value.longitude) };
};

function RouteDrawing({ route, stops }) {
  const drawing = useMemo(() => {
    const coordinates = route.coordinates || [];
    if (coordinates.length < 2) return null;
    const bounds = coordinates.reduce((b, point) => ({ minLat: Math.min(b.minLat, point[1]), maxLat: Math.max(b.maxLat, point[1]), minLng: Math.min(b.minLng, point[0]), maxLng: Math.max(b.maxLng, point[0]) }), { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 });
    const { minLat, maxLat, minLng, maxLng } = bounds;
    const cosine = Math.max(0.05, Math.cos((minLat + maxLat) * Math.PI / 360));
    const width = Math.max(0.002, (maxLng - minLng) * cosine), height = Math.max(0.002, maxLat - minLat);
    const scale = Math.min(580 / width, 300 / height);
    const offsetX = (660 - (maxLng - minLng) * cosine * scale) / 2, offsetY = (380 - (maxLat - minLat) * scale) / 2;
    const project = (latitude, longitude) => [offsetX + (longitude - minLng) * cosine * scale, offsetY + (maxLat - latitude) * scale];
    return { line: coordinates.map(point => project(point[1], point[0]).join(',')).join(' '), points: route.points.map((point, index) => ({ ...point, xy: project(point.latitude, point.longitude), label: index === 0 ? 'A' : index === route.points.length - 1 ? 'B' : String(index) })), stops: (stops || []).filter(stop => !stop.isDestination).map(stop => ({ ...stop, xy: project(stop.latitude, stop.longitude) })) };
  }, [route, stops]);
  if (!drawing) return <p className="pv-route-note">No route geometry is available.</p>;
  return <div className="pv-route-drawing"><svg viewBox="0 0 660 380" role="img" aria-label={`Saved route from ${route.points[0]?.name} to ${route.points.at(-1)?.name}, with waypoints and suggested daily stops`}><defs><pattern id="pv-route-grid" width="33" height="38" patternUnits="userSpaceOnUse"><path d="M33 0H0V38" fill="none" stroke="#e6ebdf" strokeWidth=".7"/></pattern></defs><rect width="660" height="380" fill="#f6f8f1"/><rect width="660" height="380" fill="url(#pv-route-grid)"/><polyline points={drawing.line} fill="none" stroke="#fff" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round"/><polyline points={drawing.line} fill="none" stroke="#668561" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{drawing.stops.map((stop, index) => <g key={`stop-${index}`} transform={`translate(${stop.xy.join(' ')})`}><circle r="8" fill="#c9a168" stroke="#fff" strokeWidth="2"/><title>Suggested stop after day {stop.day}</title></g>)}{drawing.points.map((point, index) => <g key={`point-${index}`} transform={`translate(${point.xy.join(' ')})`}><circle r="12" fill="#31593f" stroke="#fff" strokeWidth="2"/><text textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="10" fontFamily="sans-serif">{point.label}</text><title>{point.name}</title></g>)}<text x="636" y="28" textAnchor="middle" fill="#839773" fontSize="10" fontFamily="sans-serif">N ↑</text></svg><div><span><i/>Saved route geometry · available offline</span><span>Overview without a street basemap</span></div></div>;
}

function downloadPlan(plan, format = 'json') {
  const blob = new Blob([format === 'gpx' ? routeToGpx(plan.route) : format === 'html' ? routeToOfflineHtml(plan) : JSON.stringify(plan, null, 2)], { type: format === 'gpx' ? 'application/gpx+xml' : format === 'html' ? 'text/html;charset=utf-8' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `${(plan.name || 'travel-plan').replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}.${format}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function OfflineMaps({ onOpenPropertyMap, onSignIn }) {
  const [loaded] = useState(readSaved);
  const [plans, setPlans] = useState(loaded.plans);
  const [points, setPoints] = useState(() => [blankPoint(), blankPoint()]);
  const [avoidAreas, setAvoidAreas] = useState([]);
  const [pickingId, setPickingId] = useState(null);
  const [pinStatus, setPinStatus] = useState('');
  const [mapFocus, setMapFocus] = useState(null);
  const [viewRevision, setViewRevision] = useState(0);
  const [initialCenter] = useState(() => readLocation(localStorage));
  const mapRef = useRef(null);
  const [mode, setMode] = useState('drive');
  const [route, setRoute] = useState(null);
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState(null);
  const [travel, setTravel] = useState(DEFAULT_TRAVEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [notice, setNotice] = useState('');
  const [deleted, setDeleted] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const controller = useRef(null);
  const resultRef = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const local = isLocalEdition();
  const avoidanceBudget = getAvoidanceBudget(avoidAreas);
  const travelResult = useMemo(() => { if (!route) return {}; try { return { itinerary: planTravelDays(route, travel) }; } catch (problem) { return { error: problem.message }; } }, [route, travel]);
  const itinerary = travelResult.itinerary;
  const invalidate = () => { setRoute(null); setPlanId(null); setNotice(''); setError(''); };
  const changePoint = (id, value) => {
    setPoints(previous => previous.map(point => point.id === id ? value : point));
    if (hasMapCoordinates(value) && value.selectionSource === 'search') { setViewRevision(value => value + 1); setPickingId(null); }
    invalidate();
  };
  const activeIndex = points.findIndex(point => point.id === pickingId);
  const activeAreaIndex = avoidAreas.findIndex(area => area.id === pickingId);
  const pickingLabel = activeIndex >= 0 ? routePointLabel(activeIndex, points.length) : activeAreaIndex >= 0 ? `Avoid area ${activeAreaIndex + 1}` : '';
  const beginPick = id => {
    if (local || busy) return;
    const point = [...points, ...avoidAreas].find(point => point.id === id);
    if (!point) return;
    setPickingId(id); setPinStatus('');
    if (hasMapCoordinates(point)) setMapFocus({ key: uid(), latitude: Number(point.latitude), longitude: Number(point.longitude) });
    requestAnimationFrame(() => mapRef.current?.scrollIntoView({ block: window.matchMedia('(max-width: 760px)').matches ? 'start' : 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  };
  const placePin = coordinates => {
    if (local || busy || !pickingLabel) return;
    if (activeIndex >= 0) {
      const updated = points.map(point => point.id === pickingId ? withMapPin(point, coordinates) : point);
      const nextId = nextUnplacedPoint(updated, pickingId);
      setPoints(updated); setPickingId(nextId);
      setPinStatus(`${pickingLabel} placed.${nextId ? ' Choose the next point on the map.' : ' Drag pins to adjust, then calculate your route.'}`);
    } else {
      setAvoidAreas(previous => previous.map(area => area.id === pickingId ? withMapPin(area, coordinates) : area));
      setPickingId(null); setPinStatus(`${pickingLabel} placed. Adjust its radius in the journey settings.`);
    }
    invalidate();
  };
  const movePin = (id, coordinates) => {
    if (local || busy || !points.some(point => point.id === id)) return;
    setPoints(previous => previous.map(point => point.id === id ? withMapPin(point, coordinates) : point));
    setPickingId(null); setPinStatus('Pin moved. Calculate the route again to update your directions.'); invalidate();
  };
  const reorder = (index, direction) => { setPoints(previous => { const next = [...previous]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; }); invalidate(); };
  const calculate = async event => {
    event.preventDefault(); setError(''); setNotice(''); setNeedsSignIn(false);
    let query;
    try { query = { points: points.map(asPoint), mode, walkingSpeed: Number(travel.walkingSpeed), cyclingSpeed: Number(travel.cyclingSpeed), avoidAreas: avoidAreas.map((area, index) => ({ ...asPoint(area, index), radiusKm: Number(area.radiusKm) })) }; }
    catch (problem) { setError(problem.message); return; }
    setBusy(true); controller.current = new AbortController();
    try { const result = await calculateRoute(query, { signal: controller.current.signal }); setRoute(result); setPlanId(null); setShowInstructions(false); if (!name.trim()) setName(`${placeTitle(query.points[0].name)} to ${placeTitle(query.points.at(-1).name)}`.slice(0, 150)); resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (problem) { if (problem.name !== 'AbortError') { setError(problem.message || 'The route could not be calculated.'); setNeedsSignIn(problem.status === 401 || /sign.?in|authenticat|unauthori/i.test(problem.message)); } }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!route || loaded.error || travelResult.error) return;
    const plan = { id: planId || uid(), name: name.trim() || `${route.points[0].name} to ${route.points.at(-1).name}`.slice(0, 150), route, travel, savedAt: new Date().toISOString() };
    try { const next = saveRoutePlans(localStorage, plans.some(existing => existing.id === plan.id) ? plans.map(existing => existing.id === plan.id ? plan : existing) : [...plans, plan]); setPlans(next); setPlanId(plan.id); downloadPlan(plan, 'html'); setNotice('Route saved. Open the downloaded HTML file for the route drawing, directions and day stops without internet or sign-in.'); setError(''); setDeleted(null); }
    catch (problem) { setError(problem.message); }
  };
  const load = plan => { setPickingId(null); setPinStatus(''); setMapFocus(null); setViewRevision(value => value + 1); setRoute(plan.route); setTravel({ ...DEFAULT_TRAVEL, ...plan.travel }); setName(plan.name); setPlanId(plan.id); setMode(plan.route.mode); setPoints(plan.route.points.map(point => ({ ...point, id: uid(), latitude: String(point.latitude), longitude: String(point.longitude), selectionSource: 'map' }))); setAvoidAreas((plan.route.avoidAreas || []).map(area => ({ ...area, id: uid(), selectionSource: 'map' }))); setError(''); setNotice(`Opened saved plan: ${plan.name}.`); setShowInstructions(false); resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const remove = plan => { try { setPlans(saveRoutePlans(localStorage, plans.filter(existing => existing.id !== plan.id))); setDeleted(plan); if (planId === plan.id) setPlanId(null); setNotice('Saved route removed.'); } catch (problem) { setError(problem.message); } };
  const undo = () => { try { setPlans(saveRoutePlans(localStorage, [...plans, deleted])); setDeleted(null); setNotice('Saved route restored.'); } catch (problem) { setError(problem.message); } };
  const updateTravel = (key, value) => setTravel(current => ({ ...current, [key]: value === '' ? '' : Number(value) }));
  const currentPlan = route && { id: planId || 'exported-travel-plan', name: name.trim() || 'Travel plan', route, travel, savedAt: new Date().toISOString() };

  const onlineMap = <div className="pv-route-online-map" key="journey-map" ref={mapRef}>
    <div className="pv-route-pin-toolbar">
      <div><strong>Drop pins on the map</strong><p>{pickingLabel ? `Click or tap to place: ${pickingLabel.toLowerCase()}.` : 'Choose a point, then click the map. Drag an existing pin to fine-tune it.'}</p></div>
      <div className="pv-route-pin-choices" role="group" aria-label="Choose a point to place on the map">{points.map((point, index) => <button key={point.id} type="button" disabled={busy} aria-pressed={pickingId === point.id} onClick={() => beginPick(point.id)}><span>{routePointLetter(index, points.length)}</span>{routePointLabel(index, points.length)}</button>)}{pickingLabel && <button type="button" disabled={busy} onClick={() => { setPickingId(null); setPinStatus('Pin placement stopped. You can pan and zoom the map.'); }}>Cancel pin</button>}</div>
    </div>
    <RouteStreetMap route={route} points={points} avoidAreas={avoidAreas} stops={itinerary?.stops} initialCenter={initialCenter} picking={Boolean(pickingLabel)} pickingLabel={pickingLabel} disabled={busy} onMapPick={placePin} onPointMove={movePin} focusPoint={mapFocus} viewRevision={viewRevision} fallback={route ? <RouteDrawing route={route} stops={itinerary?.stops}/> : null}/>
    {pinStatus && <p className="pv-route-pin-status" role="status">{pinStatus}</p>}
    <p className="pv-route-note">Can’t find a rural address? Search the nearby road or town, then place the pin on the road entrance you use. A pin can be anywhere; routing still needs a mapped, accessible path.</p>
    <p className="pv-route-note">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Street tiles need internet and share the viewed area with OpenStreetMap.</p>
  </div>;

  return <section className="pv-inventory pv-offline-routes" aria-labelledby="offline-routes-title"><header className="pv-inventory-heading"><div><p className="pv-inventory-eyebrow">KEEP YOUR WAY HOME</p><h1 id="offline-routes-title">Maps<span>.</span></h1><p className="pv-inventory-intro">Plan the journey, save your directions, and make each travel day manageable.</p></div>{onOpenPropertyMap && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onOpenPropertyMap}><Icon name="map" size={17}/>Saved property maps</button>}</header>
    {local && <p className="pv-route-banner">You’re using the offline edition. Open saved plans below to see their route, directions and day stops. New routes and place searches require the online site.</p>}
    {(loaded.error || error) && <div className="pv-route-error" role="alert"><p>{loaded.error || error}</p>{needsSignIn && onSignIn && <button type="button" className="pv-route-text-button" onClick={onSignIn}>Sign in to calculate routes<Icon name="arrow" size={14}/></button>}</div>}
    {notice && <p className="pv-route-notice" role="status">{notice}{deleted && <button type="button" onClick={undo}>Undo</button>}</p>}
    <div className="pv-route-layout"><div className="pv-route-builder"><form onSubmit={calculate}><div className="pv-route-section-heading"><div><p className="pv-route-eyebrow">YOUR JOURNEY</p><h2>Connect the places</h2></div><span>{points.length} / 6 points</span></div><div className="pv-route-mode" aria-label="Travel mode">{Object.entries(MODES).map(([key, label]) => <button type="button" key={key} disabled={busy} aria-pressed={mode === key} onClick={() => { setMode(key); invalidate(); }}>{label}</button>)}</div><div className="pv-route-points">{points.map((point, index) => <div className="pv-route-point" key={point.id}><span className="pv-route-marker">{index === 0 ? 'A' : index === points.length - 1 ? 'B' : index}</span><MapPlaceFields value={point} onChange={value => changePoint(point.id, value)} label={routePointLabel(index, points.length)} local={local} disabled={busy} onSignIn={onSignIn} onPickMap={() => beginPick(point.id)} picking={pickingId === point.id}/><div className="pv-route-point-actions"><button type="button" disabled={index === 0 || busy} onClick={() => reorder(index, -1)} aria-label={`Move point ${index + 1} up`}>↑</button><button type="button" disabled={index === points.length - 1 || busy} onClick={() => reorder(index, 1)} aria-label={`Move point ${index + 1} down`}>↓</button><button type="button" disabled={points.length <= 2 || busy} onClick={() => { setPoints(current => current.filter(value => value.id !== point.id)); invalidate(); }} aria-label={`Remove point ${index + 1}`}><Icon name="close" size={13}/></button></div></div>)}</div><button type="button" className="pv-route-text-button" disabled={points.length >= 6 || busy} onClick={() => { setPoints(current => [...current.slice(0, -1), blankPoint(), current.at(-1)]); invalidate(); }}><Icon name="plus" size={14}/>Add a stop</button>
      <details className="pv-route-avoid">
        <summary>Avoid selected towns or areas <span>{avoidAreas.length ? `(${avoidAreas.length})` : '(optional)'}</span></summary>
        <p>Choose small areas to route around. For a larger town, choose stops around it and review the route. This does not automatically avoid every populated area.</p>
        <p id="route-avoidance-budget" className={avoidanceBudget.exceedsLimit ? 'pv-route-inline-error' : ''} aria-live="polite">About {avoidanceBudget.boundaryKm.toFixed(1)} / {MAX_AVOIDANCE_BOUNDARY_KM} km of combined circle boundaries. {avoidanceBudget.exceedsLimit ? 'Reduce the radii or remove an area before recalculating. Existing saved routes remain available.' : 'All selected circles share this routing-service limit.'}</p>
        {avoidAreas.map((area, index) => <div className="pv-route-avoid-area" key={area.id}>
          <MapPlaceFields value={area} onChange={value => { setAvoidAreas(current => current.map(entry => entry.id === area.id ? value : entry)); invalidate(); }} label={`Avoid area ${index + 1}`} local={local} disabled={busy} onSignIn={onSignIn} onPickMap={() => beginPick(area.id)} picking={pickingId === area.id}/>
          <div><label>Radius (km)<input type="number" min={MIN_AVOIDANCE_RADIUS_KM} max={avoidanceBudget.maxRadiusKm} step="0.1" value={area.radiusKm} disabled={busy} aria-describedby="route-avoidance-budget" aria-invalid={avoidanceBudget.exceedsLimit || undefined} onChange={event => { setAvoidAreas(current => current.map(entry => entry.id === area.id ? { ...entry, radiusKm: event.target.value } : entry)); invalidate(); }}/></label><button type="button" className="pv-route-text-button" disabled={busy} onClick={() => { setAvoidAreas(current => current.filter(entry => entry.id !== area.id)); invalidate(); }}>Remove</button></div>
        </div>)}
        <button type="button" className="pv-route-text-button" disabled={avoidAreas.length >= 4 || avoidanceBudget.nextRadiusKm === null || busy} onClick={() => { setAvoidAreas(current => { const radiusKm = getAvoidanceBudget(current).nextRadiusKm; return current.length < 4 && radiusKm !== null ? [...current, { ...blankPoint(), radiusKm }] : current; }); invalidate(); }}><Icon name="plus" size={14}/>Add an area</button>
        {avoidAreas.length < 4 && avoidanceBudget.nextRadiusKm === null && <p>Reduce a radius or remove an area to make room for another circle of at least {MIN_AVOIDANCE_RADIUS_KM} km radius.</p>}
      </details>
      <p className="pv-route-note">Search an address, town or landmark, or choose points directly on the map. Searches go to Photon / Komoot; route coordinates go to FOSSGIS / Valhalla. Stops are visited in the order shown.</p><div className="pv-route-calculate"><button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={local || busy}><Icon name="compass" size={17}/>{busy ? 'Calculating route…' : 'Calculate route'}</button>{busy && <button type="button" className="pv-route-text-button" onClick={() => controller.current?.abort()}>Cancel</button>}</div></form></div>
    <div className="pv-route-result" ref={resultRef}>{route ? <><div className="pv-route-section-heading"><div><p className="pv-route-eyebrow">{planId ? 'SAVED TRAVEL PLAN' : 'YOUR ROUTE'}</p><h2 title={`${route.points[0]?.name} → ${route.points.at(-1)?.name}`}>{placeTitle(route.points[0]?.name)} <span>→</span> {placeTitle(route.points.at(-1)?.name)}</h2></div><span>{MODES[route.mode]}</span></div>{local ? <RouteDrawing route={route} stops={itinerary?.stops}/> : onlineMap}{!local && <div className="pv-route-print-drawing"><RouteDrawing route={route} stops={itinerary?.stops}/></div>}<div className="pv-route-stats"><div><strong>{distance(route.distanceKm)}</strong><span>Total distance</span></div><div><strong>{itinerary ? duration(itinerary.movementHours * 3600) : '—'}</strong><span>Estimated movement time</span></div><div><strong>{itinerary?.days || '—'} <small>{itinerary?.days === 1 ? 'day' : 'days'}</small></strong><span>At your daily pace</span></div><div><strong>{itinerary ? duration(itinerary.totalHours * 3600) : '—'}</strong><span>Travel time including rests</span></div></div>
      {route.warnings?.length > 0 && <ul className="pv-route-warnings">{route.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      <section className="pv-route-day-planner"><div className="pv-route-section-heading"><h3>Plan your travel days</h3><span>{distance(itinerary?.dailyDistanceKm)} / day</span></div><div className="pv-route-pace-fields"><label>{route.mode === 'walk' ? 'Walking hours / day' : route.mode === 'bike' ? 'Cycling hours / day' : 'Driving hours / day'}<input type="number" min="1" max="12" step="0.5" value={route.mode === 'walk' ? travel.hoursPerDay : route.mode === 'bike' ? travel.cyclingHours : travel.drivingHours} onChange={event => updateTravel(route.mode === 'walk' ? 'hoursPerDay' : route.mode === 'bike' ? 'cyclingHours' : 'drivingHours', event.target.value)}/></label>{route.mode === 'bike' && <label>Cycling pace (km/h)<input type="number" min="5" max="35" step="1" value={travel.cyclingSpeed} onChange={event => updateTravel('cyclingSpeed', event.target.value)}/></label>}{route.mode === 'walk' && <label>Walking speed (km/h)<input type="number" min="1" max="8" step="0.5" value={travel.walkingSpeed} onChange={event => updateTravel('walkingSpeed', event.target.value)}/></label>}<label>Rest minutes / moving hour<input type="number" min="0" max="60" step="5" value={travel.breakMinutes} onChange={event => updateTravel('breakMinutes', event.target.value)}/></label></div>{travelResult.error && <p className="pv-route-inline-error" role="alert">{travelResult.error}</p>}<p className="pv-route-note">Your daily hours include the rest allowance. Walking time uses your chosen pace. Cycling adjusts the mapped estimate when you change pace; recalculate for updated directions. Allow extra time for terrain, weather and your group. Driving assumes normal mapped road conditions. Daily stops are estimates, not confirmed campsites.</p>{itinerary?.stops?.length > 0 ? <ol className="pv-route-stops">{itinerary.stops.map((stop, index) => <li key={index}><span className="pv-route-stop-dot"/><div><strong>Day {stop.day} · {stop.isDestination ? 'Arrive at destination' : 'Suggested overnight area'}</strong><p>{distance(stop.distanceKm)} from the start · {Number(stop.latitude).toFixed(5)}, {Number(stop.longitude).toFixed(5)}</p></div></li>)}</ol> : <p className="pv-route-note">Enter a valid pace to estimate your daily stops.</p>}<p className="pv-route-stop-note">Before choosing a camp, check permission and access, water, shelter and local restrictions. A suggested point on the route may not be suitable for stopping.</p></section>
      <details className="pv-route-directions" open={showInstructions} onToggle={event => setShowInstructions(event.currentTarget.open)}><summary>Turn-by-turn directions <span>{route.instructions?.length || 0} steps</span></summary><ol>{(route.instructions || []).map((step, index) => <li key={index}><span>{index + 1}</span><div><p>{step.text}</p><small>{distance(step.distanceKm)}{Number.isFinite(step.timeSeconds) ? ` · ${duration(step.timeSeconds)}` : ''}</small></div></li>)}</ol></details>
      <div className="pv-route-save"><label>Plan name<input maxLength={150} value={name} onChange={event => setName(event.target.value)} placeholder="Give this trip a name"/></label><div><button type="button" className="pv-inventory-button pv-inventory-button-primary" disabled={Boolean(loaded.error || travelResult.error)} onClick={save}><Icon name="download" size={16}/>{planId ? 'Update & download offline' : 'Save & download offline'}</button><button type="button" className="pv-inventory-button pv-inventory-button-secondary" disabled={Boolean(travelResult.error)} onClick={() => downloadPlan(currentPlan)}>Export JSON</button><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => downloadPlan(currentPlan, 'gpx')}>GPX</button><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => { setShowInstructions(true); requestAnimationFrame(() => requestAnimationFrame(() => window.print())); }}>Print</button></div></div><p className="pv-route-attribution">Routes use <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> data via <a href="https://valhalla1.openstreetmap.de/" target="_blank" rel="noreferrer">FOSSGIS / Valhalla</a>. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Report a map issue</a>. Saved directions do not include live closures or traffic.</p></> : <><div className="pv-route-section-heading"><div><p className="pv-route-eyebrow">FIND YOUR WAY</p><h2>Your map</h2></div></div>{!local && onlineMap}{local && <div className="pv-route-empty"><span><Icon name="map" size={37}/></span><h2>Your routes, ready offline</h2><p>Open a saved route below to see the drawing, directions and daily stops. New street maps and route calculations need an internet connection.</p></div>}</>}</div></div>
    <section className="pv-route-saved"><div className="pv-route-section-heading"><div><p className="pv-route-eyebrow">READY WHEN YOU NEED THEM</p><h2>Your saved routes</h2></div><span>{plans.length} saved</span></div>{plans.length ? <div className="pv-route-saved-grid">{plans.map(plan => <article key={plan.id}><span className="pv-route-saved-icon"><Icon name="map" size={22}/></span><h3>{plan.name}</h3><p>{MODES[plan.route.mode]} · {distance(plan.route.distanceKm)}</p><small>Saved {new Date(plan.savedAt).toLocaleDateString()}</small><div><button type="button" className="pv-route-text-button" disabled={busy} onClick={() => load(plan)}>Open plan<Icon name="arrow" size={14}/></button><button type="button" className="pv-route-icon-button" aria-label={`Download ${plan.name} offline`} onClick={() => downloadPlan(plan, 'html')}><Icon name="download" size={15}/></button><button type="button" className="pv-route-icon-button" disabled={Boolean(loaded.error)} aria-label={`Delete ${plan.name}`} onClick={() => remove(plan)}><Icon name="trash" size={15}/></button></div></article>)}</div> : <p className="pv-route-note">Save a completed route here and download its offline HTML file. That file opens without internet or sign-in and includes the route drawing, directions and daily plan. Saved plans are also included in your PrepVault backup for the local edition.</p>}</section>
  </section>;
}
