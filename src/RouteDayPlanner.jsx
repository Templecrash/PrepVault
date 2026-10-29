import { useEffect, useState } from 'react';
import { fetchOvernightPlaces, matchingOvernightStop, normalizeOvernightResult } from './overnight-stops.js';
import './route-day-planner.css';

const km = value => `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
const hours = value => { const minutes = Math.round(value * 60); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; };
const PAGE_SIZE = 20;
const walkingDirections = (stop, place) => `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: `${stop.latitude},${stop.longitude}`, destination: `${place.latitude},${place.longitude}`, travelmode: 'walking' })}`;

export default function RouteDayPlanner({ route, travel, itinerary, error, onTravelChange, overnight, onOvernightChange, onShowPlace, local, onSignIn }) {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState({ key: '', pending: false, error: '', status: null });
  const stops = itinerary?.stops || [];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(stops.length / PAGE_SIZE) - 1));
  const visibleStops = stops.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const missing = visibleStops.filter(stop => !stop.isDestination && !matchingOvernightStop(overnight, stop));
  const lookupKey = JSON.stringify(missing.map(({ day, latitude, longitude }) => ({ day, latitude, longitude })));
  useEffect(() => {
    if (local || lookupKey === '[]') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookup({ key: lookupKey, pending: true, error: '', status: null });
      try {
        const result = await fetchOvernightPlaces(JSON.parse(lookupKey), { signal: controller.signal });
        if (controller.signal.aborted) return;
        onOvernightChange(current => normalizeOvernightResult({ ...result, stops: [...(current?.stops || []).filter(row => !result.stops.some(next => next.day === row.day)), ...result.stops].sort((a, b) => a.day - b.day) }));
        setLookup({ key: lookupKey, pending: false, error: '', status: null });
      } catch (problem) {
        if (!controller.signal.aborted) setLookup({ key: lookupKey, pending: false, error: problem.message || 'Overnight options could not be checked.', status: problem.status });
      }
    }, 800);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [lookupKey, attempt, local, onOvernightChange]);
  const currentLookup = lookup.key === lookupKey ? lookup : null;
  return <section className="pv-route-day-planner">
    <div className="pv-route-section-heading"><h3>Your daily stages</h3><span>{itinerary ? `${km(itinerary.dailyDistanceKm)} / day` : 'Set your pace'}</span></div>
    <div className="pv-route-pace-fields">
      {route.mode === 'walk' && <label>Maximum walking km / day<input type="number" min="1" max="50" step="1" value={travel.walkingKmPerDay} onChange={event => onTravelChange('walkingKmPerDay', event.target.value)}/></label>}
      <label>{route.mode === 'walk' ? 'Hours available / day' : route.mode === 'bike' ? 'Cycling hours / day' : 'Driving hours / day'}<input type="number" min="1" max="12" step="0.5" value={route.mode === 'walk' ? travel.hoursPerDay : route.mode === 'bike' ? travel.cyclingHours : travel.drivingHours} onChange={event => onTravelChange(route.mode === 'walk' ? 'hoursPerDay' : route.mode === 'bike' ? 'cyclingHours' : 'drivingHours', event.target.value)}/></label>
      {route.mode === 'walk' && <label>Walking speed (km/h)<input type="number" min="1" max="8" step="0.5" value={travel.walkingSpeed} onChange={event => onTravelChange('walkingSpeed', event.target.value)}/></label>}
      {route.mode === 'bike' && <label>Cycling pace (km/h)<input type="number" min="5" max="35" step="1" value={travel.cyclingSpeed} onChange={event => onTravelChange('cyclingSpeed', event.target.value)}/></label>}
      <label>Rest minutes / moving hour<input type="number" min="0" max="60" step="5" value={travel.breakMinutes} onChange={event => onTravelChange('breakMinutes', event.target.value)}/></label>
    </div>
    {error && <p className="pv-route-inline-error" role="alert">{error}</p>}
    <p className="pv-route-note">{route.mode === 'walk' ? 'Each stage respects your distance cap and available hours, including rests. Mapped terrain may reduce the distance you can cover. ' : 'Each stage fits your available hours, including rests. '}Allow extra time for weather, your group and conditions on the ground.</p>
    {stops.length > 1 && <div className="pv-overnight-intro"><strong>Somewhere to stop for the night</strong><p>These are mapped campsites and places to stay near each day’s end. Confirm that a place is open, accessible and suitable before relying on it. Nearby distances are straight-line; any detour is extra walking.</p>{!local && <button type="button" className="pv-route-text-button" disabled={Boolean(currentLookup?.pending)} onClick={() => { onOvernightChange(null); setAttempt(value => value + 1); }}>Refresh nearby places</button>}</div>}
    {missing.length > 0 && !local && <div className="pv-overnight-lookup" role="status">{currentLookup?.error ? <><p>{currentLookup.error}</p><button type="button" className="pv-route-text-button" onClick={() => setAttempt(value => value + 1)}>Try again</button>{[401, 403].includes(currentLookup.status) && onSignIn && <button type="button" className="pv-route-text-button" onClick={onSignIn}>Sign in</button>}</> : <p>{currentLookup?.pending ? 'Finding mapped overnight options…' : 'Checking nearby campsites and places to stay…'}</p>}</div>}
    <ol className="pv-day-stages" start={currentPage * PAGE_SIZE + 1}>{visibleStops.map(stop => {
      const row = matchingOvernightStop(overnight, stop);
      return <li key={stop.day}><details><summary><span className="pv-day-number">{stop.day}</span><span><strong>{stop.isDestination ? 'Arrive at your destination' : `Day ${stop.day} · Overnight stop`}</strong><small>{km(stop.legDistanceKm)} this day · {hours(stop.travelHours)} including rests</small>{!stop.isDestination && <small>{row?.places[0]?.name ? `Nearby: ${row.places[0].name}` : row ? 'No mapped stay found within 5 km' : local ? 'No saved overnight options' : 'Review nearby places to stay'}</small>}</span><span className="pv-day-expand" aria-hidden="true">+</span></summary>
        <div className="pv-day-details"><p className="pv-route-note">{km(stop.distanceKm)} from the start · {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</p>{!local && <button type="button" className="pv-route-text-button" onClick={() => onShowPlace(stop)}>Show day’s end on map</button>}
          {!stop.isDestination && row?.places.map(place => <article className="pv-overnight-place" key={place.id}><div><h4>{place.name}</h4><p>{place.type} · {km(place.distanceKm)} from day’s end, straight-line</p></div><p className="pv-overnight-verification">Map listing · availability and safety unverified</p><dl>{[['access', 'Access'], ['openingHours', 'Opening hours'], ['seasonal', 'Seasonal'], ['reservation', 'Reservation'], ['fee', 'Fee'], ['drinkingWater', 'Drinking water'], ['toilets', 'Toilets']].filter(([key]) => place[key]).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{place[key]}</dd></div>)}</dl><div className="pv-overnight-actions">{!local && <button type="button" className="pv-route-text-button" onClick={() => onShowPlace({ ...place, day: stop.day })}>Show on map</button>}<a href={place.sourceUrl} target="_blank" rel="noreferrer">Map listing ↗</a>{route.mode === 'walk' && <a href={walkingDirections(stop, place)} target="_blank" rel="noreferrer">Check walking detour ↗</a>}{place.website && <a href={place.website} target="_blank" rel="noreferrer">Check with operator ↗</a>}</div></article>)}
          {!stop.isDestination && row && !row.places.length && <p className="pv-route-stop-note">No mapped campsite or lodging was found nearby. This point is a planning marker, not a place confirmed suitable for sleeping. Adjust your daily distance or choose a known overnight location as a route stop.</p>}
          {!stop.isDestination && !row && local && <p className="pv-route-note">This download has no saved stays for this stage. Research an overnight location before setting out.</p>}
        </div></details></li>;
    })}</ol>
    {stops.length > PAGE_SIZE && <nav className="pv-day-pagination" aria-label="Travel day pages"><button type="button" className="pv-route-text-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous days</button><span>Days {currentPage * PAGE_SIZE + 1}–{Math.min(stops.length, (currentPage + 1) * PAGE_SIZE)}</span><button type="button" className="pv-route-text-button" disabled={(currentPage + 1) * PAGE_SIZE >= stops.length} onClick={() => setPage(currentPage + 1)}>Next days</button></nav>}
    {overnight && <p className="pv-route-note">Overnight data: OpenStreetMap · Last lookup {new Date(overnight.checkedAt).toLocaleString()}. Listings may be incomplete or outdated. Saved options are included in your offline download.</p>}
  </section>;
}
