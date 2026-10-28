import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus.js';
import { cameraErrorMessage, createScannedInventoryProduct, lookupBarcodeProduct, validateBarcode } from './barcode.js';
import { createBarcodeDecoder, decodeBarcodeImage } from './barcode-decoder.js';
import './barcode-scanner.css';

export default function BarcodeScanner({ categories, items = [], initialCategory = 'food', onScan, onClose }) {
  const dialogRef = useDialogFocus(onClose);
  const videoRef = useRef(null);
  const photoRef = useRef(null);
  const nameRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const cameraRunRef = useRef(0);
  const requestRef = useRef(null);
  const aliveRef = useRef(true);
  const acceptedRef = useRef(false);
  const onCodeRef = useRef(null);
  const submittedRef = useRef(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraState, setCameraState] = useState('starting');
  const [cameraError, setCameraError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [lookupState, setLookupState] = useState('idle');
  const [lookupNote, setLookupNote] = useState('');
  const [draft, setDraft] = useState(null);
  const [saveError, setSaveError] = useState('');

  const stopCamera = useCallback(() => {
    cameraRunRef.current += 1;
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const handleCode = useCallback(async (raw, format) => {
    if (acceptedRef.current) return;
    const checked = validateBarcode(raw, format);
    if (!checked.valid) { setCodeError(checked.error); return; }
    acceptedRef.current = true;
    stopCamera();
    setCameraState('stopped');
    setCodeError('');
    setSaveError('');
    setManualCode(checked.code);
    setLookupState('loading');
    setLookupNote('Looking up this product…');
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const category = categories[initialCategory] ? initialCategory : Object.keys(categories)[0];
    const base = { barcode: checked.lookupCode, name: '', category, subType: '', quantity: '1', location: '', expiryDate: '', fields: {} };
    // The form is immediately available even while the public service responds.
    setDraft(base);
    try {
      const product = await lookupBarcodeProduct(checked.code, { items, signal: controller.signal, format });
      if (!aliveRef.current || controller.signal.aborted) return;
      if (product) {
        const productCategory = categories[product.category] ? product.category : category;
        const productSubType = categories[productCategory]?.subTypes[product.subType] ? product.subType : '';
        setDraft({ ...base, ...product, category: productCategory, subType: productSubType, quantity: '1' });
        setLookupNote(product.source === 'inventory' ? 'Found in your inventory. Enter the quantity for this new batch.' : `Product found on Open Food Facts${product.packageSize ? ` · ${product.packageSize}` : ''}. Check the details before adding.`);
      } else setLookupNote('Product not found. Give it a name and choose its type to save this barcode for next time.');
      setLookupState('ready');
    } catch (error) {
      if (!aliveRef.current || controller.signal.aborted) return;
      setLookupState('ready');
      setLookupNote(error.message || 'Product lookup is unavailable. Enter the details below.');
    }
  }, [categories, initialCategory, items, stopCamera]);

  useEffect(() => { onCodeRef.current = handleCode; }, [handleCode]);
  useEffect(() => { if (lookupState === 'ready') nameRef.current?.focus(); }, [lookupState]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const run = cameraRunRef.current;
    setCameraError('');
    setCameraState('starting');
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable');
      setCameraError('Live scanning requires HTTPS and a camera. Use a barcode photo or type the digits below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (!aliveRef.current || run !== cameraRunRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      const decoder = await createBarcodeDecoder();
      if (!aliveRef.current || run !== cameraRunRef.current) return;
      setCameraState('scanning');
      let failures = 0;
      const frame = async () => {
        if (!aliveRef.current || run !== cameraRunRef.current) return;
        if (video.readyState >= 2) {
          try {
            const results = await decoder.decode(video);
            if (!aliveRef.current || run !== cameraRunRef.current) return;
            const result = results.find(value => validateBarcode(value.rawValue, value.format).valid);
            if (result) { onCodeRef.current?.(result.rawValue, result.format); return; }
            failures = 0;
          } catch {
            failures += 1;
            if (failures >= 5) {
              stopCamera(); setCameraState('unavailable');
              setCameraError('This camera could not read frames. Try a clear barcode photo or type the digits below.');
              return;
            }
          }
        }
        if (aliveRef.current && run === cameraRunRef.current) timerRef.current = setTimeout(frame, 250);
      };
      frame();
    } catch (error) {
      if (!aliveRef.current || run !== cameraRunRef.current) return;
      stopCamera(); setCameraState('unavailable'); setCameraError(cameraErrorMessage(error));
    }
  }, [stopCamera]);

  useEffect(() => {
    aliveRef.current = true;
    const timer = setTimeout(() => { if (aliveRef.current) startCamera(); }, 0);
    return () => { aliveRef.current = false; clearTimeout(timer); stopCamera(); requestRef.current?.abort(); };
  }, [startCamera, stopCamera]);

  const reset = () => {
    requestRef.current?.abort();
    acceptedRef.current = false; submittedRef.current = false;
    setDraft(null); setLookupState('idle'); setLookupNote(''); setCodeError(''); setSaveError(''); setManualCode('');
    startCamera();
  };

  const readPhoto = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { setCodeError('Choose a barcode photo smaller than 15 MB.'); return; }
    stopCamera(); setCameraState('photo'); setCodeError('');
    const run = cameraRunRef.current;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const results = await decodeBarcodeImage(image);
      if (!aliveRef.current || run !== cameraRunRef.current || acceptedRef.current) return;
      const result = results.find(value => validateBarcode(value.rawValue, value.format).valid);
      if (result) await handleCode(result.rawValue, result.format);
      else { setCameraState('stopped'); setCodeError('No readable product barcode found. Try a sharp, well-lit photo with the whole barcode, or type the digits.'); }
    } catch {
      if (aliveRef.current && run === cameraRunRef.current) { setCameraState('stopped'); setCodeError('This photo could not be read. Try a JPG or PNG with the full barcode, or type the digits.'); }
    } finally { URL.revokeObjectURL(url); }
  };

  const save = event => {
    event.preventDefault();
    if (submittedRef.current || !draft || lookupState === 'loading') return;
    try {
      const product = createScannedInventoryProduct(draft, categories);
      submittedRef.current = true;
      onScan(product);
    } catch (error) { submittedRef.current = false; setSaveError(error.message); }
  };
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const subType = draft ? categories[draft.category]?.subTypes[draft.subType] : null;

  return <div className="barcode-backdrop" onClick={onClose}>
    <section ref={dialogRef} className="barcode-dialog" role="dialog" aria-modal="true" aria-labelledby="barcode-title" onClick={event => event.stopPropagation()}>
      <header><div><p className="barcode-eyebrow">Quick inventory entry</p><h2 id="barcode-title">Scan a barcode</h2></div><button type="button" className="barcode-close" aria-label="Close barcode scanner" onClick={onClose}>×</button></header>
      {!draft && <>
        <div className="barcode-camera">
          <video ref={videoRef} muted playsInline aria-label="Barcode camera preview" />
          <div className="barcode-target" aria-hidden="true" />
          <span className="barcode-camera-status">{cameraState === 'scanning' ? 'Hold the barcode steady inside the frame' : cameraState === 'starting' ? 'Starting camera…' : cameraState === 'photo' ? 'Reading photo…' : 'Use a photo or enter the barcode below'}</span>
        </div>
        {cameraError && <p className="barcode-notice" role="status">{cameraError}</p>}
        <div className="barcode-capture-actions">
          <button type="button" onClick={startCamera} disabled={cameraState === 'starting' || cameraState === 'scanning' || cameraState === 'photo'}>Retry camera</button>
          <button type="button" onClick={() => photoRef.current?.click()} disabled={cameraState === 'photo'}>Use barcode photo</button>
        </div>
        <form className="barcode-manual" onSubmit={event => { event.preventDefault(); handleCode(manualCode); }}>
          <label htmlFor="barcode-digits">Or enter the barcode digits</label>
          <div><input id="barcode-digits" value={manualCode} onChange={event => { setManualCode(event.target.value); setCodeError(''); }} inputMode="numeric" autoComplete="off" placeholder="UPC / EAN / GTIN" aria-describedby={codeError ? 'barcode-code-error' : undefined} aria-invalid={Boolean(codeError)} /><button type="submit" disabled={!manualCode.trim() || cameraState === 'photo'}>Look up</button></div>
        </form>
        {codeError && <p id="barcode-code-error" className="barcode-error" role="alert">{codeError}</p>}
        <p className="barcode-footnote">Food products are looked up on <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>. Only the barcode is sent. Photos stay on this device.</p>
        <input ref={photoRef} type="file" accept="image/*" onChange={readPhoto} hidden aria-label="Barcode photo" />
      </>}
      {draft && <>
        <p className="barcode-result-code">Barcode {draft.barcode}<button type="button" onClick={reset}>Scan another</button></p>
        <p className="barcode-notice" role="status">{lookupNote}</p>
        {lookupState === 'loading' && <button type="button" className="barcode-skip" onClick={() => { requestRef.current?.abort(); setLookupState('ready'); setLookupNote('Enter the item details to save this barcode for next time.'); }}>Enter details now</button>}
        <form onSubmit={save}>
          <fieldset disabled={lookupState === 'loading'}>
            <label htmlFor="barcode-name">Item name<input ref={nameRef} id="barcode-name" required maxLength={280} value={draft.name} onChange={event => update('name', event.target.value)} placeholder="e.g. Canned black beans" /></label>
            <div className="barcode-form-grid">
              <label htmlFor="barcode-category">Category<select id="barcode-category" value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value, subType: '', fields: {} }))}>{Object.entries(categories).map(([key, category]) => <option key={key} value={key}>{category.label}</option>)}</select></label>
              <label htmlFor="barcode-type">Item type<select id="barcode-type" required value={draft.subType} onChange={event => setDraft(current => ({ ...current, subType: event.target.value, fields: {} }))}><option value="">Choose type…</option>{Object.entries(categories[draft.category]?.subTypes || {}).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
              <label htmlFor="barcode-quantity">Quantity{subType?.unit ? ` (${subType.unit})` : ''}<input id="barcode-quantity" required type="number" min="0.001" step="any" inputMode="decimal" value={draft.quantity} onChange={event => update('quantity', event.target.value)} /></label>
              <label htmlFor="barcode-expiry">Expiry / best before <span>(optional)</span><input id="barcode-expiry" type="date" value={draft.expiryDate} onInput={event => update('expiryDate', event.target.value)} onChange={event => update('expiryDate', event.target.value)} /></label>
            </div>
            <label htmlFor="barcode-location">Storage location <span>(optional)</span><input id="barcode-location" value={draft.location} onChange={event => update('location', event.target.value)} placeholder="e.g. Basement shelf" maxLength={200} /></label>
            {subType && <p className="barcode-footnote">Enter the amount you are adding in {subType.unit || 'units'}. The package size may contain more than one unit.</p>}
            {draft.category === 'food' && <p className="barcode-footnote">You can add calories and servings from the label when editing the saved item.</p>}
            {saveError && <p className="barcode-error" role="alert">{saveError}</p>}
            <button className="barcode-save" type="submit">Add to inventory</button>
          </fieldset>
        </form>
      </>}
    </section>
  </div>;
}
