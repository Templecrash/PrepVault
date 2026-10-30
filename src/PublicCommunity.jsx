import { useEffect, useMemo, useState } from 'react';
import { Icon } from './brand.jsx';
import { briefingLocationKey, normalizeBriefingLocation } from './briefing-relevance.js';
import { isLocalEdition } from './runtime-mode.js';
import { getPublicCommunity, publicCommunityDate, publicCommunitySearches } from './public-community.js';
import './local-updates.css';

function PublicReport({ post }) {
  return <li><div><span>{post.source}</span>{post.date ? <time dateTime={post.date}>{publicCommunityDate(post)}</time> : <span>{publicCommunityDate(post)}</span>}</div><a href={post.url} target="_blank" rel="noreferrer">{post.title}<Icon name="arrow" size={14}/></a></li>;
}

export default function PublicCommunity({ location: locationProp, activeLocation }) {
  const input = locationProp ?? activeLocation;
  const { location, locationKey, locationError } = useMemo(() => {
    try { const location = normalizeBriefingLocation(input); return { location, locationKey: briefingLocationKey(location), locationError: '' }; }
    catch { return { location: null, locationKey: '', locationError: 'Public reports cannot be matched to this saved place. Choose another city or add a nearby city.' }; }
  }, [input]);
  const [state, setState] = useState({ key: '', data: null, error: '', busy: false });
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now);
  const local = isLocalEdition();
  const current = state.key === locationKey;
  const data = current ? state.data : null;
  const error = current ? state.error : '';
  const busy = Boolean(!local && location && (!current || state.busy));
  useEffect(() => {
    if (local || !location) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState(previous => ({ key: locationKey, data: previous.key === locationKey ? previous.data : null, error: '', busy: true }));
      void getPublicCommunity(location, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) setState({ key: locationKey, data: result, error: '', busy: false });
      }).catch(problem => {
        if (!controller.signal.aborted) setState(previous => ({ key: locationKey, data: previous.key === locationKey ? previous.data : null, error: problem.message || 'Public reports are unavailable.', busy: false }));
      });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [location, locationKey, refresh, local]);
  useEffect(() => {
    if (local || !location) return;
    const update = () => { setNow(Date.now()); if (document.visibilityState === 'visible' && navigator.onLine !== false) setRefresh(value => value + 1); };
    const timer = setInterval(update, 600000);
    const ageTimer = setInterval(() => setNow(Date.now()), 60000);
    window.addEventListener('online', update); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); clearInterval(ageTimer); window.removeEventListener('online', update); document.removeEventListener('visibilitychange', update); };
  }, [location, local]);
  if (!location) return <section className="pv-local-posts pv-public-community" aria-label="Public community reports"><header><h3>Public reports · X &amp; Reddit</h3></header><p className="pv-local-posts-note" role="status">{locationError || 'Choose a city to find local public reports.'}</p></section>;
  const searches = publicCommunitySearches(location, now);
  const posts = data?.posts || [];
  const checkedSources = data?.sources.filter(source => ['ready', 'empty'].includes(source.status)).length || 0;
  const incomplete = data && (!data.sources.length || checkedSources < data.sources.length);
  const stale = Boolean(data && (error || now - Date.parse(data.fetchedAt) > 15 * 60000));
  return <section className="pv-local-posts pv-public-community" aria-label={`Public reports for ${location.city}`} aria-busy={busy}>
    <header><div><h3>Public reports · X &amp; Reddit</h3><p>Public discussion about {location.city}, ranked by safety relevance and recency. Reports are unverified; ranking is not confirmation.</p></div>{!local && <button type="button" className="pv-text-link" disabled={busy} onClick={() => { setNow(Date.now()); setRefresh(value => value + 1); }}><Icon name="refresh" size={14}/>{busy ? 'Checking…' : 'Refresh'}</button>}</header>
    <nav className="pv-public-community-searches" aria-label={`Search public posts about ${location.city}`}><a href={searches.x} target="_blank" rel="noreferrer">Search X<Icon name="arrow" size={13}/></a><a href={searches.reddit} target="_blank" rel="noreferrer">Search Reddit<Icon name="arrow" size={13}/></a></nav>
    {local ? <p className="pv-local-posts-note">Public reports need an internet connection. The searches open the public source sites.</p> : <>
      {error && <p className="pv-local-posts-note" role="status">{error}{data ? ' Previous results are shown.' : ''}</p>}
      {busy && !data && <p className="pv-local-posts-note" role="status">Checking public sources for this city…</p>}
      {data && <>
        <p className="pv-local-posts-note pv-public-community-check">{stale ? 'Previous check' : 'Checked'} {new Date(data.fetchedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{incomplete ? ' · Some sources unavailable' : ''}</p>
        {posts.length ? <ol className="pv-local-updates-list">{posts.map(post => <PublicReport key={post.url} post={post}/>)}</ol> : <p className="pv-local-posts-note">{!checkedSources ? 'Public sources could not be checked for this city. Try the searches above.' : 'No matching public reports were returned in this check. This is not an all-clear.'}</p>}
        <details className="pv-local-updates-sources pv-public-community-coverage"><summary>Public source coverage</summary><p>Google-listed dates show when a search listing was dated, not when the original post was published. These sources may miss posts or include resolved incidents.</p>{data.sources.map((source, index) => <p key={source.id || index}><strong>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name}</strong> · {source.status === 'ready' ? 'Checked' : source.status === 'empty' ? 'No matching reports' : source.status === 'unsupported' ? 'Not covered for this city' : 'Unavailable'}{source.note && ` · ${source.note}`}{source.error && ` · ${source.error}`}</p>)}</details>
      </>}
    </>}
  </section>;
}
