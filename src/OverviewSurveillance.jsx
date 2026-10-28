import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { isLocalEdition, LIVE_APP_URL } from './runtime-mode.js';
import { getTrackingOwner, OWNER_SIGN_OUT_EVENT } from './tracking-auth.js';
import { ACCOUNT_SESSION_EVENT } from './account-auth-client.js';
import { fetchSurveillancePhoto, getSurveillance } from './surveillance-client.js';
import { createOverviewSurveillanceLoader, latestCameraPhotos, surveillanceIsStale } from './overview-surveillance.js';
import './overview-surveillance.css';

const ALARM_LABELS = { armed_away: 'Armed · Away', armed_stay: 'Armed · Stay', disarmed: 'Disarmed', ready: 'Ready', not_ready: 'Not ready', entry_delay: 'Entry delay', exit_delay: 'Exit delay', mixed: 'Mixed states', alarm: 'Alarm reported', unknown: 'Unknown' };
const dateLabel = value => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not reported';
const photoLabel = photo => photo?.capturedAt ? `Camera time · ${dateLabel(photo.capturedAt)}` : photo?.receivedAt ? `Uploaded · ${dateLabel(photo.receivedAt)}` : 'Image time not reported';

function CameraPreview({ photo, name, onUnauthorized }) {
  const frame = useRef(null);
  const [state, setState] = useState({ url: '', error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    let started = false;
    const load = async () => {
      if (started || controller.signal.aborted) return;
      started = true;
      if (navigator.onLine === false) { setState({ url: '', error: 'Offline · image unavailable' }); return; }
      try {
        const blob = await fetchSurveillancePhoto(photo.cameraId, photo.id, { signal: controller.signal });
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setState({ url, error: '' });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error.status === 401 || error.status === 403) { onUnauthorized(); return; }
        setState({ url: '', error: error.message || 'Image unavailable' });
      }
    };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: '120px' }) : null;
    if (observer && frame.current) observer.observe(frame.current);
    else void load();
    const offline = () => { controller.abort(); if (!url) setState({ url: '', error: 'Offline · image unavailable' }); };
    window.addEventListener('offline', offline);
    return () => { controller.abort(); observer?.disconnect(); window.removeEventListener('offline', offline); if (url) URL.revokeObjectURL(url); };
  }, [photo.cameraId, photo.id, onUnauthorized, attempt]);
  return <div className="pv-overview-camera-image" ref={frame}>
    {state.url ? <img src={state.url} alt={`Latest available image from ${name}. ${photoLabel(photo)}`} onError={() => setState({ url: '', error: 'This image could not be displayed.' })}/> : <div className="pv-overview-camera-placeholder"><Icon name="camera" size={25}/><span>{state.error || 'Loading camera image…'}</span>{state.error && <button type="button" onClick={() => { setState({ url: '', error: '' }); setAttempt(value => value + 1); }}>Retry image</button>}</div>}
  </div>;
}

function CameraSummary({ reveal, onOpen, onUnauthorized, stale }) {
  const cameras = latestCameraPhotos(reveal);
  if (!reveal?.connected) return <div className="pv-overview-security-empty"><Icon name="camera" size={25}/><h3>REVEAL cameras</h3><p>{reveal?.configured === false ? 'The camera connection is not configured yet.' : 'Connect your REVEAL account to see the latest image from each camera here.'}</p><button type="button" className="pv-text-link" onClick={onOpen}>Connect cameras<Icon name="arrow" size={14}/></button></div>;
  return <div className="pv-overview-cameras"><header><div><h3>REVEAL cameras</h3><p>{cameras.length} connected {cameras.length === 1 ? 'camera' : 'cameras'} · {stale ? 'Last available images' : 'Latest available images'}</p></div><Icon name="camera" size={20}/></header>
    {reveal.error && <p className="pv-overview-security-note" role="status">{reveal.error}</p>}
    {cameras.length ? <div className="pv-overview-camera-strip" tabIndex={0} aria-label="Latest image from each connected camera">{cameras.map(({ camera, photo }) => <article className="pv-overview-camera-card" key={camera.id}>
      {photo ? <CameraPreview key={`${photo.cameraId}:${photo.id}`} photo={photo} name={camera.name} onUnauthorized={onUnauthorized}/> : <div className="pv-overview-camera-image"><div className="pv-overview-camera-placeholder"><Icon name="camera" size={25}/><span>No image in the current feed</span></div></div>}
      <div className="pv-overview-camera-caption"><h4>{camera.name}</h4><p>{photo ? photoLabel(photo) : 'Open Surveillance to check this camera.'}</p>{camera.status === 'offline' && <span>Camera reported offline</span>}</div>
    </article>)}</div> : <p className="pv-overview-security-note">{reveal.error ? 'Camera images could not be checked.' : 'No cameras were returned by REVEAL.'}</p>}
    <p className="pv-overview-security-timestamp">Checked {dateLabel(reveal.checkedAt)}{stale ? ' · Information may be out of date' : ''}</p>
  </div>;
}

function AlarmSummary({ eyezon, onOpen, stale }) {
  if (!eyezon?.connected) return <div className="pv-overview-security-empty"><Icon name="shield" size={25}/><h3>EyezOn alarm</h3><p>{eyezon?.configured === false ? 'The alarm connection is not configured yet.' : 'Connect EyezOn to see the status reported by your alarm system.'}</p><button type="button" className="pv-text-link" onClick={onOpen}>Connect alarm<Icon name="arrow" size={14}/></button></div>;
  return <div className="pv-overview-alarm"><header><div><h3>EyezOn alarm</h3><p>{stale ? 'Last reported states · not current' : 'Status reported by EyezOn'}</p></div><Icon name="shield" size={20}/></header>
    {eyezon.error && <p className="pv-overview-security-note" role="status">{eyezon.error}</p>}
    {eyezon.systems?.length ? <div className="pv-overview-alarm-list">{eyezon.systems.map(system => <article key={system.id}><div><h4>{system.name}</h4><strong className={system.status === 'alarm' ? 'is-alarm' : undefined}>{ALARM_LABELS[system.status] || 'Unknown'}</strong></div>{system.connection && <p>{system.connection}</p>}{system.partitions?.length > 1 && <p>{system.partitions.map(partition => `${partition.label}: ${ALARM_LABELS[partition.status] || 'Unknown'}`).join(' · ')}</p>}{system.reportedAt && <p>Provider update: {system.reportedAt}</p>}</article>)}</div> : <p className="pv-overview-security-note">{eyezon.error ? 'Alarm status is unavailable.' : 'No alarm systems were returned.'}</p>}
    <p className="pv-overview-security-timestamp">Checked {dateLabel(eyezon.checkedAt)}{stale ? ' · Refresh before relying on this status' : ''}</p>
  </div>;
}

function OverviewSurveillanceOnline({ onOpen }) {
  const [state, setState] = useState({ phase: 'checking', ownerId: null, data: null, error: '', busy: false });
  const loader = useRef(null);
  const expire = useCallback(() => loader.current?.clear('signed-out', 'Sign in to view your private camera and alarm overview.'), []);
  useEffect(() => {
    const connection = createOverviewSurveillanceLoader({ getOwner: getTrackingOwner, getFeed: getSurveillance, onChange: setState });
    loader.current = connection;
    const refresh = (reset = false) => {
      if (document.visibilityState !== 'visible') return;
      if (navigator.onLine === false) connection.offline();
      else void connection.refresh({ reset });
    };
    const visibility = () => { if (document.visibilityState === 'visible') refresh(true); else connection.clear('paused'); };
    const accountChanged = () => { connection.clear('checking'); refresh(true); };
    const signedOut = () => connection.clear('signed-out');
    const offline = () => connection.offline();
    const online = () => refresh(true);
    const focus = () => refresh(true);
    const start = setTimeout(() => refresh(), 0);
    const interval = setInterval(() => refresh(), 60_000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener(OWNER_SIGN_OUT_EVENT, signedOut);
    window.addEventListener(ACCOUNT_SESSION_EVENT, accountChanged);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('focus', focus);
    return () => {
      clearTimeout(start); clearInterval(interval); connection.destroy(); loader.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener(OWNER_SIGN_OUT_EVENT, signedOut);
      window.removeEventListener(ACCOUNT_SESSION_EVENT, accountChanged);
      window.removeEventListener('offline', offline); window.removeEventListener('online', online); window.removeEventListener('focus', focus);
    };
  }, []);
  const outdated = state.phase === 'offline' || Boolean(state.error);
  const refresh = () => void loader.current?.refresh();
  return <section className="pv-overview-surveillance" aria-labelledby="overview-surveillance-title">
    <div className="pv-section-heading"><div><h2 id="overview-surveillance-title">A look at home</h2><p>Your latest camera images and alarm status.</p></div><div className="pv-overview-security-actions">{state.ownerId && <button type="button" className="pv-text-link" onClick={refresh} disabled={state.busy || state.phase === 'offline'}><Icon name="refresh" size={15}/>{state.busy ? 'Refreshing…' : 'Refresh'}</button>}<button type="button" className="pv-text-link" onClick={onOpen}>Surveillance<Icon name="arrow" size={15}/></button></div></div>
    {state.error && <p className="pv-overview-security-message" role="status">{state.error}{state.data ? ' Showing the last available information.' : ''}</p>}
    {state.data && state.ownerId ? <div className="pv-overview-security-grid" key={state.ownerId}><CameraSummary reveal={state.data.reveal} onOpen={onOpen} onUnauthorized={expire} stale={outdated || surveillanceIsStale(state.data.reveal)}/><AlarmSummary eyezon={state.data.eyezon} onOpen={onOpen} stale={outdated || surveillanceIsStale(state.data.eyezon)}/></div> : <div className="pv-overview-security-locked"><span><Icon name="shield" size={24}/></span><div><h3>{state.phase === 'checking' ? 'Checking your private connection…' : state.phase === 'offline' ? 'Connect to check your property.' : state.phase === 'unavailable' ? 'Your private connection is unavailable.' : 'Your cameras and alarm, privately.'}</h3><p>{state.phase === 'checking' ? 'Verifying owner access before loading any camera or alarm information.' : 'Open Surveillance to sign in and connect REVEAL and EyezOn. These feeds are visible only to your owner account.'}</p></div><button type="button" className="pv-overview-button pv-button-outline" onClick={state.phase === 'unavailable' ? refresh : onOpen}>{state.phase === 'unavailable' ? 'Try again' : 'Open Surveillance'}<Icon name="arrow" size={15}/></button></div>}
    <p className="pv-overview-security-foot"><Icon name="lock" size={13}/>{state.ownerId ? 'Owner only · all connected devices, regardless of selected property. Refreshes every minute while Overview is visible.' : 'Owner sign-in is required. Camera photos and alarm status are not part of your plan backups.'}</p>
  </section>;
}

export default function OverviewSurveillance({ onOpen }) {
  if (isLocalEdition()) return <section className="pv-overview-surveillance" aria-labelledby="overview-surveillance-title"><div className="pv-section-heading"><div><h2 id="overview-surveillance-title">A look at home</h2><p>Camera images and alarm status use your private online connections.</p></div></div><div className="pv-overview-security-locked"><span><Icon name="camera" size={24}/></span><div><h3>Live surveillance is on the website.</h3><p>Your local copy does not connect to REVEAL or EyezOn. Open the live site to use your owner sign-in and view these feeds.</p></div><a className="pv-overview-button pv-button-outline" href={LIVE_APP_URL} target="_blank" rel="noreferrer">Open live PrepVault<Icon name="arrow" size={15}/></a></div></section>;
  return <OverviewSurveillanceOnline onOpen={onOpen}/>;
}
