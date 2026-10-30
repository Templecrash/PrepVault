import { useState } from 'react';
import { Icon } from './brand.jsx';
import GuideIllustration from './GuideIllustration.jsx';
import { FARM_GUIDE_VISUALS } from './farm-visuals.js';
import { FARM_GUIDES, FARM_GUIDE_GROUPS, FARM_GUIDE_CLIMATES, FARM_GUIDES_REVIEWED_AT, filterFarmGuides, farmGuidesToHtml } from './growing-library.js';
import './inventory.css';
import './growing-library.css';

const growingCount = FARM_GUIDES.filter(guide => !['livestock', 'farm-methods'].includes(guide.group)).length;
const animalCount = FARM_GUIDES.filter(guide => guide.group === 'livestock').length;
const methodCount = FARM_GUIDES.filter(guide => guide.group === 'farm-methods').length;

export default function GrowingLibrary({ onOpenFarm }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [climate, setClimate] = useState('all');
  const [scope, setScope] = useState('all');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const visible = filterFarmGuides({ query, group, climate, scope });
  const filtered = Boolean(query.trim()) || group !== 'all' || climate !== 'all' || scope !== 'all';
  const clearFilters = () => { setQuery(''); setGroup('all'); setClimate('all'); setScope('all'); };
  const selectScope = value => { clearFilters(); setScope(value); };
  const download = guides => {
    let url;
    try {
      url = URL.createObjectURL(new Blob([farmGuidesToHtml(guides)], { type: 'text/html;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = guides.length === 1 ? `prepvault-${guides[0].id}.html` : 'prepvault-growing-livestock.html';
      document.body.append(link); link.click(); link.remove();
      setError('');
      setNotice(`Download started for ${guides.length} ${guides.length === 1 ? 'guide' : 'guides'}. Keep the illustrated HTML file for offline reading or print it to PDF. Linked publisher manuals need a connection.`);
    } catch {
      setNotice(''); setError('The guide could not be downloaded. Try again in this browser.');
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  };

  return <section className="pv-inventory pv-growing-library" aria-labelledby="growing-library-title">
    <header className="pv-inventory-heading">
      <div><p className="pv-inventory-eyebrow">REFERENCE LIBRARY / FARM GUIDES</p><h1 id="growing-library-title">Growing & livestock<span>.</span></h1><p className="pv-inventory-intro">From the first seed to a healthy flock. Practical starting points, with trusted manuals when you need the detail.</p></div>
      <div className="pv-inventory-actions">
        {onOpenFarm && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onOpenFarm}><Icon name="leaf" size={17}/>Your farm</button>}
        <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={() => download(FARM_GUIDES)}><Icon name="download" size={17}/>Download all guides</button>
      </div>
    </header>

    <div className="pv-growing-collections" aria-label="Browse guide collections">
      {[['all', 'All guides', FARM_GUIDES.length, 'The complete collection'], ['grow', 'Grow food', growingCount, 'Vegetables, fruit, herbs & nuts'], ['livestock', 'Raise animals', animalCount, 'Housing, feeding & daily care'], ['farm-methods', 'Farm methods', methodCount, 'Soil, water, seeds & storage']].map(([value, label, count, description]) => <button type="button" key={value} aria-pressed={scope === value && group === 'all'} onClick={() => selectScope(value)}><span>{label}<strong>{count}</strong></span><small>{description}</small></button>)}
    </div>

    <p className="pv-growing-note"><Icon name="book" size={17}/><span>Use local frost dates and suitable varieties. Each full guide names its region; climate labels are a starting point, not a planting calendar.</span></p>
    {notice && <p className="pv-growing-notice" role="status"><Icon name="check" size={17}/>{notice}</p>}
    {error && <p className="pv-growing-notice" role="alert">{error}</p>}

    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar">
        <label className="pv-inventory-search"><Icon name="search" size={18}/><input type="search" aria-label="Search farm guides" placeholder="Search tomatoes, apples, chickens, soil…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <div className="pv-inventory-filters">
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Guide topic</span><select aria-label="Guide topic" value={group} onChange={event => { setGroup(event.target.value); setScope('all'); }}><option value="all">All topics</option>{Object.entries(FARM_GUIDE_GROUPS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Guide climate focus</span><select aria-label="Guide climate focus" value={climate} onChange={event => setClimate(event.target.value)}><option value="all">All climate focuses</option>{Object.entries(FARM_GUIDE_CLIMATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? 'guide' : 'guides'}{filtered ? ' found' : ' to explore'}{filtered && <button type="button" onClick={clearFilters}>Clear filters <Icon name="close" size={12}/></button>}</p><button className="pv-growing-text-button" type="button" disabled={!visible.length} onClick={() => download(visible)}><Icon name="download" size={14}/>Download {filtered ? 'these guides' : 'collection'}</button></div>
      {visible.length ? <div className="pv-growing-list">{visible.map(guide => <article className="pv-growing-item" key={guide.id}><details>
        <summary><span className="pv-growing-symbol"><Icon name={guide.group === 'livestock' ? 'home' : guide.group === 'farm-methods' ? 'book' : 'leaf'} size={20}/></span><span className="pv-growing-title"><small>{FARM_GUIDE_GROUPS[guide.group]}</small><strong>{guide.title}</strong><span>{guide.summary}</span></span><span className="pv-growing-meta"><span>{guide.season}</span><small>{FARM_GUIDE_CLIMATES[guide.climate]}</small></span><Icon name="chevron" size={17} className="pv-growing-chevron"/></summary>
        <div className="pv-growing-picture-wrap"><GuideIllustration visual={FARM_GUIDE_VISUALS[guide.id]}/></div>
        <div className="pv-growing-detail"><div><h2>Start here</h2><ol>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="pv-growing-caution">{guide.caution}</p><button className="pv-growing-text-button" type="button" onClick={() => download([guide])}><Icon name="download" size={15}/>Save this checklist offline</button></div><div><h2>Full guides & manuals</h2>{guide.sources.map(source => <a className="pv-growing-source" key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><span>ONLINE REFERENCE <Icon name="arrow" size={14}/></span><strong>{source.title}</strong><small>{source.publisher}</small><small>Region: {source.region}</small></a>)}</div></div>
      </details></article>)}</div> : <div className="pv-inventory-empty"><span><Icon name="search" size={30}/></span><h2>No guides match</h2><p>Try a crop, animal or method, or clear your filters to see the whole collection.</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={clearFilters}>Clear filters</button></div>}
      <footer className="pv-growing-footer"><Icon name="download" size={17}/><p>Downloaded checklists and their task pictures open without internet or sign-in, and are also included in the local app. Full publisher manuals are linked online; save them separately for offline use.<span>Sources checked {FARM_GUIDES_REVIEWED_AT} · A curated collection covering common crops and livestock.</span></p></footer>
    </div>
  </section>;
}
