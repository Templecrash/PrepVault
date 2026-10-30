import { useEffect, useState } from 'react';
import { Icon } from './brand.jsx';
import LocationBriefing from './LocationBriefing.jsx';
import LocalUpdates from './LocalUpdates.jsx';
import { LOCATION_EVENT, locationWatchKey, readLocation, readLocationWatchlist } from './location.js';
import './news.css';

function readPlaces() {
  const primary = readLocation(localStorage);
  try { return { primary, locations: readLocationWatchlist(localStorage), error: '' }; }
  catch (error) { return { primary, locations: [], error: `${error.message} Your saved places have not been changed. Manage them in Location or restore a valid backup.` }; }
}

export default function NewsView({ onOpenLocation }) {
  const [places, setPlaces] = useState(readPlaces);
  const [selectedKey, setSelectedKey] = useState('');
  useEffect(() => {
    const changed = () => setPlaces(readPlaces());
    window.addEventListener(LOCATION_EVENT, changed);
    window.addEventListener('storage', changed);
    return () => {
      window.removeEventListener(LOCATION_EVENT, changed);
      window.removeEventListener('storage', changed);
    };
  }, []);
  const primaryKey = places.primary ? locationWatchKey(places.primary) : '';
  const location = places.locations.find(place => locationWatchKey(place) === selectedKey)
    || places.locations.find(place => locationWatchKey(place) === primaryKey)
    || places.locations[0] || null;
  return <section className="pv-news pv-inventory" aria-labelledby="news-title">
    <header className="pv-inventory-heading">
      <div><p className="pv-inventory-eyebrow">STAY INFORMED</p><h1 id="news-title">News<span>.</span></h1><p className="pv-inventory-intro">Local headlines, wider events and public updates for the places you follow.</p></div>
      <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onOpenLocation}><Icon name="compass" size={16}/>Manage locations</button>
    </header>
    {places.error && <p className="pv-news-notice" role="alert">{places.error}</p>}
    {location ? <div className="pv-news-location">
      <label className="pv-field">News for<select value={locationWatchKey(location)} onChange={event => setSelectedKey(event.target.value)}>{places.locations.map(place => <option key={locationWatchKey(place)} value={locationWatchKey(place)}>{[place.name, place.region, place.country].filter(Boolean).join(', ')}</option>)}</select></label>
      <p>Switch between your saved cities without changing your home or destination.</p>
    </div> : <div className="pv-news-notice"><p>Add a city in Location for local reporting. Wider news is available below.</p><button type="button" className="pv-text-link" onClick={onOpenLocation}>Choose a location<Icon name="arrow" size={15}/></button></div>}
    <LocationBriefing activeLocation={location} locations={places.locations}/>
    <LocalUpdates activeLocation={location}/>
  </section>;
}
