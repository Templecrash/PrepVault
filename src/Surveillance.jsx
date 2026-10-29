import { isLocalEdition } from './runtime-mode.js';
import LocalServiceNotice from './LocalServiceNotice.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import TrackingOwnerSignIn from './TrackingOwnerSignIn.jsx';
import { getTrackingOwner, signOutTrackingOwner, OWNER_SIGN_OUT_EVENT } from './tracking-auth.js';
import { ACCOUNT_SESSION_EVENT } from './account-auth-client.js';
import { connectEyezon, connectReveal, disconnectEyezon, disconnectReveal, fetchSurveillancePhoto, getSurveillance } from './surveillance-client.js';
import { useDialogFocus } from './useDialogFocus.js';
import NestConnection from './NestConnection.jsx';
import { getNestDevices } from './nest-client.js';
import { latestCameraPhotos, surveillanceIsStale } from './overview-surveillance.js';
import { ALARM_LABELS, cameraSecurityStatus, alarmSecurityStatus } from './security-status.js';
import './inventory.css';
import './surveillance.css';
import './security.css';

const dateLabel = value => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time not available';
const photoKey = photo => JSON.stringify([photo.cameraId, photo.id]);
const nestReturn = () => { const value = new URLSearchParams(window.location.search).get('security'); return ['nest-connected', 'nest-error'].includes(value) ? value : null; };
const captureLabel = photo => photo.capturedAt ? `Camera time · ${dateLabel(photo.capturedAt)}` : photo.receivedAt ? `Uploaded · ${dateLabel(photo.receivedAt)}` : 'Capture time not available';

function CameraPhoto({ photo, name, onUnauthorized }) {
  const [state, setState] = useState({ url: '', error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    void fetchSurveillancePhoto(photo.cameraId, photo.id, { signal: controller.signal }).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setState({ url: objectUrl, error: '' });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error.status === 401 || error.status === 403) { onUnauthorized(); return; }
      setState({ url: '', error: error.message });
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo.cameraId, photo.id, attempt, onUnauthorized]);
  if (state.error) return <div className="pv-surveillance-photo-placeholder" role="status"><Icon name="camera" size={25} /><span>{state.error}</span><button type="button" onClick={() => { setState({ url: '', error: '' }); setAttempt(value => value + 1); }}>Retry photo</button><a className="pv-surveillance-provider-link" href="https://account.revealcellcam.com/" target="_blank" rel="noreferrer">Open REVEAL<Icon name="arrow" size={12} /></a></div>;
  if (!state.url) return <div className="pv-surveillance-photo-placeholder" role="status"><Icon name="camera" size={25} /><span>Loading photo…</span></div>;
  return <img src={state.url} alt={`${name}, ${captureLabel(photo)}`} onError={() => setState({ url: '', error: 'This photo could not be displayed.' })} />;
}

function PhotoDialog({ photo, camera, onClose, onUnauthorized }) {
  const ref = useDialogFocus(onClose);
  return <div className="pv-modal-backdrop pv-surveillance-backdrop" onClick={onClose}><section ref={ref} className="pv-surveillance-dialog" role="dialog" aria-modal="true" aria-labelledby="surveillance-photo-title" onClick={event => event.stopPropagation()}><header><div><h2 id="surveillance-photo-title">{camera?.name || 'Camera photo'}</h2><p>{captureLabel(photo)}</p></div><button type="button" className="pv-icon-button" onClick={onClose} aria-label="Close photo"><Icon name="close" /></button></header><div className="pv-surveillance-expanded-photo"><CameraPhoto key={photoKey(photo)} photo={photo} name={camera?.name || 'Camera'} onUnauthorized={onUnauthorized} /></div>{camera?.location && <p className="pv-surveillance-photo-location">{camera.location}</p>}</section></div>;
}

function RevealConnection({ reveal, busy, onConnect, onDisconnect }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = event => {
    event.preventDefault();
    if (busy || !reveal?.configured) return;
    const enteredPassword = password;
    setPassword('');
    void onConnect(email, enteredPassword);
  };
  return <section className="pv-surveillance-connection" aria-labelledby="reveal-connection-title"><div className="pv-surveillance-connection-heading"><span className="pv-surveillance-symbol"><Icon name="camera" size={23} /></span><div><h2 id="reveal-connection-title">REVEAL by Tactacam</h2><p>{reveal?.connected ? 'Your camera account is connected.' : 'Connect your camera account to see its latest photos.'}</p></div><span className="pv-surveillance-label">{reveal?.connected ? 'Connected' : 'Not connected'}</span></div>
    {reveal?.connected ? <div className="pv-surveillance-connected"><p>{reveal.accountEmail || 'REVEAL account'}<span>{reveal.error ? 'Camera count unavailable' : `${reveal.cameras.length} ${reveal.cameras.length === 1 ? 'camera' : 'cameras'}`} · Last checked {dateLabel(reveal.checkedAt)}</span></p><button type="button" className="pv-inventory-button pv-inventory-button-secondary" disabled={busy} onClick={onDisconnect}>Disconnect</button></div> : <form className="pv-surveillance-connect-form" onSubmit={submit}>{!reveal?.configured && <p className="pv-surveillance-config-notice" role="status">The REVEAL connection is not available yet. Refresh to check again, or open your REVEAL account below.</p>}<label>REVEAL email<input type="email" autoComplete="username" required maxLength={254} value={email} disabled={busy || !reveal?.configured} onChange={event => setEmail(event.target.value)} /></label><label>REVEAL password<input type="password" autoComplete="current-password" required maxLength={1024} value={password} disabled={busy || !reveal?.configured} onChange={event => setPassword(event.target.value)} /></label><button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={busy || !reveal?.configured}>{busy ? 'Please wait…' : 'Connect REVEAL'}<Icon name="arrow" size={16} /></button><p>Your password is used once to sign in to REVEAL. Your connection stays private to this browser.</p></form>}
    <p className="pv-surveillance-portal"><a className="pv-surveillance-provider-link" href="https://account.revealcellcam.com/" target="_blank" rel="noreferrer">Open REVEAL account<Icon name="arrow" size={13} /></a></p>
  </section>;
}

function EyezonConnection({ eyezon, busy, onConnect, onDisconnect }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = event => {
    event.preventDefault();
    if (busy || !eyezon?.configured) return;
    const enteredPassword = password;
    setPassword('');
    void onConnect(email, enteredPassword);
  };
  return <section className="pv-surveillance-connection" aria-labelledby="eyezon-connection-title">
    <div className="pv-surveillance-connection-heading"><span className="pv-surveillance-symbol"><Icon name="shield" size={23} /></span><div><h2 id="eyezon-connection-title">EyezOn alarm</h2><p>{eyezon?.connected ? 'Your alarm account is connected.' : 'Connect your account to see its reported alarm states.'}</p></div><span className="pv-surveillance-label">{eyezon?.connected ? 'Connected' : 'Not connected'}</span></div>
    {eyezon?.connected ? <div className="pv-surveillance-connected"><p>{eyezon.accountEmail || 'EyezOn account'}<span>{eyezon.error ? 'System count unavailable' : `${eyezon.systems.length} ${eyezon.systems.length === 1 ? 'system' : 'systems'}`} · Last checked {dateLabel(eyezon.checkedAt)}</span></p><button type="button" className="pv-inventory-button pv-inventory-button-secondary" disabled={busy} onClick={onDisconnect}>Disconnect</button></div> : <form className="pv-surveillance-connect-form" onSubmit={submit}>
      {!eyezon?.configured && <p className="pv-surveillance-config-notice" role="status">The EyezOn connection is not available yet. Refresh to check again, or open your EyezOn account below.</p>}
      <label>EyezOn email<input type="email" autoComplete="username" required maxLength={254} value={email} disabled={busy || !eyezon?.configured} onChange={event => setEmail(event.target.value)} /></label>
      <label>EyezOn password<input type="password" autoComplete="current-password" required maxLength={1024} value={password} disabled={busy || !eyezon?.configured} onChange={event => setPassword(event.target.value)} /></label>
      <button type="submit" className="pv-inventory-button pv-inventory-button-primary" disabled={busy || !eyezon?.configured}>{busy ? 'Please wait…' : 'Connect EyezOn'}<Icon name="arrow" size={16} /></button>
      <p>Your password is used once to sign in to EyezOn. Your connection stays private to this browser.</p>
    </form>}
    <p className="pv-surveillance-portal"><a className="pv-surveillance-provider-link" href="https://portal.eyezon.com/app/login.php" target="_blank" rel="noreferrer">Open EyezOn portal<Icon name="arrow" size={13} /></a>{!eyezon?.connected && <span>Opening the EyezOn portal does not connect PrepVault. Use the form above to connect here.</span>}</p>
  </section>;
}

function AlarmSystems({ eyezon, onConnections, now }) {
  const stale = surveillanceIsStale(eyezon, now);
  if (!eyezon?.connected) return <div className="pv-surveillance-empty"><span className="pv-surveillance-symbol"><Icon name="shield" size={30} /></span><h2>Your alarm, at a glance.</h2><p>Connect EyezOn to see the states reported by your alarm systems. Until then, their status is unknown.</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={onConnections}>Connect EyezOn<Icon name="arrow" size={16} /></button></div>;
  return <div className="pv-surveillance-alarm">
    <div className="pv-surveillance-alarm-status"><Icon name="shield" size={28} /><div><h2>Your alarm systems</h2><p>Last checked {dateLabel(eyezon.checkedAt)}{stale ? ' · Information may be out of date' : ' · Refreshes every minute while open'}</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onConnections}>Manage connection</button></div>
    {eyezon.systems.length ? <div className="pv-surveillance-system-list">{eyezon.systems.map(system => <article className="pv-surveillance-system" key={system.id}>
      <header><div><h3>{system.name}</h3><p>{system.model || 'Model not reported'}</p></div><span className={`pv-surveillance-label${system.status === 'alarm' ? ' is-alert' : ''}`}>{ALARM_LABELS[system.status]}</span></header>
      <dl className="pv-surveillance-system-meta"><div><dt>Connection</dt><dd>{system.connection || 'Not reported'}</dd></div><div><dt>Provider update</dt><dd>{system.reportedAt || 'Not reported'}</dd></div></dl>
      {system.partitions.length > 0 && <div className="pv-surveillance-partitions" aria-label={`${system.name} partitions`}>{system.partitions.map(partition => <div key={partition.id}><span>{partition.label}{partition.reportedStatus && <small>Provider state: {partition.reportedStatus}</small>}</span><strong className={partition.status === 'alarm' ? 'is-alert' : undefined}>{ALARM_LABELS[partition.status]}</strong></div>)}</div>}
    </article>)}</div> : <div className="pv-surveillance-empty"><Icon name="shield" size={28} /><h2>{eyezon.error ? 'Alarm information unavailable' : 'No systems reported'}</h2><p>{eyezon.error ? 'The latest system states could not be checked. Refresh or open EyezOn to check your account.' : 'Your EyezOn account is connected, but no systems were returned. Check your account in the EyezOn portal or refresh later.'}</p><a className="pv-surveillance-provider-link" href="https://portal.eyezon.com/app/login.php" target="_blank" rel="noreferrer">Open EyezOn portal<Icon name="arrow" size={13} /></a></div>}
    <p className="pv-surveillance-alarm-note">Read-only monitoring of the states reported by EyezOn, refreshed every minute while this page is open. Individual zone details and alarm controls are not available in this view.</p>
  </div>;
}

function OwnerSurveillance({ owner, onUnauthorized, onSignOut }) {
  const [data, setData] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState('refresh');
  const [error, setError] = useState('');
  const [tab, setTab] = useState(() => nestReturn() ? 'nest' : 'overview');
  const [returnStatus, setReturnStatus] = useState(nestReturn);
  const [nest, setNest] = useState(null);
  const [nestError, setNestError] = useState('');
  const nestPending = useRef(null);
  const nestRevision = useRef(0);
  const returnHandled = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('security');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    setReturnStatus(null);
  }, []);
  const refreshNest = useCallback(async () => {
    nestPending.current?.abort();
    const controller = new AbortController();
    nestPending.current = controller;
    const current = ++nestRevision.current;
    try {
      const result = await getNestDevices({ signal: controller.signal });
      if (controller.signal.aborted || current !== nestRevision.current) return;
      setNest(result); setNestError('');
    } catch (err) {
      if (controller.signal.aborted || current !== nestRevision.current) return;
      if (err.status === 401 || err.status === 403) { setNest(null); onUnauthorized(); return; }
      setNestError(err.message || 'Google Nest status is unavailable.');
      setNest(value => value ? { ...value, error: true } : null);
    }
  }, [onUnauthorized]);
  useEffect(() => {
    if (tab === 'nest') return;
    void refreshNest();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshNest(); }, 60_000);
    return () => { clearInterval(timer); nestRevision.current += 1; nestPending.current?.abort(); };
  }, [refreshNest, tab]);
  const nestChanged = useCallback(value => { setNest(value); setNestError(''); }, []);
  const [cameraId, setCameraId] = useState('all');
  const [limit, setLimit] = useState(12);
  const [expanded, setExpanded] = useState(null);
  const pending = useRef(null);
  const revision = useRef(0);

  const perform = useCallback(async (operation, action) => {
    if (action === 'refresh' && pending.current) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const current = ++revision.current;
    setBusy(action); setError(''); setNow(Date.now());
    try {
      const result = await operation({ signal: controller.signal });
      if (controller.signal.aborted || current !== revision.current) return;
      setData(result);
      return result;
    } catch (err) {
      if (controller.signal.aborted || current !== revision.current) return;
      if (err.status === 401 || err.status === 403) { setData(null); setExpanded(null); onUnauthorized(); return; }
      setError(err.message);
    } finally {
      if (current === revision.current) { pending.current = null; setBusy(''); }
    }
  }, [onUnauthorized]);
  const refresh = useCallback(() => perform(getSurveillance, 'refresh'), [perform]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => { clearInterval(timer); revision.current += 1; pending.current?.abort(); };
  }, [refresh]);

  const reveal = data?.reveal;
  const eyezon = data?.eyezon;
  const cameras = reveal?.cameras || [];
  const photos = (reveal?.photos || []).filter(photo => cameraId === 'all' || photo.cameraId === cameraId).sort((a, b) => (Date.parse(b.receivedAt || b.capturedAt) || 0) - (Date.parse(a.receivedAt || a.capturedAt) || 0));
  const cameraFor = photo => cameras.find(camera => camera.id === photo.cameraId);
  const connect = async (email, password) => {
    const result = await perform(options => connectReveal(email, password, options), 'connect-reveal');
    if (result?.reveal.connected) { setTab('photos'); setCameraId('all'); setLimit(12); }
  };
  const disconnect = async () => {
    setData(current => current ? { ...current, reveal: { ...current.reveal, connected: false, cameras: [], photos: [], checkedAt: null } } : null); setExpanded(null); setCameraId('all');
    await perform(disconnectReveal, 'disconnect-reveal');
  };
  const connectAlarm = async (email, password) => {
    const result = await perform(options => connectEyezon(email, password, options), 'connect-eyezon');
    if (result?.eyezon.connected) setTab('alarm');
  };
  const disconnectAlarm = async () => {
    setData(current => current ? { ...current, eyezon: { ...current.eyezon, connected: false, systems: [], checkedAt: null } } : null);
    await perform(disconnectEyezon, 'disconnect-eyezon');
  };
  const lastChecked = [reveal?.checkedAt, eyezon?.checkedAt].filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const cameraStatus = cameraSecurityStatus(reveal && { ...reveal, error: error || reveal.error }, nest, now);
  const alarmStatus = alarmSecurityStatus(eyezon && { ...eyezon, error: error || eyezon.error }, now);
  const latest = latestCameraPhotos(reveal);
  const serviceErrors = [['REVEAL', reveal?.error, reveal?.checkedAt], ['EyezOn', eyezon?.error, eyezon?.checkedAt]].filter(([, message]) => message);

  return <>
    <div className="pv-surveillance-account"><span><Icon name="shield" size={15} />Only you · {owner.email}</span><span>All connected devices</span><button type="button" onClick={onSignOut}>Sign out</button></div>
    <div className="pv-security-summary" aria-label="Security status">
      {[['camera', 'Cameras', cameraStatus, 'overview'], ['shield', 'Alarm', alarmStatus, 'alarm']].map(([icon, label, status, destination]) => <button type="button" key={label} onClick={() => setTab(destination)}><Icon name={icon} size={22}/><span><small>{label}</small><strong>{!data && busy ? 'Checking…' : status.label}</strong><span>{status.detail}</span></span>{status.attention && <span className="pv-security-attention">Needs attention</span>}<Icon name="arrow" size={17}/></button>)}
    </div>
    <div className="pv-surveillance-workspace"><div className="pv-surveillance-toolbar"><div className="pv-surveillance-tabs" role="tablist" aria-label="Security views">{[['overview', 'Overview'], ['photos', 'Photo history'], ['alarm', 'Alarm'], ['nest', 'Google Nest'], ['connections', 'Connections']].map(([id, label]) => <button key={id} id={`surveillance-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`surveillance-panel-${id}`} onClick={() => setTab(id)}>{label}</button>)}</div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => { void refresh(); if (tab !== 'nest') void refreshNest(); }} disabled={Boolean(busy)}><Icon name="refresh" size={16} />{busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</button></div>
      {error && <div className="pv-surveillance-error" role="alert"><Icon name="bell" size={18} /><div><strong>Security needs attention</strong><p>{error}</p>{lastChecked && <p>Some information may be out of date. Last successful check: {dateLabel(lastChecked)}.</p>}</div></div>}
      {serviceErrors.map(([provider, message, checkedAt]) => <div className="pv-surveillance-error" key={provider} role="alert"><Icon name="bell" size={18} /><div><strong>{provider} needs attention</strong><p>{message}</p>{checkedAt && <p>Last checked {dateLabel(checkedAt)}. Information may be out of date.</p>}</div></div>)}
      {!data && busy === 'refresh' ? <div className="pv-surveillance-empty" role="status"><Icon name="camera" size={30} /><h2>Checking your connections…</h2><p>Loading your camera and alarm connections.</p></div> : <div id={`surveillance-panel-${tab}`} role="tabpanel" aria-labelledby={`surveillance-tab-${tab}`}>
        {tab === 'overview' && <div className="pv-security-home">
          <div className="pv-security-section-heading"><div><h2>Your cameras</h2><p>Latest available photos and device status.{reveal?.checkedAt && ` REVEAL checked ${dateLabel(reveal.checkedAt)}.`}</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setTab('connections')}>Manage connections</button></div>
          {reveal?.connected && surveillanceIsStale({ ...reveal, error: error || reveal.error }, now) && <p className="pv-security-note" role="status">REVEAL status may be out of date. These are the last available photos.</p>}
          {latest.length > 0 && <div className="pv-surveillance-photo-grid">{latest.map(({ camera, photo }) => <article className="pv-surveillance-photo-card" key={camera.id}>
            <div className="pv-surveillance-photo">{photo ? <CameraPhoto key={photoKey(photo)} photo={photo} name={camera.name} onUnauthorized={onUnauthorized}/> : <div className="pv-surveillance-photo-placeholder"><Icon name="camera" size={25}/><span>No photo available</span></div>}</div>
            <div className="pv-surveillance-photo-caption"><div><h2>{camera.name}</h2><p>{camera.status === 'unknown' ? 'Status not reported' : `Reported ${camera.status}`}{camera.batteryPercent !== null && ` · Battery ${camera.batteryPercent}%`}</p><p>{photo ? captureLabel(photo) : 'Waiting for a camera upload'}</p></div>{photo && <button type="button" aria-label={`Open latest photo from ${camera.name}`} onClick={() => setExpanded(photo)}><Icon name="expand" size={18}/></button>}</div>
          </article>)}</div>}
          {nestError && <p className="pv-security-note" role="status">{nestError}</p>}
          {nest?.connected && <div className="pv-security-nest-devices"><h3>Google Nest</h3>{surveillanceIsStale(nest, now) && <p className="pv-security-note">Nest status may be out of date.</p>}{nest.devices.length ? nest.devices.map(device => <button type="button" key={device.id} onClick={() => setTab('nest')}><Icon name="camera" size={20}/><span><strong>{device.name}</strong><small>{device.status === 'unknown' ? 'Status not reported' : `Reported ${device.status}`}{device.room && ` · ${device.room}`}</small></span><span>Open camera <Icon name="arrow" size={14}/></span></button>) : <p>No cameras returned by Google Nest.</p>}</div>}
          {!latest.length && !nest?.connected && <div className="pv-surveillance-empty"><Icon name="camera" size={28}/><h2>{reveal?.connected ? 'No cameras returned' : 'Bring your cameras together.'}</h2><p>Connect REVEAL for recent photos or set up Google Nest for supported live views.</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={() => setTab('connections')}>Connect cameras<Icon name="arrow" size={16}/></button></div>}
          <AlarmSystems eyezon={eyezon} now={now} onConnections={() => setTab('connections')}/>
        </div>}
        {tab === 'nest' && <NestConnection initialData={nest} onUnauthorized={onUnauthorized} onStateChange={nestChanged} returnStatus={returnStatus} onReturnHandled={returnHandled}/>}
        {tab === 'photos' && (reveal?.connected ? <><div className="pv-surveillance-filter"><label>Camera<select value={cameraId} onChange={event => { setCameraId(event.target.value); setLimit(12); }}><option value="all">All cameras</option>{cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select></label><p><strong>{photos.length}</strong> recent {photos.length === 1 ? 'photo' : 'photos'}<span>Photos appear after your cameras upload them.{reveal.hasMore && ` Showing up to ${reveal.limit} recent photos.`}</span>{reveal.hasMore && <a className="pv-surveillance-provider-link" href="https://account.revealcellcam.com/" target="_blank" rel="noreferrer">More photos in REVEAL<Icon name="arrow" size={12} /></a>}</p></div>{photos.length ? <><div className="pv-surveillance-photo-grid">{photos.slice(0, limit).map(photo => { const camera = cameraFor(photo); return <article className="pv-surveillance-photo-card" key={photoKey(photo)}><div className="pv-surveillance-photo"><CameraPhoto key={photoKey(photo)} photo={photo} name={camera?.name || 'Camera'} onUnauthorized={onUnauthorized} /></div><div className="pv-surveillance-photo-caption"><div><h2>{camera?.name || 'Camera'}</h2><p>{captureLabel(photo)}</p></div><button type="button" aria-label={`Open photo from ${camera?.name || 'camera'} taken ${dateLabel(photo.capturedAt)}`} onClick={() => setExpanded(photo)}><Icon name="expand" size={18} /></button></div></article>; })}</div>{photos.length > limit && <div className="pv-surveillance-more"><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setLimit(value => value + 12)}>Show more photos</button></div>}</> : <div className="pv-surveillance-empty"><Icon name="camera" size={30} /><h2>{reveal.error ? 'Photos unavailable' : 'No recent photos'}</h2><p>{reveal.error ? 'The latest photos could not be checked. Refresh or open your REVEAL account.' : cameraId === 'all' ? 'Your account is connected. Photos will appear here after a camera captures and uploads them.' : 'This camera has no photos in the current feed. Try another camera or refresh later.'}</p></div>}{cameras.length > 0 && <details className="pv-surveillance-devices"><summary>Camera details <span>{cameras.length} devices<Icon name="chevron" size={15} /></span></summary><div className="pv-surveillance-camera-list">{cameras.map(camera => <div key={camera.id}><span><strong>{camera.name}</strong><small>{[camera.model, camera.location].filter(Boolean).join(' · ') || 'No additional details'}</small></span><span>Status<strong>{camera.status === 'unknown' ? 'Not reported' : camera.status}</strong></span><span>Battery<strong>{camera.batteryPercent === null ? 'Not reported' : `${camera.batteryPercent}%`}</strong></span><span>Signal<strong>{camera.signalLabel || (camera.signalPercent === null ? 'Not reported' : `${camera.signalPercent}%`)}</strong></span></div>)}</div></details>}</> : <div className="pv-surveillance-empty"><span className="pv-surveillance-symbol"><Icon name="camera" size={30} /></span><h2>Your cameras, in one place.</h2><p>Connect REVEAL to see recent camera photos in your private workspace.</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={() => setTab('connections')}>Connect cameras<Icon name="arrow" size={16} /></button></div>)}
        {tab === 'alarm' && <AlarmSystems eyezon={eyezon} now={now} onConnections={() => setTab('connections')} />}
        {tab === 'connections' && <div className="pv-surveillance-connections"><RevealConnection reveal={reveal} busy={Boolean(busy)} onConnect={connect} onDisconnect={disconnect} /><EyezonConnection eyezon={eyezon} busy={Boolean(busy)} onConnect={connectAlarm} onDisconnect={disconnectAlarm} />
          <section className="pv-surveillance-connection"><div className="pv-surveillance-connection-heading"><span className="pv-surveillance-symbol"><Icon name="camera" size={23}/></span><div><h2>Google Nest</h2><p>Connect supported cameras through your Google account.</p></div><span className="pv-surveillance-label">{nest?.connected ? 'Connected' : nest?.configured ? 'Not connected' : 'Setup required'}</span></div><div className="pv-surveillance-bridge"><p>Google requires a Device Access project. Once configured, you can authorize access here and view supported live cameras.</p><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setTab('nest')}>{nest?.connected ? 'Manage Nest cameras' : 'Set up Google Nest'}<Icon name="arrow" size={16}/></button></div></section>
          <section className="pv-surveillance-connection"><div className="pv-surveillance-connection-heading"><span className="pv-surveillance-symbol"><Icon name="shield" size={23}/></span><div><h2>Alarm.com</h2><p>Sign in to your provider’s official dashboard.</p></div><span className="pv-surveillance-label">External dashboard</span></div><div className="pv-surveillance-bridge"><p>Use Alarm.com to view its cameras and alarm status. Signing in there does not import them here. An in-app connection requires approved access from Alarm.com or your alarm provider.</p><a className="pv-inventory-button pv-inventory-button-secondary" href="https://www.alarm.com/login" target="_blank" rel="noreferrer">Sign in to Alarm.com<Icon name="arrow" size={16}/></a></div></section>
        </div>}
      </div>}
      <footer className="pv-surveillance-footer"><Icon name="shield" size={15} /><span>Photos and connection details are available only to your owner account. This view covers all connected devices, regardless of the property selected above.</span></footer>
    </div>
    {expanded && <PhotoDialog photo={expanded} camera={cameraFor(expanded)} onClose={() => setExpanded(null)} onUnauthorized={onUnauthorized} />}
  </>;
}

function SurveillanceOnline() {
  const [auth, setAuth] = useState({ phase: 'checking', owner: null, message: '' });
  const pending = useRef(null);
  const revision = useRef(0);
  const expire = useCallback(() => {
    pending.current?.abort(); revision.current += 1;
    setAuth({ phase: 'signed-out', owner: null, message: 'Your private session ended. Sign in again to view Security.' });
  }, []);
  const checkSession = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const current = ++revision.current;
    try {
      const owner = await getTrackingOwner({ signal: controller.signal });
      if (controller.signal.aborted || current !== revision.current) return;
      setAuth({ phase: owner ? 'signed-in' : 'signed-out', owner, message: '' });
    } catch (error) {
      if (controller.signal.aborted || current !== revision.current) return;
      if (error.status === 401 || error.status === 403) { expire(); return; }
      setAuth({ phase: 'unavailable', owner: null, message: error.message });
    }
  }, [expire]);
  useEffect(() => { const timer = setTimeout(() => { void checkSession(); }, 0); return () => { clearTimeout(timer); pending.current?.abort(); revision.current += 1; }; }, [checkSession]);
  useEffect(() => {
    const accountChanged = () => {
      setAuth({ phase: 'checking', owner: null, message: '' });
      void checkSession();
    };
    window.addEventListener(OWNER_SIGN_OUT_EVENT, expire);
    window.addEventListener(ACCOUNT_SESSION_EVENT, accountChanged);
    return () => {
      window.removeEventListener(OWNER_SIGN_OUT_EVENT, expire);
      window.removeEventListener(ACCOUNT_SESSION_EVENT, accountChanged);
    };
  }, [checkSession, expire]);
  useEffect(() => {
    const revalidate = () => { if (auth.phase === 'signed-in' && document.visibilityState === 'visible') { setAuth({ phase: 'checking', owner: null, message: '' }); void checkSession(); } };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => { window.removeEventListener('focus', revalidate); document.removeEventListener('visibilitychange', revalidate); };
  }, [auth.phase, checkSession]);
  const signOut = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const current = ++revision.current;
    setAuth({ phase: 'signing-out', owner: null, message: '' });
    try {
      await signOutTrackingOwner({ signal: controller.signal });
      if (!controller.signal.aborted && current === revision.current) setAuth({ phase: 'signed-out', owner: null, message: 'You are signed out of your private workspace.' });
    } catch (error) {
      if (!controller.signal.aborted && current === revision.current) setAuth({ phase: 'signout-failed', owner: null, message: error.message });
    }
  };
  return <section className="pv-inventory pv-surveillance" aria-labelledby="surveillance-title"><header className="pv-inventory-heading"><div><p className="pv-inventory-eyebrow">KEEP AN EYE ON HOME</p><h1 id="surveillance-title">Security<span>.</span></h1><p className="pv-inventory-intro">Camera photos and alarm monitoring, in your private workspace.</p></div></header>
    {auth.phase === 'signed-in' ? <OwnerSurveillance key={auth.owner.id} owner={auth.owner} onUnauthorized={expire} onSignOut={signOut} /> : ['checking', 'signing-out'].includes(auth.phase) ? <div className="pv-surveillance-session" role="status"><Icon name="shield" size={24} />{auth.phase === 'checking' ? 'Checking your private session…' : 'Signing out…'}</div> : ['unavailable', 'signout-failed'].includes(auth.phase) ? <div className="pv-surveillance-session" role="alert"><Icon name="shield" size={24} /><div><strong>{auth.phase === 'signout-failed' ? 'Sign-out has not completed' : 'Your private connection is unavailable'}</strong><p>{auth.message}</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={auth.phase === 'signout-failed' ? signOut : checkSession}>Try again</button></div> : <TrackingOwnerSignIn onSignedIn={checkSession} notice={auth.message} description="Sign in to see your camera photos and manage your security connections." detail="Only your owner account can open this view or access its photos." buttonLabel="Open Security" />}
  </section>;
}

export default function Surveillance(props) {
  return isLocalEdition() ? <LocalServiceNotice title="Security needs the live site." path="/">Camera photos and alarm monitoring require the hosted service and your connected provider accounts. Their credentials and feeds are not included in this download.</LocalServiceNotice> : <SurveillanceOnline {...props} />;
}
