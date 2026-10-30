import { useEffect, useState } from 'react';
import { RADIO_LOCATION_KEY, radioDirectoryRequest, readRadioLocation } from './radio-directory.js';

export default function RadioDirectory({ onPlay, selectedId }) {
  const [location, setLocation] = useState(() => readRadioLocation(localStorage));
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [stations, setStations] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const { countryCode, country } = location;
  useEffect(() => {
    const controller = new AbortController();
    radioDirectoryRequest('countries', {}, { signal: controller.signal }).then(setCountries).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    if (countryCode) radioDirectoryRequest('states', { countryCode, country, state: '' }, { signal: controller.signal }).then(rows => { if (!controller.signal.aborted) setStates(rows); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [countryCode, country, retry]);
  useEffect(() => {
    if (!location.countryCode) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus('loading'); setError(''); setStations([]);
      radioDirectoryRequest('stations', location, { signal: controller.signal }).then(rows => { if (!controller.signal.aborted) { setStations(rows); setStatus('ready'); } }).catch(error => { if (!controller.signal.aborted) { setError(error.message); setStatus('error'); } });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [location, retry]);
  const changeLocation = next => {
    setLocation(next); setStations([]); setQuery(''); setStatus(next.countryCode ? 'loading' : '');
    try { if (next.countryCode) localStorage.setItem(RADIO_LOCATION_KEY, JSON.stringify(next)); else localStorage.removeItem(RADIO_LOCATION_KEY); }
    catch { setError('Your location could not be saved on this device.'); }
  };
  const visible = stations.filter(station => `${station.name} ${station.tags}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="pv-radio-directory">
    <div className="pv-comms-section-heading"><div><h3>Listen near you</h3><p>Choose your location to populate available internet radio streams.</p></div><button type="button" className="pv-radio-text-button" onClick={() => setRetry(value => value + 1)}>Refresh directory</button></div>
    <div className="pv-radio-location"><label className="pv-field">Country<select value={location.countryCode} onChange={event => { const country = countries.find(entry => entry.code === event.target.value); setStates([]); changeLocation({ countryCode: country?.code || '', country: country?.name || '', state: '' }); }}><option value="">Choose a country</option>{location.countryCode && !countries.some(entry => entry.code === location.countryCode) && <option value={location.countryCode}>{location.country}</option>}{countries.map(entry => <option key={entry.code} value={entry.code}>{entry.name}</option>)}</select></label><label className="pv-field">State / province / region<select value={location.state} disabled={!location.countryCode} onChange={event => changeLocation({ ...location, state: event.target.value })}><option value="">All regions</option>{location.state && !states.some(entry => entry.name === location.state) && <option value={location.state}>{location.state}</option>}{states.map(entry => <option key={entry.name} value={entry.name}>{entry.name}</option>)}</select></label></div>
    {error && <p className="pv-radio-error" role="alert">{error}</p>}
    {status === 'loading' && <p role="status">Finding streams for {location.state || location.country}…</p>}
    {status === 'ready' && <><label className="pv-field">Find a station or topic<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Station name, news, weather…"/></label><p className="pv-radio-directory-count">{visible.length} available {visible.length === 1 ? 'stream' : 'streams'} · {location.state || location.country}</p>{visible.length ? <div className="pv-radio-results">{visible.map(station => <article key={station.id}><div><strong>{station.name}</strong><small>{station.region}</small><span>{station.tags || 'Broadcast radio'}</span></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => onPlay(station)} aria-label={`Play ${station.name}`}>{selectedId === station.id ? 'Play again' : 'Play'}</button></article>)}</div> : <p>No compatible streams match. Try another region or search, or add a direct stream below.</p>}</>}
    <p className="pv-radio-note">Directory: <a href="https://www.radio-browser.info/" target="_blank" rel="noreferrer">Radio Browser</a>. Region labels are community supplied. These are receive-only internet broadcasts, not every radio frequency in your area. Availability can change.</p>
    <p className="pv-radio-note">Police & emergency scanning: open the public scanner directory, choose your area and listen there. PrepVault can play a broadcaster-authorized direct HTTPS stream you add below. It cannot tune radio signals, decrypt protected channels or transmit to emergency services.</p>
    <div className="pv-radio-links"><a href="https://www.broadcastify.com/listen/" target="_blank" rel="noreferrer">Open public police, fire & EMS feeds ↗</a><a href="https://www.weatherusa.net/radio" target="_blank" rel="noreferrer">Find weather radio feeds ↗</a></div>
  </div>;
}
