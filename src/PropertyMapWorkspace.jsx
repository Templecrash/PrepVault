import { useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import MapSetup from './MapSetup.jsx';
import TravelRoutes from './TravelRoutes.jsx';
import { pointOnMap } from './map-images.js';
import './property-map.css';

function PinEditor({ pin, typeLabel, onSave, onClose }) {
  const dialogRef = useDialogFocus(onClose);
  const [draft, setDraft] = useState(pin);
  return <div ref={dialogRef} className="pv-map-modal" onClick={onClose}><form role="dialog" aria-modal="true" aria-label="Marker details" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); onSave({ ...draft, label: (draft.label || '').trim() || typeLabel }); }}>
    <span className="pv-eyebrow">{typeLabel}</span><h2>{pin.id ? 'Edit marker' : 'Name this place'}</h2>
    <label className="pv-field">Marker name<input autoFocus value={draft.label || ''} onChange={event => setDraft({...draft,label:event.target.value})} placeholder={typeLabel} maxLength={120}/></label>
    <label className="pv-field">Notes<textarea value={draft.notes || ''} onChange={event => setDraft({...draft,notes:event.target.value})} placeholder="Access details, supplies, or anything worth remembering" maxLength={3000} rows={3}/></label>
    {pin.layer === 'defense' && <label className="pv-field">Assigned to<input value={draft.assignee || ''} onChange={event => setDraft({...draft,assignee:event.target.value})} maxLength={120}/></label>}
    <div className="pv-map-actions"><button className="pv-button pv-primary" type="submit">Save marker</button><button className="pv-button" type="button" onClick={onClose}>Cancel</button></div>
  </form></div>;
}

function MapBoard({ propertyId, properties, pins: legacyPins, propAddress, setPropAddress, mapSetups, setMapSetups, routes, setRoutes, layers, pinTypes, defenseRoles }) {
  const property = properties.find(entry => entry.id === propertyId);
  const primaryPropertyId = properties.some(entry => entry.id === 'prop1') ? 'prop1' : properties[0]?.id;
  const config = mapSetups[propertyId];
  const pins = config?.pins || (propertyId === primaryPropertyId ? legacyPins : []);
  const [view, setView] = useState('map');
  const [setup, setSetup] = useState(false);
  const [activeLayers, setActiveLayers] = useState(() => Object.fromEntries(Object.keys(layers).map(key => [key,key !== 'defense'])));
  const [category, setCategory] = useState('buildings');
  const [type, setType] = useState(pinTypes.buildings?.[0]?.v || '');
  const [placing, setPlacing] = useState(null);
  const [cursor, setCursor] = useState({x:50,y:50});
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [removed, setRemoved] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [notice, setNotice] = useState('');
  const mapRef = useRef(null);
  const selected = pins.find(pin => pin.id === selectedId);
  const visiblePins = pins.filter(pin => activeLayers[pin.layer]);
  const pinType = pin => (pinTypes[pin.layer] || []).find(entry => entry.v === pin.type);
  const updatePins = update => setMapSetups(previous => ({ ...previous, [propertyId]: { ...previous[propertyId], pins: update(previous[propertyId]?.pins || []) } }));
  const saveMap = (next, keepMarkers) => {
    setMapSetups(previous => ({ ...previous, [propertyId]: { ...next, pins: keepMarkers ? pins.map(pin => ({...pin})) : [] } }));
    if (propertyId === primaryPropertyId) setPropAddress(next.address);
    setSetup(false); setImageError(false); setPlacing(null); setSelectedId(null); setRemoved(null); setNotice('Map updated. You can now place your markers.');
  };
  const beginPlacement = pin => {
    setActiveLayers(previous => ({...previous,[pin.layer]:true}));
    setPlacing(pin); setCursor(pin.id ? {x:pin.x,y:pin.y} : {x:50,y:50}); setNotice('');
    mapRef.current?.focus();
  };
  const placeAt = point => {
    if (!placing || !point || !config?.image || imageError) return;
    if (placing.id) {
      updatePins(previous => previous.map(pin => pin.id === placing.id ? {...pin,...point} : pin));
      setNotice('Marker moved.');
    } else setEditor({...placing,...point,label:'',notes:'',assignee:''});
    setPlacing(null);
  };
  const saveMarker = pin => {
    const next = {...pin,id:pin.id || crypto.randomUUID()};
    updatePins(previous => pin.id ? previous.map(entry => entry.id === pin.id ? next : entry) : [...previous,next]);
    setEditor(null); setSelectedId(next.id); setNotice('Marker saved.');
  };
  return <div className="pv-property-maps">
    <div className="pv-map-view-switch" aria-label="Map views"><button className={view === 'map' ? 'is-active' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}><Icon name="map" size={16}/> Property map</button><button className={view === 'routes' ? 'is-active' : ''} aria-pressed={view === 'routes'} onClick={() => setView('routes')}><Icon name="arrow" size={16}/> Travel routes <span>{routes.filter(route => route.propertyId === propertyId).length}</span></button></div>
    {view === 'routes' ? <TravelRoutes routes={routes} setRoutes={setRoutes} properties={properties} mapSetups={mapSetups} propertyId={propertyId} propAddress={propAddress}/> : setup ? <MapSetup config={config} address={propertyId === primaryPropertyId ? propAddress : property?.address} propertyName={property?.name || 'Property'} markerCount={pins.length} onSave={saveMap} onClose={() => setSetup(false)}/> : <>
      <div className="pv-map-section-heading"><div><span className="pv-eyebrow">{property?.name || 'YOUR PROPERTY'}</span><h2>{config?.name || 'Your place, mapped.'}</h2><p>{config?.image ? `${config.address || 'Static property map'} · ${pins.length} markers` : 'One clear picture of your property and everything on it.'}</p></div><div className="pv-map-actions">{config?.image && <a className="pv-button" href={config.image.dataUrl} download={`${property?.name || 'property'}-map.jpg`}>Download image</a>}<button className="pv-button pv-primary" onClick={() => setSetup(true)}>{config?.image ? 'Map setup' : 'Set up your map'}</button></div></div>
      {!config?.image ? <div className="pv-map-empty"><span className="pv-map-empty-icon"><Icon name="map" size={36}/></span><h3>Start with a map you know.</h3><p>Find your property in Google Maps, save a screenshot, and add buildings, water sources, trails and other markers to that fixed image.</p><button className="pv-button pv-primary" onClick={() => setSetup(true)}>Set up your map <span aria-hidden="true">→</span></button>{pins.length > 0 && <small>Your {pins.length} existing markers are kept. You can bring them onto your new map during setup.</small>}<button className="pv-map-text-button" onClick={() => setView('routes')}>Plan a travel route instead →</button></div> : <>
        <div className="pv-map-tools"><div className="pv-map-add-marker"><label>Marker category<select value={category} onChange={event => { setCategory(event.target.value); setType(pinTypes[event.target.value]?.[0]?.v || ''); }}>{Object.entries(layers).map(([key,layer]) => <option key={key} value={key}>{layer.label}</option>)}</select></label><label>Marker type<select value={type} onChange={event => setType(event.target.value)}>{(pinTypes[category] || []).map(entry => <option key={entry.v} value={entry.v}>{entry.i} {entry.l}</option>)}</select></label><button className="pv-button pv-primary" disabled={imageError} onClick={() => beginPlacement({layer:category,type})}>Place marker</button></div><div className="pv-map-layer-list" aria-label="Visible map layers">{Object.entries(layers).map(([key,layer]) => <button key={key} aria-pressed={!!activeLayers[key]} className={activeLayers[key] ? 'is-active' : ''} onClick={() => setActiveLayers(previous => ({...previous,[key]:!previous[key]}))}>{layer.icon} {layer.label}<span>{pins.filter(pin => pin.layer === key).length}</span></button>)}</div></div>
        {placing && <div className="pv-map-placement" role="status"><span>{placing.id ? 'Move marker' : `Place ${pinType(placing)?.l || 'marker'}`}: click the map, or use arrow keys and Enter.</span><button className="pv-map-text-button" onClick={() => setPlacing(null)}>Cancel placement</button></div>}
        <div className="pv-map-workspace"><div><div ref={mapRef} className={`pv-static-map ${placing ? 'is-placing' : ''}`} tabIndex={0} role="group" aria-label={placing ? 'Property map: use arrows to position marker, Enter to place, Escape to cancel' : 'Static property map with markers'} style={{aspectRatio:`${config.image.width} / ${config.image.height}`}} onClick={event => placeAt(pointOnMap(event.clientX,event.clientY,event.currentTarget.getBoundingClientRect()))} onKeyDown={event => {
          if (!placing || event.target !== event.currentTarget) return;
          if (event.key === 'Escape') { setPlacing(null); return; }
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); placeAt(cursor); return; }
          const directions = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
          const delta = directions[event.key];
          if (delta) { event.preventDefault(); const step = event.shiftKey ? 5 : 1; setCursor(previous => ({x:Math.max(0,Math.min(100,previous.x+delta[0]*step)),y:Math.max(0,Math.min(100,previous.y+delta[1]*step))})); }
        }}>
          <img src={config.image.dataUrl} alt={`Saved map of ${config.address || property?.name || 'your property'}`} draggable={false} onError={() => setImageError(true)}/>
          {imageError && <div className="pv-map-image-error" role="alert">This saved image could not be loaded. Open Map setup to choose it again.</div>}
          {!imageError && visiblePins.map(pin => <button key={pin.id} className={`pv-map-pin ${selectedId === pin.id ? 'is-selected' : ''}`} aria-label={`Marker: ${pin.label || pinType(pin)?.l || 'Unnamed'}`} aria-pressed={selectedId === pin.id} style={{left:`${pin.x}%`,top:`${pin.y}%`,'--pin-color':layers[pin.layer]?.color || '#214c39'}} onClick={event => { event.stopPropagation(); if (placing) placeAt({x:pin.x,y:pin.y}); else setSelectedId(pin.id); }}><span aria-hidden="true">{pinType(pin)?.i || '📍'}</span><small>{pin.label || pinType(pin)?.l}</small></button>)}
          {placing && <span className="pv-map-cursor" style={{left:`${cursor.x}%`,top:`${cursor.y}%`}} aria-hidden="true">＋</span>}
        </div><p className="pv-map-footnote">Static image · Markers stay anchored as the map resizes · Saved on this device</p></div>
        <aside className="pv-map-marker-panel"><div className="pv-map-panel-title"><h3>{selected ? 'Marker details' : 'On your map'}</h3>{selected && <button className="pv-map-text-button" onClick={() => setSelectedId(null)}>All markers</button>}</div>{selected ? <><div className="pv-map-marker-name"><span>{pinType(selected)?.i || '📍'}</span><h4>{selected.label || pinType(selected)?.l}</h4></div><p>{layers[selected.layer]?.label} · {pinType(selected)?.l}</p>{selected.notes && <p className="pv-map-marker-notes">{selected.notes}</p>}{selected.assignee && <p>Assigned to {selected.assignee}</p>}<div className="pv-map-actions"><button className="pv-button" onClick={() => setEditor({...selected})}>Edit details</button><button className="pv-button" onClick={() => beginPlacement(selected)}>Move marker</button><button className="pv-map-text-button pv-map-danger" onClick={() => { setRemoved({pin:selected,index:pins.findIndex(pin => pin.id === selected.id)}); updatePins(previous => previous.filter(pin => pin.id !== selected.id)); setSelectedId(null); setNotice('Marker removed.'); }}>Remove marker</button></div></> : visiblePins.length ? <div className="pv-map-marker-list">{visiblePins.map(pin => <button key={pin.id} onClick={() => setSelectedId(pin.id)}><span>{pinType(pin)?.i || '📍'}</span><span><strong>{pin.label || pinType(pin)?.l}</strong><small>{layers[pin.layer]?.label}</small></span><span aria-hidden="true">↗</span></button>)}</div> : <p>No visible markers yet. Choose a marker type and place it on your map.</p>}</aside></div>
        {activeLayers.defense && <details className="pv-map-roster"><summary>Defense roster</summary><div>{defenseRoles.map(role => <article key={role.id}><strong>{role.avatar} {role.name}</strong><span>{role.role}</span><small>{role.position} · {role.weapon}</small></article>)}</div></details>}
        {(notice || removed) && <div className="pv-map-notice" role="status"><span>{notice}</span>{removed && <button className="pv-map-text-button" onClick={() => { updatePins(previous => { if (previous.some(pin => pin.id === removed.pin.id)) return previous; const next=[...previous]; next.splice(Math.min(removed.index,next.length),0,removed.pin); return next; }); setRemoved(null); setNotice('Marker restored.'); }}>Undo remove</button>}</div>}
      </>}
    </>}
    {editor && <PinEditor key={editor.id || 'new'} pin={editor} typeLabel={pinType(editor)?.l || 'Marker'} onSave={saveMarker} onClose={() => setEditor(null)}/>}
  </div>;
}

export default function PropertyMapWorkspace({ activePropertyId, properties = [], ...props }) {
  const [chosenProperty, setChosenProperty] = useState('');
  const propertyId = activePropertyId === 'all' ? chosenProperty : activePropertyId || properties[0]?.id;
  const validProperty = properties.some(property => property.id === propertyId);
  return <>{activePropertyId === 'all' && <div className="pv-map-property-choice"><label className="pv-field">Choose a property to map<select value={validProperty ? propertyId : ''} onChange={event => setChosenProperty(event.target.value)}><option value="">Select a property…</option>{properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><p>Each property has its own image, markers and saved travel routes.</p></div>}{validProperty && <MapBoard key={propertyId} propertyId={propertyId} properties={properties} {...props}/>}</>;
}
