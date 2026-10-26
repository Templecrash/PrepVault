import { useEffect, useRef, useState } from 'react';
import { Brand, Icon } from './brand.jsx';
import { trackingRequest } from './tracking.js';
import { createLocationPublisher } from './location-publisher.js';
import './location-sharing.css';

const TAB_KEY = 'pv-location-sharing';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACTIVE_PHASES = ['locating', 'connecting', 'sharing'];
const ENDED_PHASES = ['stopped', 'expired', 'ended'];

function storeCredential(value) {
  try {
    if (value) sessionStorage.setItem(TAB_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(TAB_KEY);
  } catch { /* Sharing still works in memory when tab storage is unavailable. */ }
}

function readCredential() {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const incoming = parameters.get('token');
  if (parameters.has('token')) {
    // Fragments do not reach the server. Remove the invitation from the address
    // bar once this tab has it, so later copies of this page do not forward it.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!TOKEN_PATTERN.test(incoming || '')) { storeCredential(null); return null; }
    const value = { token: incoming, kind: 'invitation' };
    storeCredential(value);
    return value;
  }
  try {
    const stored = JSON.parse(sessionStorage.getItem(TAB_KEY));
    return TOKEN_PATTERN.test(stored?.token) && ['invitation', 'publisher'].includes(stored?.kind) ? stored : null;
  } catch { return null; }
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'the end of this invitation';
}

export default function LocationSharingPage() {
  const [session, setSession] = useState(null);
  const [state, setState] = useState({ phase: 'loading', error: '', lastSent: null, accuracy: null });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [check, setCheck] = useState(0);
  const credential = useRef(null);
  const controller = useRef(null);

  useEffect(() => {
    let alive = true;
    // Keep the first read in memory as well: React's development StrictMode
    // remount can run after a browser has refused sessionStorage access.
    credential.current = credential.current || readCredential();
    const update = patch => { if (alive) setState(previous => ({ ...previous, ...patch })); };
    const publisher = createLocationPublisher({
      geolocation: navigator.geolocation,
      request: trackingRequest,
      onChange: update,
      onToken: value => { credential.current = value; storeCredential(value); },
    });
    controller.current = publisher;
    if (!credential.current) update({ phase: 'invalid', error: 'Open the private invitation sent to you to share your location.' });
    else {
      update({ phase: 'loading', error: '' });
      trackingRequest('inspect', { token: credential.current.token }).then(data => {
        if (!alive) return;
        setSession(data);
        if (['stopped', 'revoked'].includes(data.status) || Date.parse(data.expiresAt) <= Date.now()) {
          storeCredential(null);
          credential.current = null;
          update({ phase: data.status === 'revoked' ? 'ended' : data.status === 'stopped' ? 'stopped' : 'expired' });
        } else if (data.status === 'sharing' && credential.current?.kind === 'invitation') {
          credential.current = null;
          storeCredential(null);
          update({ phase: 'ended', error: 'This invitation has already been accepted on another page. Ask for a new invitation if you need to share from this phone.' });
        } else update({ phase: 'ready' });
      }).catch(error => {
        if (!alive) return;
        if ([404, 410].includes(error.status)) {
          credential.current = null;
          storeCredential(null);
          update({ phase: 'invalid', error: error.message || 'This sharing link has expired or ended. Ask for a new invitation.' });
        } else update({ phase: 'load-failed', error: error.message || 'We could not open the invitation. Check your internet connection and try again.' });
      });
    }
    const onOnline = () => setOnline(navigator.onLine);
    const onVisibility = () => setHidden(document.hidden);
    const onLeave = () => publisher.leave();
    const onReturn = event => { if (event.persisted) setCheck(value => value + 1); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('pageshow', onReturn);
    return () => {
      alive = false;
      // Do not destroy an unused invitation during StrictMode's initial check.
      publisher.leave();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('pageshow', onReturn);
    };
  }, [check]);

  useEffect(() => {
    if (!session || ACTIVE_PHASES.includes(state.phase) || ENDED_PHASES.includes(state.phase)) return;
    const remaining = Date.parse(session.expiresAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = setTimeout(() => {
      storeCredential(null);
      credential.current = null;
      setState(previous => ({ ...previous, phase: 'expired', error: '' }));
    }, Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [session, state.phase]);

  const begin = () => {
    if (!window.isSecureContext) {
      setState(previous => ({ ...previous, phase: 'unsupported', error: 'Location sharing needs a secure connection. Open the original HTTPS invitation link.' }));
      return;
    }
    if (credential.current && session) controller.current?.start(credential.current, session.expiresAt);
  };
  const active = ACTIVE_PHASES.includes(state.phase);
  const ended = ENDED_PHASES.includes(state.phase);
  const canBegin = ['ready', 'permission-denied', 'unsupported'].includes(state.phase) && session;
  const title = state.phase === 'sharing' ? 'You’re sharing your location.'
    : state.phase === 'locating' ? 'Finding your location…'
      : state.phase === 'connecting' ? 'Reconnecting…'
        : state.phase === 'stopped' ? 'Location sharing stopped.'
          : state.phase === 'expired' ? 'This invitation has expired.'
            : state.phase === 'ended' ? 'This sharing session has ended.'
              : state.phase === 'stopping' ? 'Stopping location sharing…'
                : state.phase === 'stop-failed' ? 'Location collection stopped.'
                  : 'Let your people know where you are.';

  return <div className="pv-location-page">
    <header className="pv-location-header"><a href="/" aria-label="PrepVault home"><Brand /></a><span><Icon name="shield" size={15} /> PRIVATE LOCATION SHARING</span></header>
    <main className="pv-location-main">
      <div className={`pv-location-symbol ${state.phase === 'sharing' ? 'is-sharing' : ''}`}><Icon name={ended ? 'check' : 'compass'} size={36} /></div>
      <p className="pv-location-eyebrow">YOUR LOCATION. YOUR CHOICE.</p>
      <h1>{title}</h1>
      {state.phase === 'loading' && <p role="status">Checking your private invitation…</p>}
      {session && !ended && <p className="pv-location-intro">{session.ownerName || 'The person who sent this invitation'} invited <strong>{session.name || 'you'}</strong> to share a live location with their PrepVault account.</p>}
      {state.phase === 'stopped' && <p className="pv-location-intro">Your phone is no longer sending its location, and the shared position has been removed.</p>}
      {['expired', 'ended'].includes(state.phase) && <p className="pv-location-intro">Your phone is no longer sending its location. Ask for a new invitation if you want to share again.</p>}
      {session && !ended && <section className="pv-location-details" aria-label="Sharing details">
        <div><Icon name="users" size={18} /><span>Visible to<strong>{session.ownerName || 'The inviting account'}</strong></span></div>
        <div><Icon name="clock" size={18} /><span>Automatically ends<strong>{dateLabel(session.expiresAt)}</strong></span></div>
        <div><Icon name="shield" size={18} /><span>Shared information<strong>Your latest position and accuracy</strong></span></div>
      </section>}
      <div className="pv-location-feedback" aria-live="polite">
        {!online && <p className="pv-location-warning">You’re offline. Positions cannot be sent until your connection returns.</p>}
        {hidden && active && <p className="pv-location-warning">Return to this page to keep location updates running.</p>}
        {state.error && <p className="pv-location-warning" role="alert">{state.error}</p>}
        {active && state.lastSent && <p className="pv-location-sent"><span className="pv-location-dot" />Last sent {new Date(state.lastSent).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })} · Accuracy about {Math.round(state.accuracy)} m</p>}
      </div>
      <div className="pv-location-actions">
        {canBegin && <button type="button" className="pv-location-primary" disabled={!online} onClick={begin}><Icon name="compass" size={19} />{state.phase === 'ready' ? 'Share my location' : 'Try location access again'}</button>}
        {active && <button type="button" className="pv-location-stop" onClick={() => void controller.current?.stop()}>Stop sharing</button>}
        {state.phase === 'stop-failed' && <button type="button" className="pv-location-stop" disabled={!online} onClick={() => void controller.current?.stop()}>Retry removing shared position</button>}
        {state.phase === 'load-failed' && <button type="button" className="pv-location-primary" disabled={!online} onClick={() => setCheck(value => value + 1)}>Try again</button>}
        {ended && <a className="pv-location-secondary" href="/">Go to PrepVault <Icon name="arrow" size={18} /></a>}
      </div>
      {session && !ended && <p className="pv-location-note">Choose Share, then allow location access in your browser. You can stop at any time. Keep this page open with an internet connection; locking your phone or switching apps may pause updates. We share the latest position, without a movement history.</p>}
      {!session && state.phase !== 'loading' && <p className="pv-location-note">An invitation does not give anyone access to your phone. Location sharing only starts after you choose to allow it.</p>}
    </main>
    <footer className="pv-location-footer">PREPVAULT · KEEP YOUR PEOPLE CLOSE</footer>
  </div>;
}
