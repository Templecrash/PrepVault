import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './brand.jsx';
import TrackingOwnerSignIn from './TrackingOwnerSignIn.jsx';
import { getTrackingOwner, signOutTrackingOwner } from './tracking-auth.js';
import { useDialogFocus } from './useDialogFocus.js';
import { invitationLink, normalizePhone, smsLink, trackingRequest, trackingStatus, visiblePosition, TRACKING_POLL_MS } from './tracking.js';
import './tracking.css';

const dateTime = value => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function TrackerMap({ sessions, now, selectedId, onSelect }) {
  const container = useRef(null);
  const map = useRef(null);
  const markers = useRef(null);
  const hasCentered = useRef(false);
  useEffect(() => {
    const instance = L.map(container.current, { center: [25, 0], zoom: 2, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(instance);
    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const layer = markers.current;
    const instance = map.current;
    if (!layer || !instance) return;
    layer.clearLayers();
    const positions = sessions.filter(session => visiblePosition(session, now));
    for (const session of positions) {
      const label = document.createElement('span');
      label.textContent = `${session.name} · ${trackingStatus(session, now)}`;
      L.circleMarker([session.lat, session.lng], {
        radius: session.id === selectedId ? 10 : 7, weight: 3,
        color: '#fff', fillColor: '#214c39', fillOpacity: trackingStatus(session, now) === 'Live' ? 1 : 0.5,
      }).addTo(layer).bindTooltip(label).on('click', () => onSelect(session.id));
      if (session.id === selectedId && Number.isFinite(session.accuracy)) {
        L.circle([session.lat, session.lng], { radius: session.accuracy, weight: 1, color: '#214c39', fillOpacity: 0.06 }).addTo(layer);
      }
    }
    if (!hasCentered.current && positions.length) {
      instance.fitBounds(positions.map(session => [session.lat, session.lng]), { padding: [40, 40], maxZoom: 15 });
      hasCentered.current = true;
    }
  }, [sessions, now, selectedId, onSelect]);

  useEffect(() => {
    const session = sessions.find(item => item.id === selectedId);
    if (session && visiblePosition(session, now)) map.current?.panTo([session.lat, session.lng]);
  }, [selectedId, sessions, now]);

  const fitAll = () => {
    const positions = sessions.filter(session => visiblePosition(session, now));
    if (positions.length) map.current?.fitBounds(positions.map(session => [session.lat, session.lng]), { padding: [40, 40], maxZoom: 15 });
  };
  const count = sessions.filter(session => visiblePosition(session, now)).length;
  return <div className="pv-tracker-map-card">
    <div className="pv-tracker-map-heading"><span><Icon name="map" size={17} /> Live positions</span><button className="pv-tracker-text-button" disabled={!count} onClick={fitAll}>Show everyone</button></div>
    <div className="pv-tracker-map-wrap"><div className="pv-tracker-map" ref={container} aria-label="Map of shared locations" />
      {!count && <div className="pv-tracker-map-empty"><Icon name="compass" size={24} /><strong>Waiting for a shared location</strong><span>People appear here after they open an invitation and choose to share.</span></div>}
    </div>
    <p className="pv-tracker-map-note">Updates every 10 seconds. Positions older than 5 minutes are hidden.</p>
  </div>;
}

function InviteDialog({ contacts, request, onCreated, onClose }) {
  const ref = useDialogFocus(() => { if (!busy) onClose(); });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [duration, setDuration] = useState(240);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const create = async event => {
    event.preventDefault();
    if (!normalizePhone(phone)) { setError('Include the country code, for example +1 613 555 0123.'); return; }
    setBusy(true); setError('');
    try {
      const result = await request('create', { name: name.trim(), phone: normalizePhone(phone), durationMinutes: Number(duration) });
      const link = invitationLink(result.token, window.location.origin);
      setCreated({ ...result.session, link });
      onCreated(result.session);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const message = created ? `Hi ${created.name}, share your location with me on PrepVault until ${dateTime(created.expiresAt)}. Open this private link and tap Share my location. You can stop any time: ${created.link}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setError(''); }
    catch { setError('Copy is unavailable in this browser. Select and copy the invitation below.'); }
  };
  return <div className="pv-people-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="pv-people-dialog pv-tracker-dialog" role="dialog" aria-modal="true" aria-labelledby="tracker-invite-title" ref={ref}>
      <div className="pv-people-dialog-heading"><div><span className="pv-people-eyebrow">PRIVATE LOCATION SHARING</span><h2 id="tracker-invite-title">{created ? 'Your invitation is ready.' : 'Invite someone to share.'}</h2><p>{created ? 'Send this link to the person you named. It can be accepted once.' : 'They choose when to start and can stop at any time.'}</p></div><button className="pv-people-icon-button" onClick={onClose} disabled={busy} aria-label="Close invitation"><Icon name="close" /></button></div>
      {created ? <>
        <div className="pv-tracker-invite-to"><strong>{created.name}</strong><span>{created.phone}</span><span>Expires {dateTime(created.expiresAt)}</span></div>
        <label className="pv-people-field">Invitation<textarea readOnly value={message} rows={5} onFocus={event => event.target.select()} /></label>
        <div className="pv-tracker-invite-actions"><button className="pv-button pv-primary" onClick={copy}><Icon name={copied ? 'check' : 'arrow'} size={16} />{copied ? 'Copied' : 'Copy invitation'}</button><a className="pv-button pv-secondary" href={smsLink(created.phone, message, navigator.userAgent)}>Open text message</a></div>
        <p className="pv-tracker-help">Review and send from your messaging app. This link does not give access to your map. Keep it private; it is intended for {created.name}.</p>
      </> : <form onSubmit={create}>
        {contacts.length > 0 && <label className="pv-people-field pv-tracker-contact-picker">Choose from People<select defaultValue="" onChange={event => { const contact = contacts[Number(event.target.value)]; if (contact) { setName(contact.name || ''); setPhone(contact.phone || ''); } }}><option value="" disabled>Select a person, or enter details below</option>{contacts.map((person, index) => <option key={person.id || index} value={index}>{person.name}</option>)}</select></label>}
        <div className="pv-people-form-grid"><label className="pv-people-field">Name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></label><label className="pv-people-field">Phone number<input required type="tel" maxLength={30} placeholder="+1 613 555 0123" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" /></label><label className="pv-people-field is-wide">Sharing window<select value={duration} onChange={event => setDuration(event.target.value)}><option value={60}>1 hour from now</option><option value={240}>4 hours from now</option><option value={1440}>24 hours from now</option></select></label></div>
        <p className="pv-tracker-help">A number addresses the invitation. Location access begins only after they open it and allow sharing on their phone.</p>
        <div className="pv-people-dialog-actions"><button type="button" className="pv-button pv-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="pv-button pv-primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create invitation'}</button></div>
      </form>}
      {error && <p role="alert" className="pv-tracker-error">{error}</p>}
    </section>
  </div>;
}

function OwnerTracker({ contacts, owner, onSessionExpired, onSignOut }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [now, setNow] = useState(Date.now);
  const revision = useRef(0);
  const activeRequest = useRef(false);
  const request = async (action, payload = {}, signal) => {
    try {
      const result = await trackingRequest(action, payload, undefined, { signal });
      if (!activeRequest.current) throw new DOMException('The owner session changed.', 'AbortError');
      return result;
    } catch (err) {
      if (activeRequest.current && (err.status === 401 || err.status === 403)) onSessionExpired();
      throw err;
    }
  };
  useEffect(() => {
    activeRequest.current = true;
    const controller = new AbortController();
    let timeout;
    const poll = async () => {
      const requestedRevision = revision.current;
      try {
        const result = await trackingRequest('list', {}, undefined, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (revision.current !== requestedRevision) { timeout = setTimeout(poll, TRACKING_POLL_MS); return; }
        if (!Array.isArray(result.sessions)) throw new Error('Shared locations could not be loaded. Please try again.');
        setSessions(result.sessions); setError(''); setLastChecked(Date.now());
      } catch (err) {
        if (!controller.signal.aborted) {
          if (err.status === 401 || err.status === 403) { onSessionExpired(); return; }
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
      if (!controller.signal.aborted) timeout = setTimeout(poll, TRACKING_POLL_MS);
    };
    void poll();
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => { activeRequest.current = false; controller.abort(); clearTimeout(timeout); clearInterval(tick); };
  }, [onSessionExpired]);
  const revoke = async session => {
    setBusyId(session.id);
    try { await request('revoke', { id: session.id }); revision.current += 1; setSessions(previous => previous.filter(item => item.id !== session.id)); setError(''); }
    catch (err) { if (activeRequest.current) setError(err.message); }
    finally { if (activeRequest.current) setBusyId(null); }
  };
  const active = sessions.filter(session => !['revoked', 'stopped'].includes(session.status) && Date.parse(session.expiresAt) > now);
  const liveCount = sessions.filter(session => trackingStatus(session, now) === 'Live').length;
  return <section className="pv-tracker" aria-label="Private location tracker">
    <div className="pv-tracker-heading"><div><span className="pv-tracker-eyebrow">STAY CONNECTED</span><h2>Your people. One map.</h2><p>Invite someone by phone number to share their live position with you.</p></div><button className="pv-button pv-primary" onClick={() => setShowInvite(true)}><Icon name="plus" size={17} />Invite to share</button></div>
    <div className="pv-tracker-account"><span><Icon name="shield" size={15} />Private owner session · {owner.email}</span><button className="pv-tracker-text-button" onClick={onSignOut}>Sign out of tracking</button></div>
    {error && <p className="pv-tracker-error" role="alert">{error} {sessions.length > 0 && 'Showing the last received positions until the connection returns.'}</p>}
    <div className="pv-tracker-summary"><span><i className={liveCount ? 'is-live' : ''} />{liveCount} sharing live · {active.length} active invitation{active.length === 1 ? '' : 's'}</span><span>{loading ? 'Connecting…' : lastChecked ? `Checked ${new Date(lastChecked).toLocaleTimeString()}` : 'Only shared locations appear here'}</span></div>
    <div className="pv-tracker-grid"><TrackerMap sessions={sessions} now={now} selectedId={selectedId} onSelect={setSelectedId} /><aside className="pv-tracker-people" aria-label="People sharing locations"><h3>Sharing with you <span>{sessions.filter(session => session.status !== 'revoked').length}</span></h3>
      {!sessions.filter(session => session.status !== 'revoked').length && <div className="pv-tracker-empty"><Icon name="users" size={26} /><strong>No one is sharing yet</strong><p>Create an invitation, send it, and their position will appear when they start sharing.</p></div>}
      {sessions.filter(session => session.status !== 'revoked').map(session => {
        const status = trackingStatus(session, now);
        const hasPosition = visiblePosition(session, now);
        return <article key={session.id} className={`pv-tracker-person${selectedId === session.id ? ' is-selected' : ''}`}><div className="pv-tracker-person-top"><strong>{session.name}</strong><span className={status === 'Live' ? 'is-live' : ''}>{status}</span></div><span className="pv-tracker-phone">{session.phone}</span>
          <p>{hasPosition ? `Updated ${new Date(session.updatedAt).toLocaleTimeString()}${Number.isFinite(session.accuracy) ? ` · ±${Math.round(session.accuracy)} m` : ''}` : status === 'Signal lost' ? 'Waiting for a fresh location from their phone.' : status === 'Invitation ready' ? 'Waiting for them to accept and share.' : status === 'Waiting for location' ? 'Accepted. Waiting for their first location.' : 'Location is no longer shared.'}</p>
          <div className="pv-tracker-person-actions"><button className="pv-tracker-text-button" disabled={!hasPosition} onClick={() => setSelectedId(session.id)}>Show on map</button>{Date.parse(session.expiresAt) > now && !['stopped', 'revoked'].includes(session.status) && <button className="pv-tracker-text-button" onClick={() => revoke(session)} disabled={busyId === session.id}>{busyId === session.id ? 'Removing…' : 'End sharing'}</button>}</div>
        </article>;
      })}
    </aside></div>
    <p className="pv-tracker-privacy"><Icon name="shield" size={16} /> Only your signed-in account can view these positions. Sharing needs an internet connection and an open page on their phone.</p>
    {showInvite && <InviteDialog contacts={contacts} request={request} onCreated={session => { revision.current += 1; setSessions(previous => [session, ...previous.filter(item => item.id !== session.id)]); }} onClose={() => setShowInvite(false)} />}
  </section>;
}

export default function LiveTracker({ contacts = [] }) {
  const [auth, setAuth] = useState({ phase: 'checking', owner: null, message: '' });
  const pending = useRef(null);
  const revision = useRef(0);
  const checkSession = useCallback(() => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const requestedRevision = ++revision.current;
    return getTrackingOwner({ signal: controller.signal }).then(owner => {
      if (!controller.signal.aborted && requestedRevision === revision.current) {
        setAuth({ phase: owner ? 'signed-in' : 'signed-out', owner, message: '' });
      }
    }).catch(err => {
      if (!controller.signal.aborted && requestedRevision === revision.current) {
        setAuth({ phase: err.status === 403 ? 'signed-out' : 'unavailable', owner: null, message: err.message });
      }
    });
  }, []);

  useEffect(() => {
    void checkSession();
    return () => { pending.current?.abort(); revision.current += 1; };
  }, [checkSession]);

  useEffect(() => {
    const onFocus = () => {
      if (auth.phase !== 'signed-in') return;
      // Hide private state before checking a potentially changed browser account.
      setAuth({ phase: 'checking', owner: null, message: '' });
      void checkSession();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [auth.phase, checkSession]);

  const onSessionExpired = useCallback(() => {
    pending.current?.abort(); revision.current += 1;
    setAuth({ phase: 'signed-out', owner: null, message: 'Your private session ended. Sign in again to view shared locations.' });
  }, []);

  const signOut = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const requestedRevision = ++revision.current;
    setAuth({ phase: 'signing-out', owner: null, message: '' });
    try {
      await signOutTrackingOwner({ signal: controller.signal });
      if (!controller.signal.aborted && requestedRevision === revision.current) setAuth({ phase: 'signed-out', owner: null, message: 'You are signed out of private tracking.' });
    } catch (err) {
      if (!controller.signal.aborted && requestedRevision === revision.current) setAuth({ phase: 'signout-failed', owner: null, message: err.message });
    }
  };

  if (auth.phase === 'signed-in') return <OwnerTracker key={auth.owner.id} contacts={contacts} owner={auth.owner} onSessionExpired={onSessionExpired} onSignOut={signOut} />;
  return <section className="pv-tracker" aria-label="Private location tracker">
    <div className="pv-tracker-heading"><div><span className="pv-tracker-eyebrow">STAY CONNECTED</span><h2>Your people. One map.</h2><p>Invite someone by phone number to share their live position with you.</p></div></div>
    {['checking', 'signing-out'].includes(auth.phase) ? <div className="pv-tracker-auth-loading" role="status"><Icon name="shield" size={20} />{auth.phase === 'checking' ? 'Checking your private session…' : 'Signing out…'}</div>
      : ['unavailable', 'signout-failed'].includes(auth.phase) ? <div className="pv-tracker-notice pv-tracker-auth-error" role="alert"><Icon name="shield" size={21} /><div><strong>{auth.phase === 'signout-failed' ? 'Sign-out has not completed' : 'Secure sign-in is unavailable'}</strong><p>{auth.message}</p></div><button className="pv-button pv-secondary" onClick={auth.phase === 'signout-failed' ? signOut : () => { setAuth({ phase: 'checking', owner: null, message: '' }); void checkSession(); }}>Try again</button></div>
        : <TrackingOwnerSignIn notice={auth.message} onSignedIn={owner => { pending.current?.abort(); revision.current += 1; setAuth({ phase: 'signed-in', owner, message: '' }); }} />}
  </section>;
}
