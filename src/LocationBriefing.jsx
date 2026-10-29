import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { isLocalEdition } from './runtime-mode.js';
import { BRIEFING_TOPICS, briefingHighlights, briefingLocationKey, getPreparednessBriefing, selectRelevantBriefing, shortBriefingText } from './location-briefing.js';
import './location-briefing.css';

const stamp = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date unavailable';
const countryNames = { GB: 'United Kingdom', JP: 'Japan', CA: 'Canada', US: 'United States' };
const scopeLabels = { local: 'Local', regional: 'Regional', national: 'National', macro: 'Wider effects' };
const checkedSource = source => ['ready', 'empty'].includes(source.status);

function ArticleDate({ article }) {
  const value = article.publishedAt || article.observedAt;
  return <span>{article.publishedAt ? article.dateBasis === 'updated' ? 'Updated ' : 'Published ' : article.observedAt ? 'Indexed ' : ''}{value ? <time dateTime={value}>{stamp(value)}</time> : 'Date unavailable'}</span>;
}
function Relevance({ article, compact = false }) {
  const relevance = article.relevance;
  if (!relevance) return null;
  return <div className={`pv-briefing-relevance${compact ? ' is-compact' : ''}`}>
    {!compact && relevance.reason && <p><strong>Why shown</strong>{relevance.reason}</p>}
    {relevance.impact && <p><strong>Possible implication</strong>{relevance.impact}</p>}
  </div>;
}
function ReportGroup({ articles, title, description, emptyMessage }) {
  const [expanded, setExpanded] = useState(false);
  const shown = articles.slice(0, expanded ? 40 : 6);
  return <section className="pv-briefing-reports" aria-label={title}>
    <div className="pv-briefing-section-heading"><div><h3>{title}</h3><p>{description}</p></div><span>{articles.length} {articles.length === 1 ? 'report' : 'reports'}</span></div>
    {shown.length ? <div>{shown.map(article => <article key={article.id}>
      <div className="pv-briefing-meta"><span className="pv-briefing-scope">{article.relevance?.label || scopeLabels[article.relevance?.scope] || 'Report'}</span><span>{article.source}</span><span>{article.kind === 'official' ? 'Official publication' : 'News coverage'}</span><ArticleDate article={article}/></div>
      <h4><a href={article.url} target="_blank" rel="noreferrer">{article.title}<Icon name="arrow" size={15}/></a></h4>
      {article.summary && <p className="pv-briefing-excerpt">{shortBriefingText(article)}</p>}
      <Relevance article={article}/>
      {article.topics.length > 0 && <div className="pv-briefing-tags">{article.topics.map(value => <span key={value}>{BRIEFING_TOPICS[value]}</span>)}</div>}
    </article>)}</div> : <p className="pv-briefing-empty">{emptyMessage}</p>}
    {articles.length > 6 && <button type="button" className="pv-text-link" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer reports' : `Show more reports (${Math.min(articles.length, 40)})`}</button>}
  </section>;
}

export default function LocationBriefing({ activeLocation = null, locations = [] }) {
  const sourcesRef = useRef(null);
  const [request, setRequest] = useState({ key: null, data: null, busy: false, error: '' });
  const [refresh, setRefresh] = useState(0);
  const [topic, setTopic] = useState('all');
  const [scope, setScope] = useState('all');
  const [now, setNow] = useState(() => Date.now());
  const local = isLocalEdition();
  const name = activeLocation?.name || activeLocation?.city || '';
  const region = activeLocation?.region || '';
  const countryCode = typeof activeLocation?.countryCode === 'string' ? activeLocation.countryCode.toUpperCase() : '';
  const countryName = activeLocation?.country || countryNames[countryCode] || countryCode;
  // Only a place name, region and country are used for news. Exact coordinates
  // used by the separate weather view never enter the briefing request.
  const { requestLocation, locationKey, locationError } = useMemo(() => {
    const place = name && countryCode ? { name, region, countryCode } : null;
    try { return { requestLocation: place, locationKey: briefingLocationKey(place), locationError: '' }; }
    catch { return { requestLocation: null, locationKey: briefingLocationKey(null), locationError: 'This saved city could not be used for a news search. Choose a valid city from the watchlist or add it again.' }; }
  }, [name, region, countryCode]);
  const hasCity = Boolean(requestLocation);
  const cityLabel = hasCity ? [name, region && region !== name ? region : ''].filter(Boolean).join(', ') : '';
  const current = request.key === locationKey;
  const data = current ? request.data : null;
  const busy = !local && (!current || request.busy);
  const error = current ? request.error : '';
  const selectedScope = !hasCity && !['all', 'macro'].includes(scope) ? 'all' : scope;

  useEffect(() => {
    if (local) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setRequest(previous => ({ key: locationKey, data: previous.key === locationKey ? previous.data : null, busy: true, error: '' }));
      getPreparednessBriefing({ location: requestLocation, signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setRequest({ key: locationKey, data: result, busy: false, error: '' }); })
        .catch(problem => {
          if (!controller.signal.aborted) setRequest(previous => ({ key: locationKey, data: previous.key === locationKey ? previous.data : null, busy: false, error: problem?.name === 'TimeoutError' ? 'The briefing took too long to load. Try refreshing.' : problem?.message || 'The briefing could not be checked.' }));
        });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [local, refresh, locationKey, requestLocation]);
  useEffect(() => {
    if (local) return;
    const update = () => { setNow(Date.now()); if (document.visibilityState === 'visible' && navigator.onLine !== false) setRefresh(value => value + 1); };
    const timer = setInterval(update, 600_000);
    const ageTimer = setInterval(() => setNow(Date.now()), 60_000);
    document.addEventListener('visibilitychange', update); window.addEventListener('online', update);
    return () => { clearInterval(timer); clearInterval(ageTimer); document.removeEventListener('visibilitychange', update); window.removeEventListener('online', update); };
  }, [local]);

  const articles = selectRelevantBriefing(data?.articles || [], requestLocation, { topic, scope: selectedScope });
  const nearArticles = articles.filter(article => ['local', 'regional'].includes(article.relevance?.scope));
  const widerArticles = articles.filter(article => ['national', 'macro'].includes(article.relevance?.scope));
  const highlights = briefingHighlights(articles, 3);
  const stale = Boolean(data && (error || now - Date.parse(data.fetchedAt) > 30 * 60_000));
  const sources = data?.sources || [];
  const unavailable = sources.filter(source => !checkedSource(source));
  const available = sources.filter(checkedSource).length;
  const areaSources = sources.filter(source => ['local', 'regional'].includes(source.scope));
  const areaAvailable = areaSources.filter(checkedSource).length;
  const allFeedsFailed = sources.length > 0 && available === 0;
  const localFeedsFailed = hasCity && areaSources.length > 0 && areaAvailable === 0;
  const showSources = () => { if (sourcesRef.current) { sourcesRef.current.open = true; sourcesRef.current.scrollIntoView({ block: 'nearest' }); } };
  const guides = hasCity ? (data?.guidance || []).filter(guide => guide.country === countryCode) : [];
  const filtered = topic !== 'all' || selectedScope !== 'all';
  const resetFilters = () => { setTopic('all'); setScope('all'); };

  return <section className="pv-briefing" aria-labelledby="pv-briefing-title" aria-busy={busy}>
    <header className="pv-briefing-heading"><div><p className="pv-briefing-eyebrow">{hasCity ? 'YOUR AREA & THE BIGGER PICTURE' : 'START WITH YOUR AREA'}</p><h2 id="pv-briefing-title">{hasCity ? `Your brief for ${name}` : 'Your preparedness brief'}</h2><p>{hasCity ? `${cityLabel}${countryName && countryName !== region ? ` · ${countryName}` : ''}. Local developments first, then national and wider events with a possible link to your plans.` : 'Add a city above to focus the briefing on your area. Wider events below are not local warnings.'}</p></div><button type="button" className="pv-text-link" disabled={busy || local} onClick={() => setRefresh(value => value + 1)}><Icon name="refresh" size={14}/>{busy ? 'Checking sources…' : 'Refresh briefing'}</button></header>
    {local ? <p className="pv-briefing-state">Live news needs the online site. Your watched cities remain in your saved plan.</p> : <>
      {locationError && <p className="pv-briefing-state is-attention" role="alert">{locationError}</p>}
      {!hasCity && <div className="pv-briefing-city-prompt"><Icon name="map" size={22}/><div><strong>Choose a city for local coverage</strong><p>{locations.length ? 'Select a city from your watchlist above. A city and country are needed to match local reports.' : 'Use Add city above to follow a place you care about. You can switch between watched cities without changing your planning area.'}</p></div></div>}
      <div className="pv-briefing-filters"><label>Topic<select value={topic} onChange={event => setTopic(event.target.value)}><option value="all">All preparedness topics</option>{Object.entries(BRIEFING_TOPICS).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label><label>Relevance<select value={selectedScope} onChange={event => setScope(event.target.value)}><option value="all">{hasCity ? 'All relevant · local first' : 'All relevant wider reports'}</option>{hasCity && <><option value="local">Local &amp; regional</option><option value="national">National</option></>}<option value="macro">Wider effects</option></select></label><p>{hasCity ? locations.length > 1 ? 'Choose another city in your watchlist to change this briefing.' : 'Reports are matched to the selected city, its region and possible wider impacts.' : 'Choose a city to include local, regional and national matches.'}</p></div>
      <p className="pv-briefing-privacy"><Icon name="lock" size={13}/><span>News searches use your city, region and country, not an exact address or coordinates.</span></p>
      {error && <p className="pv-briefing-state is-attention" role="alert">{error}{data ? ` Previously retrieved ${hasCity ? `reports for ${name}` : 'wider reports'} remain below.` : ''}</p>}
      {busy && !data && <p className="pv-briefing-state" role="status">{hasCity ? `Checking local sources for ${cityLabel} and relevant wider reports…` : 'Checking wider reports while you choose a city…'}</p>}
      {data && <>
        <div className="pv-briefing-status"><span>{stale ? 'Previous briefing · ' : 'Last checked '}{stamp(data.fetchedAt)}</span><span>{available} / {sources.length} sources checked</span>{hasCity && <span>{areaSources.length ? `${areaAvailable} / ${areaSources.length} local and regional feeds checked` : 'Local feed coverage unconfirmed'}</span>}{busy && <span>Refreshing this area…</span>}{unavailable.length > 0 && <button type="button" className="pv-text-link" onClick={showSources}>{unavailable.length} source checks unavailable · view coverage</button>}{!sources.length && <span>Source coverage unavailable</span>}</div>
        <p className="pv-briefing-coverage-note">Selected sources may miss local notices. No matching reports is not an all-clear; check official local alerts.</p>
        {(allFeedsFailed || localFeedsFailed) && <div className="pv-briefing-coverage-gap" role="status"><Icon name="bell" size={17}/><div><strong>{allFeedsFailed ? 'News sources are unavailable' : `Local coverage for ${name} is unavailable`}</strong><p>{allFeedsFailed ? 'No feeds could be checked. Try refreshing shortly.' : 'Local and regional feeds could not be checked. See Sources & coverage for details.'}</p></div></div>}
        {stale && !error && <p className="pv-briefing-state is-attention" role="status">This briefing may be out of date. Refresh or open the source before acting.</p>}
        <section className="pv-briefing-tldr" aria-label={hasCity ? `News TLDR for ${cityLabel}` : 'Wider news TLDR'}><div><span className="pv-briefing-eyebrow">TL;DR</span><h3>{hasCity ? 'What could matter here' : 'Wider events to follow'}</h3><p>Key reports and possible effects to watch. Open the source for the affected area and current advice.</p></div>{highlights.length > 0 ? <ol>{highlights.map(article => <li key={article.id}><div className="pv-briefing-meta"><span className="pv-briefing-scope">{article.relevance?.label || scopeLabels[article.relevance?.scope]}</span><span>{BRIEFING_TOPICS[article.topics[0]] || 'Update'}</span></div><a href={article.url} target="_blank" rel="noreferrer">{shortBriefingText(article)}<Icon name="arrow" size={13}/></a><small>{article.source} · <ArticleDate article={article}/></small><Relevance article={article} compact/></li>)}</ol> : <div className="pv-briefing-no-highlights"><p>{filtered ? 'No reports match these filters in the sources returned.' : 'No relevant reports were returned in this check.'}</p>{filtered && <button type="button" className="pv-text-link" onClick={resetFilters}>Show all relevant reports</button>}</div>}</section>
        {hasCity && ['all', 'local'].includes(selectedScope) && <ReportGroup key={`${locationKey}:${topic}:${selectedScope}:near`} articles={nearArticles} title={`In and around ${name}`} description="Reports mentioning the selected city or its region. Confirm the exact affected area in the source." emptyMessage={`No local or regional reports matched ${name}${topic !== 'all' ? ' and this topic' : ''} in the sources returned. Check local notices for the latest updates.`}/>}
        {selectedScope !== 'local' && <ReportGroup key={`${locationKey}:${topic}:${selectedScope}:wider`} articles={widerArticles} title={hasCity ? 'National & wider effects' : 'Wider events to follow'} description={hasCity ? 'National developments and events with possible knock-on effects for your plans.' : 'Selected reports with possible wider implications. Add a city to see local matches.'} emptyMessage="No national or wider-impact reports matched this selection in the sources returned."/>}
        {guides.length > 0 && <details className="pv-briefing-guidance"><summary><span><strong>Preparedness guidance for {countryName}</strong><small>Standing advice · not a new alert</small></span><Icon name="chevron" size={15}/></summary><div className="pv-briefing-guidance-grid">{guides.map(guide => <article key={guide.url}><h4><a href={guide.url} target="_blank" rel="noreferrer">{guide.title}<Icon name="arrow" size={14}/></a></h4><p>{guide.summary}</p></article>)}</div></details>}
        <details ref={sourcesRef} className="pv-briefing-sources"><summary>Sources &amp; coverage{unavailable.length > 0 ? ` · ${unavailable.length} unavailable` : ''}</summary><p>These are selected sources, and coverage can be delayed. Confirm the affected area in the original report.</p><ul>{sources.map((source, index) => <li key={`${source.name}-${index}`}><span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name}</span><span>{checkedSource(source) ? source.status === 'empty' ? 'Checked · no matching reports' : 'Checked' : source.error || 'Could not be checked'}</span></li>)}</ul>{data.attribution && <p>{data.attribution} <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noreferrer">Open Government Licence</a>.</p>}<p>Updates about every ten minutes while this page is visible, and when you return or reconnect. Official weather alerts are in Weather &amp; warnings for the selected city.</p></details>
      </>}
    </>}
  </section>;
}
