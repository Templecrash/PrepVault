import { Fragment, useId, useState } from 'react';
import { Icon } from './brand.jsx';
import { computeScenarioScore } from './scenario-score.js';
import './inventory.css';
import './specialist.css';

export default function ScenarioView({ items, people, setPeople, climate, setClimate, selScen, setSelScen, simDuration, setSimDuration, scenarios, climates, categories, recommendations, onSetup }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('score');
  const [expanded, setExpanded] = useState(null);
  const detailId = useId();
  const result = computeScenarioScore({ items, people, climate, scenarios, climates, categories }, selScen, simDuration);
  const scenario = scenarios[selScen];
  const recs = recommendations[selScen];
  const ranked = Object.entries(result.cats).sort((a, b) => a[1] - b[1]);
  const priorities = new Set(ranked.slice(0, 3).map(([key]) => key));
  const visible = ranked.filter(([key]) => (filter !== 'priority' || priorities.has(key)) && `${categories[key]?.label} ${recs?.byCategory?.[key] || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'name' ? categories[a[0]].label.localeCompare(categories[b[0]].label) : a[1] - b[1]);
  const clear = () => { setQuery(''); setFilter('all'); };
  return <section className="pv-inventory pv-specialist" aria-labelledby="scenario-title">
    <header className="pv-inventory-heading"><div><p className="pv-inventory-eyebrow">PRACTICE BEFORE YOU NEED IT</p><h1 id="scenario-title">Scenario lab<span>.</span></h1><p className="pv-inventory-intro">Explore a situation, adjust your assumptions, and see where your plan needs attention.</p></div>{onSetup && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onSetup}><Icon name="settings" size={17}/>Household setup</button>}</header>
    <div className="pv-inventory-overview">
      <div className="pv-inventory-stat"><span className="pv-inventory-stat-icon"><Icon name="compass" size={22}/></span><div><span className="pv-inventory-stat-value">{Math.round(result.score)}%<small>inventory score</small></span><p>Weighted for this scenario</p></div></div>
      <div className="pv-inventory-stat"><span className="pv-inventory-stat-icon"><Icon name="clock" size={22}/></span><div><span className="pv-inventory-stat-value">{simDuration}<small>days to plan for</small></span><p>{scenario?.label}</p></div></div>
      <div className="pv-inventory-stat"><span className="pv-inventory-stat-icon"><Icon name="users" size={22}/></span><div><span className="pv-inventory-stat-value">{people}<small>people</small></span><p>{climates[climate]?.label}</p></div></div>
    </div>
    <section className="pv-specialist-panel" aria-labelledby="scenario-assumptions"><div className="pv-specialist-section-heading"><div><h2 id="scenario-assumptions">Set the scene</h2><p>{scenario?.desc}</p></div></div>
      <div className="pv-specialist-form-grid pv-scenario-controls">
        <label>Scenario<select value={selScen} onChange={event => { setSelScen(event.target.value); setSimDuration(scenarios[event.target.value].defaultDur); }} aria-label="Scenario">{Object.entries(scenarios).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label>Climate<select value={climate} onChange={event => setClimate(event.target.value)} aria-label="Climate">{Object.entries(climates).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label>People <strong>{people}</strong><input type="range" aria-label="Household size" min="1" max="20" value={people} onChange={event => setPeople(Number(event.target.value))}/></label>
        <label>Duration <strong>{simDuration} days</strong><input type="range" aria-label="Scenario duration in days" min="1" max="1095" step="1" value={simDuration} onChange={event => setSimDuration(Number(event.target.value))}/></label>
      </div><p className="pv-specialist-note">People and climate use your household settings. Scores are planning estimates based on recorded inventory.</p>
    </section>
    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar"><div className="pv-inventory-search"><Icon name="search" size={18}/><input type="search" aria-label="Search scenario categories" placeholder="Search categories or recommendations…" value={query} onChange={event => setQuery(event.target.value)}/></div><label className="pv-inventory-select"><span className="pv-inventory-sr-only">Scenario category filter</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All categories</option><option value="priority">Three priority areas</option></select></label></div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> categories{(query || filter !== 'all') && <button type="button" onClick={clear}>Clear filters <Icon name="close" size={12}/></button>}</p><label className="pv-inventory-sort">Sort by <select aria-label="Sort scenario categories" value={sort} onChange={event => setSort(event.target.value)}><option value="score">Lowest score first</option><option value="name">Name, A–Z</option></select></label></div>
      {visible.length ? <table className="pv-inventory-table pv-specialist-table pv-scenario-table"><thead><tr><th scope="col">Category</th><th scope="col">Inventory score</th><th scope="col">Planning priority</th><th scope="col"><span className="pv-inventory-sr-only">Recommendations</span></th></tr></thead><tbody>{visible.map(([key, score]) => <Fragment key={key}><tr><td><button type="button" className="pv-inventory-item-name" aria-expanded={expanded === key} aria-controls={expanded === key ? `${detailId}-${key}` : undefined} onClick={() => setExpanded(expanded === key ? null : key)}>{categories[key]?.label}</button></td><td data-label="Inventory score"><div className="pv-specialist-meter"><span>{Math.round(score)}%</span><div aria-hidden="true"><i style={{ width: `${score}%` }}/></div></div></td><td data-label="Planning priority">{priorities.has(key) ? 'Priority area' : score < 30 ? 'Needs attention' : 'Review as needed'}</td><td className="pv-specialist-toggle"><button type="button" aria-label={`${expanded === key ? 'Hide' : 'Show'} ${categories[key]?.label} recommendations`} aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? null : key)}><Icon name="chevron" size={17}/></button></td></tr>{expanded === key && <tr className="pv-specialist-detail-row"><td colSpan="4"><div id={`${detailId}-${key}`}><h3>Planning notes</h3><p>{recs?.byCategory?.[key] || 'Review the supplies recorded in this category against your scenario and household needs.'}</p></div></td></tr>}</Fragment>)}</tbody></table> : <div className="pv-inventory-empty"><Icon name="search" size={28}/><h2>No categories match</h2><p>Try another search or clear your filters.</p><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={clear}>Clear filters</button></div>}
      <div className="pv-inventory-footer"><Icon name="compass" size={15}/><span>Open a category for its recommendations. Scores do not guarantee emergency readiness.</span></div>
    </div>
    {recs && <section className="pv-specialist-panel pv-scenario-actions" aria-labelledby="scenario-actions"><div className="pv-specialist-section-heading"><div><h2 id="scenario-actions">Actions for {scenario?.label}</h2><p>Start with these general steps, then review your priority categories.</p></div></div><ol>{recs.general.map((action, index) => <li key={index}>{action}</li>)}</ol></section>}
  </section>;
}
