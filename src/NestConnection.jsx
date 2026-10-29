import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { configureNestPeer, disconnectNest, finalizeNestConnection, getNestDevices, startNestConnection, startNestStream, stopNestStream, waitForNestIce } from './nest-client.js';
import './nest-connection.css';

const HOME = 'https://home.google.com/';
const isUnauthorized = error => error?.status === 401 || error?.status === 403;

function NestLiveView({ device, onClose, onUnauthorized }) {
  const titleId = useId();
  const dialogRef = useDialogFocus(onClose);
  const videoRef = useRef(null);
  const unauthorizedRef = useRef(onUnauthorized);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: 'starting', message: 'Connecting to your camera…' });
  useEffect(() => { unauthorizedRef.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    const controller = new AbortController();
    let peer, media, session, expiryTimer, connectionTimer, stopped = false;
    const video = videoRef.current;
    const stop = () => {
      clearTimeout(expiryTimer); clearTimeout(connectionTimer);
      if (peer) { peer.ontrack = null; peer.onconnectionstatechange = null; peer.close(); }
      media?.getTracks().forEach(track => track.stop());
      if (video) video.srcObject = null;
      if (session && !stopped) { stopped = true; void stopNestStream(device.id, session.mediaSessionId, { keepalive: true }).catch(() => {}); }
    };
    const end = (phase, message) => { if (!controller.signal.aborted) setState({ phase, message }); stop(); };
    const start = async () => {
      setState({ phase: 'starting', message: 'Connecting to your camera…' });
      try {
        if (!globalThis.RTCPeerConnection) throw new Error('This browser cannot play Nest live video. Open Google Home instead.');
        peer = new RTCPeerConnection({ bundlePolicy: 'max-bundle', iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        media = new MediaStream();
        configureNestPeer(peer);
        peer.ontrack = event => {
          if (controller.signal.aborted) return;
          if (!media.getTracks().some(track => track.id === event.track.id)) media.addTrack(event.track);
          if (video) { video.srcObject = media; void video.play().catch(() => {}); }
        };
        peer.onconnectionstatechange = () => {
          if (controller.signal.aborted) return;
          if (peer.connectionState === 'connected') { clearTimeout(connectionTimer); setState({ phase: 'live', message: 'Live · camera audio is muted until you turn it on.' }); }
          if (peer.connectionState === 'failed') end('error', 'The camera connection was interrupted. Start a new live view or open Google Home.');
        };
        await peer.setLocalDescription(await peer.createOffer());
        await waitForNestIce(peer, controller.signal);
        if (controller.signal.aborted) return;
        session = await startNestStream(device.id, peer.localDescription.sdp, { signal: controller.signal });
        if (controller.signal.aborted) { stop(); return; }
        expiryTimer = setTimeout(() => end('ended', 'This viewing session has ended. Start a new live view to continue.'), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
        await peer.setRemoteDescription({ type: 'answer', sdp: session.answerSdp });
        if (controller.signal.aborted) return;
        if (peer.connectionState !== 'connected') connectionTimer = setTimeout(() => end('error', 'Your camera did not connect. Try again or open Google Home.'), 25000);
      } catch (error) {
        stop();
        if (controller.signal.aborted) return;
        if (isUnauthorized(error)) unauthorizedRef.current?.();
        setState({ phase: 'error', message: error.message || 'The camera could not connect. Try again.' });
      }
    };
    const timer = setTimeout(start, 0);
    const pagehide = () => { setState({ phase: 'ended', message: 'Live view stopped when you left this page. Start a new view to continue.' }); controller.abort(); stop(); };
    window.addEventListener('pagehide', pagehide);
    return () => { clearTimeout(timer); controller.abort(); stop(); window.removeEventListener('pagehide', pagehide); };
  }, [device.id, attempt]);
  const finished = ['error', 'ended'].includes(state.phase);
  return createPortal(<div className="pv-nest-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="pv-nest-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div><span className="pv-nest-kicker">GOOGLE NEST · LIVE VIEW</span><h2 id={titleId}>{device.name}</h2></div><button type="button" className="pv-nest-icon-button" onClick={onClose} aria-label="Close live view"><Icon name="close" /></button></header>
      <div className="pv-nest-video"><video ref={videoRef} autoPlay muted playsInline controls aria-label={`${device.name} live camera video`} />{state.phase !== 'live' && <div className="pv-nest-video-message"><Icon name="camera" size={32} /><p role="status">{state.message}</p>{finished && <button type="button" className="pv-nest-button pv-nest-button-primary" onClick={() => setAttempt(value => value + 1)}>Start new live view</button>}</div>}</div>
      <footer><p>{state.phase === 'live' ? state.message : 'Receive-only video. Your microphone and camera are not used.'}</p><a href={HOME} target="_blank" rel="noreferrer">Open Google Home<Icon name="arrow" size={15} /></a></footer>
    </section>
  </div>, document.body);
}

export default function NestConnection({ onUnauthorized, onStateChange, returnStatus, onReturnHandled, initialData = null }) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState('checking');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);
  const requestRef = useRef(null);
  const dataRef = useRef(null);
  const callbacksRef = useRef({ onUnauthorized, onStateChange, onReturnHandled });
  const finalizeRef = useRef(false);
  useEffect(() => { callbacksRef.current = { onUnauthorized, onStateChange, onReturnHandled }; }, [onUnauthorized, onStateChange, onReturnHandled]);
  const run = useCallback(async (action = 'refresh') => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setBusy(action); setError('');
    try {
      if (action === 'connect') {
        const url = await startNestConnection({ signal: controller.signal });
        if (!controller.signal.aborted) window.location.assign(url);
        return;
      }
      if (action === 'disconnect') {
        setSelected(null);
        const result = await disconnectNest({ signal: controller.signal });
        if (controller.signal.aborted) return;
        finalizeRef.current = false;
        setNotice(result.revoked ? 'Google Nest disconnected.' : 'Disconnected from PrepVault. You can also remove access in your Google account.');
      }
      if (finalizeRef.current) {
        await finalizeNestConnection({ signal: controller.signal });
        if (controller.signal.aborted) return;
        finalizeRef.current = false;
        setNotice('Google Nest connected.');
        callbacksRef.current.onReturnHandled?.();
      }
      const result = await getNestDevices({ signal: controller.signal });
      if (controller.signal.aborted) return;
      dataRef.current = result; setData(result);
      setSelected(current => result.connected && result.devices.some(device => device.id === current?.id && device.status !== 'offline' && device.supportsLiveView) ? current : null);
      callbacksRef.current.onStateChange?.(result);
    } catch (problem) {
      if (controller.signal.aborted) return;
      const message = problem.message || 'Google Nest is unavailable. Try again.';
      if (finalizeRef.current && problem.code === 'reconnect_required') {
        finalizeRef.current = false; callbacksRef.current.onReturnHandled?.();
      }
      setError(message);
      if (isUnauthorized(problem)) {
        dataRef.current = null; setData(null); setSelected(null);
        callbacksRef.current.onStateChange?.(null); callbacksRef.current.onUnauthorized?.();
      } else if (dataRef.current) {
        const stale = { ...dataRef.current, error: true, errorMessage: message };
        dataRef.current = stale; setData(stale); callbacksRef.current.onStateChange?.(stale);
      }
    } finally {
      if (!controller.signal.aborted && requestRef.current === controller) { requestRef.current = null; setBusy(''); }
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (returnStatus === 'nest-connected') finalizeRef.current = true;
      if (returnStatus === 'nest-error') { setNotice('Google sign-in was not completed. Connect again when you are ready.'); callbacksRef.current.onReturnHandled?.(); }
      void run();
    }, 0);
    return () => clearTimeout(timer);
  }, [returnStatus, run]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !requestRef.current) void run(); };
    const interval = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refresh); requestRef.current?.abort(); };
  }, [run]);
  const connect = () => { setNotice(''); void run('connect'); };
  const status = !data ? error ? 'Connection unavailable' : 'Checking connection' : !data.configured ? 'Setup required' : data.connected ? 'Connected' : 'Not connected';
  return <section className="pv-nest" aria-label="Google Nest connection">
    <header className="pv-nest-heading"><div className="pv-nest-heading-title"><span className="pv-nest-symbol"><Icon name="camera" size={24} /></span><div><h2>Google Nest</h2><p>Home cameras and doorbells.</p></div></div><span className="pv-nest-connection-status">{status}</span></header>
    {error && <div className="pv-nest-message pv-nest-message-error" role="alert"><span>{error}</span><button type="button" onClick={() => run()} disabled={Boolean(busy)}>Try again</button></div>}
    {notice && <p className="pv-nest-message" role="status">{notice}</p>}
    {!data && !error && <p className="pv-nest-loading" role="status">Checking your private Google Nest connection…</p>}
    {data && <>
      <div className="pv-nest-connection-actions"><p>{!data.configured ? 'Google Nest needs a one-time server setup before it can connect here. You can use Google Home now.' : data.connected ? 'Choose a camera to start a private live view.' : 'Sign in with Google and choose which home and cameras to share with PrepVault.'}</p><div className="pv-nest-actions">
        {data.configured && <button type="button" className="pv-nest-button pv-nest-button-primary" disabled={Boolean(busy)} onClick={connect}>{busy === 'connect' ? 'Opening Google…' : data.connected ? 'Manage Google connection' : 'Connect with Google'}<Icon name="arrow" size={15} /></button>}
        <a className="pv-nest-button" href={HOME} target="_blank" rel="noreferrer">Open Google Home<Icon name="arrow" size={15} /></a>
        {data.connected && <><button type="button" className="pv-nest-button" disabled={Boolean(busy)} onClick={() => run()}><Icon name="refresh" size={15} />{busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</button><button type="button" className="pv-nest-text-button" disabled={Boolean(busy)} onClick={() => run('disconnect')}>{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</button></>}
      </div></div>
      {!data.configured && <details className="pv-nest-setup"><summary>Developer setup</summary><p>Register a Google Device Access project, enable the Smart Device Management API, and configure its OAuth connection on the server.</p><ul><li><a href="https://developers.google.com/nest/device-access/get-started" target="_blank" rel="noreferrer">Google Device Access setup guide</a></li><li><a href="https://developers.google.com/nest/device-access/authorize" target="_blank" rel="noreferrer">Authorization and account connection</a></li><li><a href="https://developers.google.com/nest/device-access/supported-devices" target="_blank" rel="noreferrer">Supported cameras and doorbells</a></li></ul>{data.missingConfig.length > 0 && <p className="pv-nest-config">Missing server settings: {data.missingConfig.map(name => <code key={name}>{name}</code>)}</p>}</details>}
      {data.connected && (data.devices.length ? <div className="pv-nest-cameras">{data.devices.map(device => <article className="pv-nest-camera" key={device.id}><div className="pv-nest-camera-top"><Icon name="camera" size={22} /><span className={`pv-nest-device-status is-${device.status}`}>{device.status === 'unknown' ? 'Status not reported' : device.status === 'online' ? 'Online' : 'Offline'}</span></div><h3>{device.name}</h3>{device.room && device.room !== device.name && <p>{device.room}</p>}<div className="pv-nest-camera-bottom">{device.supportsLiveView ? <><p>{device.status === 'offline' ? 'This camera is offline. Check its connection in Google Home.' : 'Live video starts only when you open it.'}</p><button type="button" className="pv-nest-button" disabled={Boolean(busy) || device.status === 'offline'} onClick={() => setSelected(device)}>Watch live<Icon name="arrow" size={15} /></button></> : <><p>{device.protocols.includes('RTSP') ? 'This camera uses RTSP and needs a compatible player. View it in Google Home.' : 'Browser live view is not available for this device.'}</p><a className="pv-nest-button" href={HOME} target="_blank" rel="noreferrer">Open Google Home<Icon name="arrow" size={15} /></a></>}</div></article>)}</div> : <div className="pv-nest-empty"><Icon name="camera" size={28} /><h3>No cameras shared yet</h3><p>Manage your Google connection to share a supported camera or doorbell.</p></div>)}
      {data.connected && <p className="pv-nest-footnote">Live sessions last up to five minutes. Event snapshots are not imported here.{data.checkedAt && <> Last checked {new Date(data.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</>}</p>}
    </>}
    {selected && <NestLiveView device={selected} onClose={() => setSelected(null)} onUnauthorized={() => { dataRef.current = null; setSelected(null); setData(null); callbacksRef.current.onStateChange?.(null); callbacksRef.current.onUnauthorized?.(); }} />}
  </section>;
}
