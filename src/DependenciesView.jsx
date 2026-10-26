import { Fragment, useMemo, useState } from 'react';
import { Icon } from './brand.jsx';
import { buildDependencyChecks } from './dependencies.js';
import './inventory.css';
import './dependencies.css';

const PRIORITIES = ['critical', 'high', 'medium', 'low'];

function DependencyDetails({ dependency }) {
  return <div className="pv-dependencies-detail" id={`dependency-${dependency.id}`} role="region" aria-label={`${dependency.name} guidance`}>
    <div><h2>What to know</h2><p>{dependency.desc}</p></div>
    <div><h2>How to prepare</h2><p>{dependency.fix}</p></div>
    <div className="pv-dependencies-chain" aria-label="Dependency chain">
      <span>{dependency.name}</span><Icon name="arrow" size={14}/><span>{dependency.depends}</span>
      {dependency.backup && <><Icon name="arrow" size={14}/><span>Possible backup: {dependency.backup}</span></>}
    </div>
  </div>;
}

export default function DependenciesView({ items = [], onSupplies, onSetup }) {
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [expandedId, setExpandedId] = useState(null);
  const dependencies = useMemo(() => buildDependencyChecks(items), [items]);
  const critical = dependencies.filter(item => item.risk === 'critical').length;
  const missing = dependencies.filter(item => !item.backup).length;
  const hidden = dependencies.filter(item => item.hidden).length;
  const filtersActive = Boolean(query.trim()) || priority !== 'all' || status !== 'all';
  const clearFilters = () => { setQuery(''); setPriority('all'); setStatus('all'); };
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return dependencies.filter(item => {
      if (priority !== 'all' && item.risk !== priority) return false;
      if (status === 'missing' && item.backup) return false;
      if (status === 'backup' && !item.backup) return false;
      if (status === 'hidden' && !item.hidden) return false;
      return !term || [item.name, item.depends, item.backup, item.desc, item.fix, item.risk, item.hidden ? 'hidden' : ''].join(' ').toLowerCase().includes(term);
    }).sort((a, b) => {
      if (sort === 'priority') return PRIORITIES.indexOf(a.risk) - PRIORITIES.indexOf(b.risk) || a.name.localeCompare(b.name);
      if (sort === 'backup') return Number(Boolean(a.backup)) - Number(Boolean(b.backup)) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [dependencies, query, priority, status, sort]);
  const quickFilter = (field, value) => {
    const selected = field === 'priority' ? priority === value && status === 'all' : status === value && priority === 'all';
    clearFilters();
    if (!selected) (field === 'priority' ? setPriority : setStatus)(value);
  };

  return <section className="pv-inventory pv-dependencies" aria-labelledby="dependencies-title">
    <header className="pv-inventory-heading">
      <div><p className="pv-inventory-eyebrow">KNOW WHAT YOU RELY ON</p><h1 id="dependencies-title">Your dependencies<span>.</span></h1><p className="pv-inventory-intro">See what keeps your household running, and where a backup could help.</p></div>
      <div className="pv-inventory-actions">
        {onSetup && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onSetup}><Icon name="settings" size={18}/>Household setup</button>}
        {onSupplies && <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={onSupplies}><Icon name="box" size={18}/>View supplies</button>}
      </div>
    </header>

    <div className="pv-inventory-overview">
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={priority === 'critical' && status === 'all'} onClick={() => quickFilter('priority', 'critical')}><span className="pv-inventory-stat-icon"><Icon name="shield" size={22}/></span><div><span className="pv-inventory-stat-value">{critical}<small>critical checks</small></span><p>Start with essential systems</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={status === 'missing' && priority === 'all'} onClick={() => quickFilter('status', 'missing')}><span className="pv-inventory-stat-icon"><Icon name="bolt" size={22}/></span><div><span className="pv-inventory-stat-value">{missing}<small>without a backup</small></span><p>No match in your selected supplies</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={status === 'hidden' && priority === 'all'} onClick={() => quickFilter('status', 'hidden')}><span className="pv-inventory-stat-icon"><Icon name="search" size={22}/></span><div><span className="pv-inventory-stat-value">{hidden}<small>hidden dependencies</small></span><p>Easy to overlook until an outage</p></div><Icon name="arrow" size={18}/></button>
    </div>

    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar">
        <div className="pv-inventory-search"><Icon name="search" size={18}/><input type="search" aria-label="Search dependencies" placeholder="Search systems, backups or guidance…" value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="pv-inventory-filters">
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Filter by priority</span><select value={priority} onChange={event => setPriority(event.target.value)}><option value="all">All priorities</option>{PRIORITIES.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Filter dependency status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All checks</option><option value="missing">No backup found</option><option value="backup">Possible backup</option><option value="hidden">Hidden dependencies</option></select></label>
        </div>
      </div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? 'dependency check' : 'dependency checks'}{filtersActive ? ' found' : ' for your household'}{filtersActive && <button type="button" onClick={clearFilters}>Clear filters <Icon name="close" size={12}/></button>}</p><label className="pv-inventory-sort">Sort by <select aria-label="Sort dependencies" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name, A–Z</option><option value="priority">Priority</option><option value="backup">No backup first</option></select></label></div>

      {visible.length ? <table className="pv-inventory-table pv-dependencies-table">
        <thead><tr><th scope="col">System</th><th scope="col">Depends on</th><th scope="col">Priority</th><th scope="col">Backup</th><th scope="col"><span className="pv-inventory-sr-only">Details</span></th></tr></thead>
        <tbody>{visible.map(dependency => {
          const expanded = expandedId === dependency.id;
          const toggle = () => setExpandedId(expanded ? null : dependency.id);
          return <Fragment key={dependency.id}>
            <tr className={`pv-dependencies-row${expanded ? ' is-expanded' : ''}`}>
              <td className="pv-dependencies-system"><div className="pv-inventory-item"><span className="pv-inventory-item-symbol" aria-hidden="true">{dependency.icon}</span><div><button type="button" className="pv-inventory-item-name" onClick={toggle} aria-expanded={expanded} aria-controls={expanded ? `dependency-${dependency.id}` : undefined}>{dependency.name}</button>{dependency.hidden && <span className="pv-inventory-item-type">Hidden dependency</span>}</div></div></td>
              <td className="pv-dependencies-requires" data-label="Depends on"><span>{dependency.depends}</span></td>
              <td className="pv-dependencies-priority" data-label="Priority"><span>{dependency.risk}</span></td>
              <td className="pv-dependencies-backup" data-label="Backup"><span className={`pv-inventory-status ${dependency.backup ? 'is-empty' : 'is-warning'}`}><i/>{dependency.backup || 'No backup found'}</span>{dependency.backup && <span className="pv-inventory-item-type">Possible match in supplies</span>}</td>
              <td className="pv-dependencies-toggle"><button type="button" onClick={toggle} aria-label={`${expanded ? 'Hide' : 'Show'} ${dependency.name} details`} aria-expanded={expanded} aria-controls={expanded ? `dependency-${dependency.id}` : undefined}><Icon name="chevron" size={17}/></button></td>
            </tr>
            {expanded && <tr className="pv-dependencies-detail-row"><td colSpan={5}><DependencyDetails dependency={dependency}/></td></tr>}
          </Fragment>;
        })}</tbody>
      </table> : <div className="pv-inventory-empty"><span><Icon name="search" size={30}/></span><h2>No dependencies match</h2><p>Try a different search or clear your filters to see all checks.</p><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={clearFilters}>Clear filters</button></div>}
      <div className="pv-inventory-footer"><Icon name="compass" size={15}/><span>Backup matches are inferred from your supplies. Check equipment, capacity and compatibility.</span></div>
    </div>
  </section>;
}
