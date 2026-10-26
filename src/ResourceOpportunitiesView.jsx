import { Fragment, useId, useState } from 'react';
import { Icon } from './brand.jsx';
import './inventory.css';
import './resource-opportunities.css';

const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const scoreLabel = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function ResourceOpportunitiesView({ opportunities = [], dismissedOpps = [], setDismissedOpps, fragility = [], prepScore = 0 }) {
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [view, setView] = useState('active');
  const [sort, setSort] = useState('impact');
  const [expandedId, setExpandedId] = useState(null);
  const [lastDismissed, setLastDismissed] = useState(null);
  const id = useId();
  const dismissedIds = new Set(dismissedOpps);
  const active = opportunities.filter(opportunity => !dismissedIds.has(opportunity.id));
  const dismissed = opportunities.filter(opportunity => dismissedIds.has(opportunity.id));
  const potentialScore = active.length ? Math.min(100, Math.max(...active.map(opportunity => opportunity.scoreAfter))) : prepScore;
  const term = query.trim().toLowerCase();
  const filtersActive = Boolean(term) || priority !== 'all';
  const visible = (view === 'dismissed' ? dismissed : active).filter(opportunity => {
    if (priority !== 'all' && opportunity.priority !== priority) return false;
    return !term || [opportunity.title, opportunity.desc, opportunity.action, opportunity.category, opportunity.priority].join(' ').toLowerCase().includes(term);
  }).sort((a, b) => {
    if (sort === 'name') return a.title.localeCompare(b.title);
    if (sort === 'priority') return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || b.pointsGain - a.pointsGain;
    return b.pointsGain - a.pointsGain || a.title.localeCompare(b.title);
  });
  const clearFilters = () => { setQuery(''); setPriority('all'); };
  const dismiss = opportunity => {
    setDismissedOpps(previous => previous.includes(opportunity.id) ? previous : [...previous, opportunity.id]);
    setLastDismissed({ id: opportunity.id, title: opportunity.title });
    setExpandedId(null);
  };
  const restore = opportunityId => {
    setDismissedOpps(previous => previous.filter(value => value !== opportunityId));
    setLastDismissed(null);
    setExpandedId(null);
  };
  const feedback = lastDismissed && dismissedIds.has(lastDismissed.id) && opportunities.some(opportunity => opportunity.id === lastDismissed.id);

  return <section className="pv-inventory pv-resource-opportunities" aria-label="Planning opportunities">
    <div className="pv-resource-opportunity-summary">
      <div><span>Current score</span><strong>{scoreLabel(prepScore)}<small>/ 100</small></strong></div>
      <Icon name="arrow" size={18} />
      <div><span>Highest projected score</span><strong>{scoreLabel(potentialScore)}<small>/ 100</small></strong></div>
      <p>{active.length} active {active.length === 1 ? 'opportunity' : 'opportunities'}<span>Individual estimates; gains are not added together.</span></p>
    </div>

    {fragility.length > 0 && <details className="pv-resource-fragility">
      <summary><span><Icon name="shield" size={17} />System weaknesses</span><span>{fragility.length} to review<Icon name="chevron" size={15} /></span></summary>
      <ul>{fragility.map((finding, index) => <li key={`${finding.msg}-${index}`}><span className="pv-resource-priority">{finding.sev}</span><p>{finding.msg}</p></li>)}</ul>
    </details>}

    {feedback && <div className="pv-resource-opportunity-feedback" role="status"><span>{lastDismissed.title} dismissed.</span><button type="button" onClick={() => restore(lastDismissed.id)}>Undo</button></div>}

    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar">
        <div className="pv-inventory-search"><Icon name="search" size={18} /><input type="search" aria-label="Search opportunities" placeholder="Search opportunities or recommendations…" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="pv-inventory-filters">
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Filter opportunity priority</span><select value={priority} onChange={event => setPriority(event.target.value)}><option value="all">All priorities</option>{PRIORITIES.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Show active or dismissed opportunities</span><select value={view} onChange={event => { setView(event.target.value); setExpandedId(null); }}><option value="active">Active ({active.length})</option><option value="dismissed">Dismissed ({dismissed.length})</option></select></label>
        </div>
      </div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> {view === 'dismissed' ? 'dismissed ' : ''}{visible.length === 1 ? 'opportunity' : 'opportunities'}{filtersActive ? ' found' : ' to review'}{filtersActive && <button type="button" onClick={clearFilters}>Clear filters <Icon name="close" size={12} /></button>}</p><label className="pv-inventory-sort">Sort by <select aria-label="Sort opportunities" value={sort} onChange={event => setSort(event.target.value)}><option value="impact">Potential gain</option><option value="priority">Priority</option><option value="name">Name, A–Z</option></select></label></div>

      {visible.length > 0 ? <table className="pv-inventory-table pv-resource-opportunities-table">
        <thead><tr><th scope="col">Opportunity</th><th scope="col">Priority</th><th scope="col">Potential gain</th><th scope="col"><span className="pv-inventory-sr-only">Details</span></th></tr></thead>
        <tbody>{visible.map(opportunity => {
          const expanded = expandedId === opportunity.id;
          const panelId = `${id}-${opportunity.id}`;
          const toggle = () => setExpandedId(expanded ? null : opportunity.id);
          return <Fragment key={opportunity.id}>
            <tr className={`pv-resource-opportunity-row${expanded ? ' is-expanded' : ''}`}>
              <td className="pv-resource-opportunity-name"><div className="pv-inventory-item"><span className="pv-inventory-item-symbol" aria-hidden="true">{opportunity.icon}</span><div><button type="button" className="pv-inventory-item-name" onClick={toggle} aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}>{opportunity.title}</button>{view === 'dismissed' && <span className="pv-inventory-item-type">Dismissed</span>}</div></div></td>
              <td className="pv-resource-opportunity-priority" data-label="Priority"><span className="pv-resource-priority">{opportunity.priority}</span></td>
              <td className="pv-resource-opportunity-gain" data-label="Potential gain"><span>+{scoreLabel(opportunity.pointsGain)} points</span></td>
              <td className="pv-resource-opportunity-toggle"><button type="button" onClick={toggle} aria-label={`${expanded ? 'Hide' : 'Show'} ${opportunity.title} details`} aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}><Icon name="chevron" size={17} /></button></td>
            </tr>
            {expanded && <tr className="pv-resource-opportunity-detail-row"><td colSpan={4}><div className="pv-resource-opportunity-detail" id={panelId} role="region" aria-label={`${opportunity.title} recommendation`}>
              <div><h3>What to know</h3><p>{opportunity.desc}</p></div><div><h3>Recommended action</h3><p>{opportunity.action}</p></div>
              <div className="pv-resource-opportunity-impact"><span>Projected score <strong>{scoreLabel(opportunity.scoreNow)}</strong><Icon name="arrow" size={14} /><strong>{scoreLabel(opportunity.scoreAfter)}</strong></span><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => view === 'dismissed' ? restore(opportunity.id) : dismiss(opportunity)}><Icon name={view === 'dismissed' ? 'plus' : 'close'} size={14} />{view === 'dismissed' ? 'Restore opportunity' : 'Dismiss opportunity'}</button></div>
            </div></td></tr>}
          </Fragment>;
        })}</tbody>
      </table> : <div className="pv-inventory-empty"><span><Icon name={filtersActive ? 'search' : 'check'} size={28} /></span><h2>{filtersActive ? 'No opportunities match' : view === 'dismissed' ? 'No dismissed opportunities' : 'No active opportunities'}</h2><p>{filtersActive ? 'Try another search or clear your filters to see all opportunities in this view.' : view === 'dismissed' ? 'Dismissed suggestions will stay here so you can restore them later.' : dismissed.length > 0 ? 'You can review your dismissed suggestions or update your supplies as your plan changes.' : 'No suggestions were generated from your current inventory. Review your plan as your needs change.'}</p>{filtersActive ? <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={clearFilters}>Clear filters</button> : view === 'active' && dismissed.length > 0 ? <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setView('dismissed')}>Review dismissed</button> : null}</div>}

      <div className="pv-inventory-footer pv-resource-opportunity-footer"><span><Icon name="compass" size={15} />Scores are planning estimates based on your recorded supplies.</span>{view === 'dismissed' && dismissed.length > 0 && <button type="button" onClick={() => { setDismissedOpps([]); setLastDismissed(null); setExpandedId(null); }}>Restore all dismissed</button>}</div>
    </div>
  </section>;
}
