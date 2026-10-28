import { useEffect, useMemo, useState } from 'react';
import { Icon } from './brand.jsx';
import { isLocalEdition } from './runtime-mode.js';
import { BRIEFING_TOPICS, availableBriefingCountry, briefingHighlights, filterBriefing, getPreparednessBriefing, shortBriefingText } from './location-briefing.js';
import './location-briefing.css';

const stamp = value => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date unavailable';
const countryNames = { GB: 'United Kingdom', JP: 'Japan', CA: 'Canada', US: 'United States' };
function ArticleDate({ article }) {
  const value = article.publishedAt || article.observedAt;
  return <span>{article.publishedAt ? article.dateBasis === 'updated' ? 'Updated ' : 'Published ' : article.observedAt ? 'Indexed ' : ''}{value ? <time dateTime={value}>{stamp(value)}</time> : 'Date unavailable'}</span>;
}

export default function LocationBriefing({ locations = [] }) {
  const [data, setData] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0); const [topic, setTopic] = useState('all'); const [selectedCountry, setCountry] = useState('all');
  const [expanded, setExpanded] = useState(false); const [now, setNow] = useState(() => Date.now());
  const local = isLocalEdition();
  useEffect(() => {
    if (local) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true); setError('');
      getPreparednessBriefing({ signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); })
        .catch(problem => { if (!controller.signal.aborted) setError(problem.name === 'TimeoutError' ? 'The briefing took too long to load. Try refreshing.' : problem.message); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [local, refresh]);
  useEffect(() => {
    if (local) return;
    const update = () => { setNow(Date.now()); if (document.visibilityState === 'visible' && navigator.onLine !== false) setRefresh(value => value + 1); };
    const timer = setInterval(update, 600_000);
    const ageTimer = setInterval(() => setNow(Date.now()), 60_000);
    document.addEventListener('visibilitychange', update); window.addEventListener('online', update);
    return () => { clearInterval(timer); clearInterval(ageTimer); document.removeEventListener('visibilitychange', update); window.removeEventListener('online', update); };
  }, [local]);
  const watchedCountries = useMemo(() => [...new Set(locations.map(value => value.countryCode))], [locations]);
  const countries = useMemo(() => [...new Map([
    ...Object.entries(countryNames), ...locations.map(value => [value.countryCode, value.country]),
  ]).entries()], [locations]);
  const country = availableBriefingCountry(selectedCountry, countries.map(([code]) => code), watchedCountries.length > 0);
  const articles = filterBriefing(data?.articles || [], { topic, country, watchedCountries });
  const highlights = briefingHighlights(articles);
  const stale = Boolean(data && (error || now - Date.parse(data.fetchedAt) > 30 * 60_000));
  const unavailable = data?.sources.filter(source => !['ready', 'empty'].includes(source.status)) || [];
  const available = (data?.sources.length || 0) - unavailable.length;
  const resetFilters = () => { setTopic('all'); setCountry('all'); setExpanded(false); };
  return <section className="pv-briefing" aria-labelledby="pv-briefing-title">
    <header className="pv-briefing-heading"><div><p className="pv-briefing-eyebrow">THE WIDER PICTURE</p><h2 id="pv-briefing-title">Your preparedness brief</h2><p>Government updates, conflict, disasters and disruptions worth following.</p></div><button type="button" className="pv-text-link" disabled={busy || local} onClick={() => setRefresh(value => value + 1)}>{busy ? 'Checking sources…' : 'Refresh briefing'}</button></header>
    {local ? <p className="pv-briefing-state">Live news needs the online site. Your watched cities remain in your saved plan.</p> : <>
      <div className="pv-briefing-filters"><label>Topic<select value={topic} onChange={event => { setTopic(event.target.value); setExpanded(false); }}><option value="all">All preparedness topics</option>{Object.entries(BRIEFING_TOPICS).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label><label>Coverage<select value={country} onChange={event => { setCountry(event.target.value); setExpanded(false); }}><option value="all">Worldwide</option>{watchedCountries.length > 0 && <option value="watched">My watched countries</option>}{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><p>World coverage stays on even when you follow one city. Country filters match places mentioned in reports.</p></div>
      {error && <p className="pv-briefing-state" role="alert">{error}{data ? ' Previously retrieved reports remain below.' : ''}</p>}
      {busy && !data && <p className="pv-briefing-state" role="status">Checking current reports and official updates…</p>}
      {data && <>
        <div className="pv-briefing-status"><span>{stale ? 'Previous briefing · ' : 'Last checked '}{stamp(data.fetchedAt)}</span><span>{available} / {data.sources.length} sources available</span>{unavailable.length > 0 && <span>Some sources could not be checked</span>}</div>
        {stale && <p className="pv-briefing-state" role="status">This briefing may be out of date. Refresh or open the source before acting.</p>}
        <section className="pv-briefing-tldr" aria-label="Preparedness news TLDR"><div><span className="pv-briefing-eyebrow">TL;DR</span><h3>What to know</h3><p>Short source excerpts and headlines. Reports elsewhere are not warnings for your city.</p></div>{highlights.length > 0 ? <ol>{highlights.map(article => <li key={article.id}><div className="pv-briefing-meta"><span>{BRIEFING_TOPICS[article.topics[0]] || 'Update'}</span><span>{article.kind === 'official' ? 'Official update' : 'News report'}</span></div><a href={article.url} target="_blank" rel="noreferrer">{shortBriefingText(article)}<Icon name="arrow" size={13}/></a><small>{article.source} · <ArticleDate article={article}/></small></li>)}</ol> : <p className="pv-briefing-state">{country !== 'all' || topic !== 'all' ? 'No matching reports in the sources returned. This does not mean there are no risks or warnings.' : 'No current reports were returned. Check the source status below; this is not an all-clear.'}{(country !== 'all' || topic !== 'all') && <button type="button" className="pv-text-link" onClick={resetFilters}>Show all reports</button>}</p>}</section>
        {articles.length > 0 && <section className="pv-briefing-reports" aria-label="Preparedness news reports"><div className="pv-briefing-section-heading"><h3>Latest reports</h3><span>{articles.length} matching</span></div><div>{articles.slice(0, expanded ? 40 : 8).map(article => <article key={article.id}><div className="pv-briefing-meta"><span>{article.source}</span><span>{article.kind === 'official' ? 'Official publication' : 'News coverage'}</span><ArticleDate article={article}/></div><h4><a href={article.url} target="_blank" rel="noreferrer">{article.title}<Icon name="arrow" size={15}/></a></h4>{article.summary && <p>{shortBriefingText(article)}</p>}<div className="pv-briefing-tags">{article.topics.map(value => <span key={value}>{BRIEFING_TOPICS[value]}</span>)}</div></article>)}</div>{articles.length > 8 && <button type="button" className="pv-text-link" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer reports' : `Show more reports (${Math.min(articles.length, 40)})`}</button>}</section>}
        {data.guidance.length > 0 && <section className="pv-briefing-guidance" aria-label="Standing preparedness guidance"><div className="pv-briefing-section-heading"><h3>What governments recommend</h3><span>Standing advice · not a new alert</span></div><div>{data.guidance.map(guide => <article key={guide.url}><span>{countryNames[guide.country] || guide.country}</span><h4><a href={guide.url} target="_blank" rel="noreferrer">{guide.title}<Icon name="arrow" size={14}/></a></h4><p>{guide.summary}</p></article>)}</div></section>}
        <details className="pv-briefing-sources"><summary>Sources & coverage{unavailable.length > 0 ? ` · ${unavailable.length} unavailable` : ''}</summary><p>This briefing collects selected sources, not every report. Feed delays and gaps are possible. Official publications may describe events abroad or general policy; local instructions are shown separately with your city.</p><ul>{data.sources.map((source, index) => <li key={`${source.name}-${index}`}><span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name}</span><span>{['ready', 'empty'].includes(source.status) ? source.status === 'empty' ? 'Checked · no matching reports' : 'Checked' : source.error || 'Could not be checked'}</span></li>)}</ul>{data.attribution && <p>{data.attribution} <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noreferrer">Open Government Licence</a>.</p>}<p>Updates every ten minutes while this page is open. TL;DR uses the returned headline or excerpt, without adding claims or predicting your personal risk.</p></details>
      </>}
    </>}
  </section>;
}
