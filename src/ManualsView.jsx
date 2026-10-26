import { Fragment, useId, useState } from 'react';
import { Icon } from './brand.jsx';
import './inventory.css';
import './manuals.css';

const CATEGORIES = { plumbing: 'Plumbing', seasonal: 'Seasonal care', hvac: 'Heating & cooling', electrical: 'Electrical', vehicle: 'Vehicles' };
const PRIORITIES = ['high', 'medium', 'low'];
const categoryName = category => CATEGORIES[category] || category || 'General';

export default function ManualsView({ manuals = [], onSetup, onEmergency }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('all');
  const [sort, setSort] = useState('name');
  const [expandedId, setExpandedId] = useState(null);
  const detailsId = useId();
  const vehicleCount = manuals.filter(manual => manual.cat === 'vehicle').length;
  const categories = [...new Set(manuals.map(manual => manual.cat))].sort((a, b) => categoryName(a).localeCompare(categoryName(b)));
  const filtersActive = Boolean(query.trim()) || category !== 'all' || priority !== 'all';
  const clearFilters = () => { setQuery(''); setCategory('all'); setPriority('all'); };
  const selectGroup = group => { clearFilters(); setCategory(group); };
  const visible = manuals.filter(manual => {
    if (category === 'household' ? manual.cat === 'vehicle' : category !== 'all' && manual.cat !== category) return false;
    if (priority !== 'all' && manual.priority !== priority) return false;
    return [manual.title, manual.desc, manual.file, categoryName(manual.cat), manual.priority].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    if (sort === 'priority') return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.title.localeCompare(b.title);
    if (sort === 'category') return categoryName(a.cat).localeCompare(categoryName(b.cat)) || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });

  return <section className="pv-inventory pv-manuals" aria-labelledby="manuals-title">
    <header className="pv-inventory-heading">
      <div><p className="pv-inventory-eyebrow">KNOW HOW THINGS WORK</p><h1 id="manuals-title">Your manuals<span>.</span></h1><p className="pv-inventory-intro">Household instructions and equipment references, all in one place.</p></div>
      <div className="pv-inventory-actions">
        {onSetup && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onSetup}><Icon name="settings" size={18}/>Household setup</button>}
        {onEmergency && <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={onEmergency}><Icon name="book" size={18}/>Emergency guides</button>}
      </div>
    </header>
    <div className="pv-inventory-overview">
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={!filtersActive} onClick={clearFilters}><span className="pv-inventory-stat-icon"><Icon name="book" size={22}/></span><div><span className="pv-inventory-stat-value">{manuals.length}<small>manual references</small></span><p>Your complete reference list</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={category === 'household'} onClick={() => selectGroup(category === 'household' ? 'all' : 'household')}><span className="pv-inventory-stat-icon"><Icon name="home" size={22}/></span><div><span className="pv-inventory-stat-value">{manuals.length - vehicleCount}<small>household references</small></span><p>Care for the systems you rely on</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={category === 'vehicle'} onClick={() => selectGroup(category === 'vehicle' ? 'all' : 'vehicle')}><span className="pv-inventory-stat-icon"><Icon name="compass" size={22}/></span><div><span className="pv-inventory-stat-value">{vehicleCount}<small>vehicle references</small></span><p>Operation, service and maintenance</p></div><Icon name="arrow" size={18}/></button>
    </div>
    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar">
        <div className="pv-inventory-search"><Icon name="search" size={18}/><input type="search" aria-label="Search manuals" placeholder="Search equipment, filenames or notes…" value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="pv-inventory-filters">
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Manual category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option><option value="household">Household systems</option>{categories.map(value => <option key={value} value={value}>{categoryName(value)}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Manual priority</span><select value={priority} onChange={event => setPriority(event.target.value)}><option value="all">All priorities</option>{PRIORITIES.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        </div>
      </div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? 'manual' : 'manuals'}{filtersActive ? ' found' : ' in your reference list'}{filtersActive && <button type="button" onClick={clearFilters}>Clear filters <Icon name="close" size={12}/></button>}</p><label className="pv-inventory-sort">Sort by <select aria-label="Sort manuals" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name, A–Z</option><option value="category">Category</option><option value="priority">Priority</option></select></label></div>
      {visible.length ? <table className="pv-inventory-table pv-manuals-table">
        <thead><tr><th scope="col">Manual</th><th scope="col">Category</th><th scope="col">Priority</th><th scope="col">File reference</th><th scope="col"><span className="pv-inventory-sr-only">Details</span></th></tr></thead>
        <tbody>{visible.map(manual => {
          const expanded = expandedId === manual.id;
          const toggle = () => setExpandedId(expanded ? null : manual.id);
          const id = `${detailsId}-${manual.id}`;
          return <Fragment key={manual.id}>
            <tr className={`pv-manuals-row${expanded ? ' is-expanded' : ''}`}>
              <td className="pv-manuals-name"><div className="pv-inventory-item"><span className="pv-inventory-item-symbol"><Icon name="book" size={19}/></span><button type="button" className="pv-inventory-item-name" onClick={toggle} aria-expanded={expanded} aria-controls={expanded ? id : undefined}>{manual.title}</button></div></td>
              <td className="pv-manuals-category" data-label="Category">{categoryName(manual.cat)}</td>
              <td className="pv-manuals-priority" data-label="Priority"><span>{manual.priority || 'Not set'}</span></td>
              <td className="pv-manuals-file" data-label="File reference"><span>{manual.file || 'Not recorded'}</span></td>
              <td className="pv-manuals-toggle"><button type="button" onClick={toggle} aria-label={`${expanded ? 'Hide' : 'Show'} ${manual.title} details`} aria-expanded={expanded} aria-controls={expanded ? id : undefined}><Icon name="chevron" size={17}/></button></td>
            </tr>
            {expanded && <tr className="pv-manuals-detail-row"><td colSpan={5}><div className="pv-manuals-detail" id={id} role="region" aria-label={`${manual.title} notes`}><h2>Reference notes</h2><p>{manual.desc || 'No notes recorded for this reference.'}</p></div></td></tr>}
          </Fragment>;
        })}</tbody>
      </table> : <div className="pv-inventory-empty"><span><Icon name="search" size={30}/></span><h2>{filtersActive ? 'No manuals match' : 'No manual references yet'}</h2><p>{filtersActive ? 'Try another search or clear your filters to see all references.' : 'Your household and equipment references will appear here.'}</p>{filtersActive && <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={clearFilters}>Clear filters</button>}</div>}
      <div className="pv-inventory-footer"><Icon name="book" size={15}/><span>Find downloadable handbooks and offline guides in Emergency.</span></div>
    </div>
  </section>;
}
