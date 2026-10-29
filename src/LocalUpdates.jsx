import { useEffect, useMemo, useState } from 'react';
import { Icon } from './brand.jsx';
import { isLocalEdition } from './runtime-mode.js';
import { briefingLocationKey, normalizeBriefingLocation } from './briefing-relevance.js';
import { getLocalUpdates, localUpdateDate } from './local-updates.js';
import PublicCommunity from './PublicCommunity.jsx';
import './local-updates.css';

export default function LocalUpdates({ activeLocation }) {
  const [state, setState] = useState({ key: '', data: null, error: '', busy: false });
  const [refresh, setRefresh] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now);
  const { location, locationKey, locationError } = useMemo(() => {
    try {
      const normalized = normalizeBriefingLocation(activeLocation);
      return { location: normalized, locationKey: briefingLocationKey(normalized), locationError: '' };
    } catch {
      return { location: null, locationKey: '', locationError: 'Local updates cannot be matched to this saved place. Choose another city or add a nearby city to check local sources.' };
    }
  }, [activeLocation]);
  const local = isLocalEdition();
  const data = state.key === locationKey ? state.data : null;
  const busy = !local && location && (state.key !== locationKey || state.busy);
  const error = state.key === locationKey ? state.error : '';
  useEffect(() => {
    if (local || !location) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState(previous => ({ key: locationKey, data: previous.key === locationKey ? previous.data : null, error: '', busy: true }));
      void getLocalUpdates(location, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setState({ key: locationKey, data: result, error: '', busy: false }); }).catch(problem => { if (!controller.signal.aborted) setState(previous => ({ ...previous, busy: false, error: problem.message || 'Local updates could not be checked.' })); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [location, locationKey, refresh, local]);
  useEffect(() => {
    if (local || !location) return;
    const update = () => { setNow(Date.now()); if (document.visibilityState === 'visible' && navigator.onLine !== false) setRefresh(value => value + 1); };
    const timer = setInterval(update, 300000);
    window.addEventListener('online', update); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); window.removeEventListener('online', update); document.removeEventListener('visibilitychange', update); };
  }, [location, local]);
  if (local) return null;
  if (locationError) return <section className="pv-local-updates" aria-label="Local updates unavailable"><header><h2>Police &amp; city updates</h2></header><p className="pv-local-updates-message" role="status">{locationError}</p></section>;
  if (!location) return null;
  const unsupported = data?.sources.every(source => source.status === 'unsupported');
  const failed = data?.sources.some(source => source.status === 'unavailable');
  const stale = data && (error || now - Date.parse(data.fetchedAt) > 10 * 60000);
  const updates = data?.updates || [];
  return <section className="pv-local-updates" aria-labelledby="local-updates-title">
    <header><div><span className="pv-local-updates-eyebrow">OFFICIAL LOCAL SOURCES</span><h2 id="local-updates-title">Police &amp; city updates</h2><p>{location.city}{data && ` · Checked ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</p></div><button type="button" className="pv-text-link" disabled={Boolean(busy)} onClick={() => { setNow(Date.now()); setRefresh(value => value + 1); }}><Icon name="refresh" size={14}/>{busy ? 'Checking…' : 'Refresh'}</button></header>
    {error && <p className="pv-local-updates-message" role="status">{error}{data ? ' Previous results remain below.' : ''}</p>}
    {stale && <p className="pv-local-updates-message" role="status">Previous check · open the official source for the latest information.</p>}
    {busy && !data && <p className="pv-local-updates-message" role="status">Checking local sources…</p>}
    {data && <>
      {updates.some(row => row.timestampBasis === 'reported') && <p className="pv-local-updates-message">Recent reported police calls · incidents may already be resolved.</p>}
      {updates.length ? <ol className="pv-local-updates-list">{updates.slice(0, expanded ? 30 : 4).map(row => <li key={row.id}><div><span>{row.source || (row.kind === 'police' ? 'Police update' : 'City update')}</span><time dateTime={row.publishedAt}>{row.timestampBasis === 'reported' ? 'Reported ' : ''}{localUpdateDate(row)}</time></div><a href={row.url} target="_blank" rel="noreferrer">{row.title}<Icon name="arrow" size={14}/></a>{row.summary && <p>{row.summary}</p>}</li>)}</ol> : <p className="pv-local-updates-message">{unsupported ? `Direct police and city feeds are not connected for ${location.city} yet. Local news and public-post searches remain available.` : failed ? 'Local sources could not be fully checked. Use the official links below.' : 'No matching recent updates were returned. This does not confirm that the area is clear.'}</p>}
      {updates.length > 4 && <button type="button" className="pv-text-link pv-local-updates-more" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer updates' : `More updates (${Math.min(updates.length, 30)})`}</button>}
      {data.channels.length > 0 && <nav className="pv-local-updates-channels" aria-label="Official local channels">{data.channels.map(channel => <a key={channel.url} href={channel.url} target="_blank" rel="noreferrer">{channel.name}<Icon name="arrow" size={12}/></a>)}</nav>}
      <details className="pv-local-updates-sources"><summary>Coverage{failed ? ' · some sources unavailable' : ''}</summary><p>Police calls are reported incidents, not confirmation of an ongoing threat. Some calls are omitted or delayed. Check the source for current instructions.</p>{data.sources.map((source, index) => <p key={index}><strong>{source.name}</strong> · {source.status === 'ready' ? 'Checked' : source.status === 'empty' ? 'No matching updates' : source.status === 'unsupported' ? 'Not connected for this city' : 'Unavailable'}{source.error && ` — ${source.error}`}{source.note && ` · ${source.note}`}</p>)}</details>
    </>}
    <PublicCommunity key={locationKey} location={location}/>
  </section>;
}
