import { isLocalEdition } from './runtime-mode.js';
import { useRef, useState } from 'react';
import { captureMapWindow, imageToData, loadImage, normalizeCrop, pointOnMap, prepareMapImage } from './map-images.js';

export default function MapSetup({ config, address, propertyName, markerCount, onSave, onClose }) {
  const [name, setName] = useState(config?.name || `${propertyName} map`);
  const [location, setLocation] = useState(config?.address || address || '');
  const [previewAddress, setPreviewAddress] = useState('');
  const [view, setView] = useState('k');
  const [zoom, setZoom] = useState(18);
  const [image, setImage] = useState(config?.image || null);
  const [keepMarkers, setKeepMarkers] = useState(true);
  const [crop, setCrop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cropping, setCropping] = useState(false);
  const fileRef = useRef(null);
  const cropStart = useRef(null);
  const operation = useRef(0);

  const importImage = async file => {
    const current = ++operation.current;
    setBusy(true); setError('');
    try {
      const next = await prepareMapImage(file);
      if (current === operation.current) { setImage(next); setCrop(null); setCropping(false); }
    } catch (err) { if (current === operation.current) setError(err.message); }
    finally { if (current === operation.current) setBusy(false); }
  };
  const capture = async () => {
    const current = ++operation.current;
    setBusy(true); setError('');
    try {
      const next = await captureMapWindow();
      if (current === operation.current) { setImage(next); setCrop(null); setCropping(false); }
    } catch (err) { if (current === operation.current) setError(err.message); }
    finally { if (current === operation.current) setBusy(false); }
  };
  const handlePaste = event => {
    const file = [...(event.clipboardData?.files || [])].find(entry => entry.type.startsWith('image/'));
    if (file) { event.preventDefault(); importImage(file); }
  };
  const cropPoint = event => pointOnMap(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  const save = async event => {
    event.preventDefault();
    if (!image || busy) return;
    setBusy(true); setError('');
    try {
      const output = crop ? imageToData(await loadImage(image.dataUrl), crop) : image;
      onSave({ name: name.trim() || `${propertyName} map`, address: location.trim(), image: output, savedAt: new Date().toISOString() }, keepMarkers);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return <form className="pv-map-setup" onSubmit={save} onPaste={handlePaste}>
    <div className="pv-map-section-heading"><div><span className="pv-eyebrow">MAP SETUP</span><h2>A familiar place. A clear plan.</h2><p>Save a still map of your property, then mark the things that matter.</p></div><button type="button" className="pv-button" onClick={onClose} disabled={busy}>Cancel setup</button></div>
    <section className="pv-map-step"><span className="pv-map-step-number">1</span><div><h3>Find your area</h3><p>Look up your property in Google Maps and frame the area you want to keep.</p>
      <div className="pv-map-fields"><label className="pv-field">Map name<input value={name} onChange={event => setName(event.target.value)} maxLength={100} required/></label><label className="pv-field">Property address or location<input value={location} onChange={event => setLocation(event.target.value)} placeholder="Address, place, or latitude, longitude" maxLength={300}/></label></div>
      <div className="pv-map-actions">{!isLocalEdition() && <button className="pv-button" type="button" disabled={!location.trim()} onClick={() => setPreviewAddress(location.trim())}>Find in Google Maps</button>}{location.trim() && <a className="pv-map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`} target="_blank" rel="noreferrer">Open Google Maps ↗</a>}</div>
      {isLocalEdition() && <p className="pv-map-hint">This local edition does not load online map previews. Import a saved map image below, or open Google Maps in a separate tab while connected.</p>}
      {!isLocalEdition() && previewAddress && <div className="pv-map-live-preview"><div className="pv-map-actions"><label>View <select aria-label="Google map view" value={view} onChange={event => setView(event.target.value)}><option value="k">Satellite</option><option value="m">Road map</option><option value="p">Terrain</option></select></label><label>Zoom <input aria-label="Google map zoom" type="range" min="12" max="21" value={zoom} onChange={event => setZoom(Number(event.target.value))}/></label></div><iframe title="Google Maps setup preview" src={`https://maps.google.com/maps?q=${encodeURIComponent(previewAddress)}&t=${view}&z=${zoom}&output=embed`} referrerPolicy="no-referrer-when-downgrade" allowFullScreen/><p>Frame the map here or open Google Maps in its own tab. Live maps need an internet connection.</p></div>}
    </div></section>
    <section className="pv-map-step"><span className="pv-map-step-number">2</span><div><h3>Save a static image</h3><p>Take a screenshot of the map, then choose or paste it here. Keep the Google logo and map attribution visible. You can also use a property plan or aerial photo.</p>
      <div className="pv-map-upload" tabIndex={0} aria-label="Paste a map screenshot here" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) importImage(file); }}>
        <div className="pv-map-actions"><button className="pv-button pv-primary" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>{image ? 'Choose another image' : 'Choose map image'}</button>{typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia && <button className="pv-button" type="button" onClick={capture} disabled={busy}>Capture a map window</button>}</div><span>PNG, JPEG or WebP · Drop an image here or paste a screenshot</span>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Map image file" hidden onChange={event => { const file = event.target.files[0]; event.target.value = ''; if (file) importImage(file); }}/>
      </div>
      {busy && <p role="status">Preparing your map…</p>}
      {image && <><div className="pv-map-actions pv-map-crop-tools"><span>{image.width} × {image.height} pixels</span><button type="button" className="pv-map-text-button" onClick={() => { setCropping(!cropping); cropStart.current = null; }}>{cropping ? 'Finish selecting crop' : 'Crop image'}</button>{crop && <button type="button" className="pv-map-text-button" onClick={() => { setCrop(null); setCropping(false); }}>Use full image</button>}</div>{cropping && <p className="pv-map-hint">Drag across the part of the image to keep, including its attribution. Or use the crop fields below.</p>}<div className={`pv-map-crop-preview ${cropping ? 'is-cropping' : ''}`} style={{ aspectRatio: `${image.width} / ${image.height}` }}
        onPointerDown={event => { if (!cropping) return; event.currentTarget.setPointerCapture(event.pointerId); cropStart.current = cropPoint(event); setCrop(null); }}
        onPointerMove={event => { if (cropping && cropStart.current) setCrop(normalizeCrop(cropStart.current, cropPoint(event))); }}
        onPointerUp={event => { if (!cropStart.current) return; const next = normalizeCrop(cropStart.current, cropPoint(event)); cropStart.current = null; if (next.width >= 5 && next.height >= 5) setCrop(next); else setCrop(null); }} onPointerCancel={() => { cropStart.current = null; }}>
        <img src={image.dataUrl} alt="Your static map preview" draggable={false}/>{crop && <div className="pv-map-crop-selection" style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}/>}
      </div>{cropping && <div className="pv-map-crop-inputs">{[['x','Left'],['y','Top'],['width','Width'],['height','Height']].map(([key,label]) => <label key={key}>{label} (%)<input type="number" min={key === 'width' || key === 'height' ? 5 : 0} max="100" value={Math.round((crop || {x:0,y:0,width:100,height:100})[key])} onChange={event => { const next = { ...(crop || {x:0,y:0,width:100,height:100}), [key]: Number(event.target.value) }; next.x = Math.max(0,Math.min(95,next.x)); next.y = Math.max(0,Math.min(95,next.y)); next.width = Math.max(5,Math.min(100-next.x,next.width)); next.height = Math.max(5,Math.min(100-next.y,next.height)); setCrop(next); }}/></label>)}</div>}</>}
    </div></section>
    <section className="pv-map-step"><span className="pv-map-step-number">3</span><div><h3>Make it your working map</h3><p>Markers stay fixed to this image, even when you open it on a different screen size.</p>{markerCount > 0 && <label className="pv-map-checkbox"><input type="checkbox" checked={keepMarkers} onChange={event => setKeepMarkers(event.target.checked)}/>Keep {markerCount} existing markers at their current positions</label>}{markerCount > 0 && <p className="pv-map-hint">If you changed the map area or crop, check each marker after saving. Uncheck to start with a clean map.</p>}<p className="pv-map-hint">Your image, markers and routes are saved on this device and included in complete backups.</p></div></section>
    {error && <p className="pv-map-error" role="alert">{error}</p>}
    <div className="pv-map-actions"><button className="pv-button pv-primary" type="submit" disabled={!image || busy}>Save static map</button><button className="pv-button" type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
  </form>;
}
