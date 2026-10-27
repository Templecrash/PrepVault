import { Fragment, useId, useState } from 'react';
import { Icon } from './brand.jsx';
import './inventory.css';
import './codes.css';

const TYPES = { gate: 'Gate', safe: 'Safe', alarm: 'Alarm', wifi: 'Wi-Fi', radio: 'Radio' };
const typeName = value => TYPES[value] || value || 'Other';
const dateLabel = value => Number.isFinite(value) ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not recorded';

function rotationFor(code, now) {
  const changedAt = code.lastChanged ? new Date(code.lastChanged).valueOf() : NaN;
  if (!Number.isFinite(changedAt)) return { state: 'undated', label: 'No change date', days: null, changedAt, nextAt: null };
  const days = Math.floor((now - changedAt) / 86_400_000);
  if (days < 0) return { state: 'undated', label: 'Check change date', days: null, changedAt, nextAt: null };
  return { state: days > 30 ? 'overdue' : days > 25 ? 'soon' : 'current',
    label: days > 30 ? 'Rotation overdue' : days === 30 ? 'Rotate today' : days > 25 ? 'Due soon' : 'Up to date',
    days, changedAt, nextAt: changedAt + 30 * 86_400_000 };
}

export default function CodesView({ codes = [], setCodes, members = [], revealedCodes = {}, setRevealedCodes, onSetup }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [expandedId, setExpandedId] = useState(null);
  const [now] = useState(() => Date.now());
  const detailsId = useId();
  const records = codes.map(code => ({ code, rotation: rotationFor(code, now) }));
  const due = records.filter(({ rotation }) => rotation.state === 'overdue' || rotation.state === 'soon').length;
  const unassigned = codes.filter(code => !code.access?.length).length;
  const types = [...new Set(codes.map(code => code.type || 'other'))].sort((a, b) => typeName(a).localeCompare(typeName(b)));
  const filtersActive = Boolean(query.trim()) || type !== 'all' || status !== 'all';
  const clearFilters = () => { setQuery(''); setType('all'); setStatus('all'); };
  const quickFilter = value => { clearFilters(); setStatus(status === value && type === 'all' && !query.trim() ? 'all' : value); };
  const visible = records.filter(({ code, rotation }) => {
    if (type !== 'all' && (code.type || 'other') !== type) return false;
    if (status === 'due' && !['soon', 'overdue'].includes(rotation.state)) return false;
    if (status === 'unassigned' && code.access?.length) return false;
    if (!['all', 'due', 'unassigned'].includes(status) && rotation.state !== status) return false;
    // Search deliberately excludes code values and free-form notes. A hidden
    // value must not be discoverable through matching, sorting or DOM metadata.
    return [code.label, typeName(code.type), code.location, ...(code.access || [])].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    if (sort === 'rotation') return (b.rotation.days ?? Infinity) - (a.rotation.days ?? Infinity) || String(a.code.label || '').localeCompare(String(b.code.label || ''));
    if (sort === 'type') return typeName(a.code.type).localeCompare(typeName(b.code.type)) || String(a.code.label || '').localeCompare(String(b.code.label || ''));
    return String(a.code.label || '').localeCompare(String(b.code.label || ''));
  });
  const addHolder = (id, name) => {
    if (!members.some(member => member.name === name)) return;
    setCodes(previous => previous.map(code => code.id === id && !(code.access || []).includes(name) ? { ...code, access: [...(code.access || []), name] } : code));
  };
  const removeHolder = (id, name) => setCodes(previous => previous.map(code => code.id === id ? { ...code, access: (code.access || []).filter(holder => holder !== name) } : code));
  const isRevealed = id => Object.hasOwn(revealedCodes, id) && revealedCodes[id] === true;
  const anyRevealed = codes.some(code => isRevealed(code.id));

  return <section className="pv-inventory pv-codes" aria-labelledby={`${detailsId}-title`}>
    <header className="pv-inventory-heading">
      <div><p className="pv-inventory-eyebrow">KEEP ACCESS ORGANIZED</p><h1 id={`${detailsId}-title`}>Your codes<span>.</span></h1><p className="pv-inventory-intro">Access details, recorded holders and rotation reminders in one place.</p></div>
      <div className="pv-inventory-actions">
        {onSetup && <button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onSetup}><Icon name="settings" size={18}/>Household setup</button>}
        <button type="button" className="pv-inventory-button pv-inventory-button-secondary" disabled={!anyRevealed} onClick={() => setRevealedCodes({})}><Icon name="shield" size={18}/>Hide all codes</button>
      </div>
    </header>
    <div className="pv-inventory-overview">
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={!filtersActive} onClick={clearFilters}><span className="pv-inventory-stat-icon"><Icon name="key" size={22}/></span><div><span className="pv-inventory-stat-value">{codes.length}<small>access codes</small></span><p>Your complete access list</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={status === 'due' && type === 'all'} onClick={() => quickFilter('due')}><span className="pv-inventory-stat-icon"><Icon name="refresh" size={22}/></span><div><span className="pv-inventory-stat-value">{due}<small>due for rotation</small></span><p>Due soon or past the 30-day reminder</p></div><Icon name="arrow" size={18}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" aria-pressed={status === 'unassigned' && type === 'all'} onClick={() => quickFilter('unassigned')}><span className="pv-inventory-stat-icon"><Icon name="users" size={22}/></span><div><span className="pv-inventory-stat-value">{unassigned}<small>without a holder</small></span><p>Record who knows each code</p></div><Icon name="arrow" size={18}/></button>
    </div>
    <div className="pv-inventory-workspace">
      <div className="pv-inventory-toolbar">
        <div className="pv-inventory-search"><Icon name="search" size={18}/><input type="search" aria-label="Search code names, locations and holders" placeholder="Search names, locations or holders…" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="pv-inventory-filters">
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Code type</span><select value={type} onChange={event => setType(event.target.value)}><option value="all">All types</option>{types.map(value => <option key={value} value={value}>{typeName(value)}</option>)}</select></label>
          <label className="pv-inventory-select"><span className="pv-inventory-sr-only">Code status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All codes</option><option value="due">Rotation due</option><option value="overdue">Rotation overdue</option><option value="current">Up to date</option><option value="undated">Check change date</option><option value="unassigned">No recorded holder</option></select></label>
        </div>
      </div>
      <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? 'code' : 'codes'}{filtersActive ? ' found' : ' in your access list'}{filtersActive && <button type="button" onClick={clearFilters}>Clear filters <Icon name="close" size={12}/></button>}</p><label className="pv-inventory-sort">Sort by <select aria-label="Sort codes" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name, A–Z</option><option value="type">Type</option><option value="rotation">Rotation date</option></select></label></div>
      {visible.length ? <table className="pv-inventory-table pv-codes-table">
        <thead><tr><th scope="col">Access</th><th scope="col">Code</th><th scope="col">Holders</th><th scope="col">Rotation</th><th scope="col"><span className="pv-inventory-sr-only">Details</span></th></tr></thead>
        <tbody>{visible.map(({ code, rotation }) => {
          const expanded = expandedId === code.id;
          const revealed = isRevealed(code.id);
          const toggle = () => setExpandedId(expanded ? null : code.id);
          const regionId = `${detailsId}-${code.id}`;
          const label = code.label || 'Unnamed code';
          const holders = code.access || [];
          const availableMembers = members.filter((member, index) => member.name && !holders.includes(member.name) && members.findIndex(other => other.name === member.name) === index);
          return <Fragment key={code.id}>
            <tr className={`pv-codes-row${expanded ? ' is-expanded' : ''}`}>
              <td className="pv-codes-name"><div className="pv-inventory-item"><span className="pv-inventory-item-symbol"><Icon name="key" size={19}/></span><div><button type="button" className="pv-inventory-item-name" onClick={toggle} aria-expanded={expanded} aria-controls={expanded ? regionId : undefined}>{label}</button><span className="pv-inventory-item-type">{typeName(code.type)}</span></div></div></td>
              <td className="pv-codes-value-cell" data-label="Code"><div className="pv-codes-value-group"><span className={`pv-codes-value${revealed ? ' is-revealed' : ''}`} aria-label={revealed ? undefined : 'Code hidden'}>{revealed ? code.code || 'Not recorded' : '••••••'}</span><button type="button" className="pv-codes-text-button" aria-label={`${revealed ? 'Hide' : 'Reveal'} ${label} code`} aria-pressed={revealed} onClick={() => setRevealedCodes(previous => ({ ...previous, [code.id]: !(Object.hasOwn(previous, code.id) && previous[code.id] === true) }))}>{revealed ? 'Hide' : 'Reveal'}</button></div></td>
              <td className="pv-codes-holders-cell" data-label="Holders"><button type="button" className="pv-codes-holder-summary" onClick={toggle} aria-expanded={expanded} aria-controls={expanded ? regionId : undefined}>{holders.length ? `${holders.length} ${holders.length === 1 ? 'person' : 'people'}` : 'None recorded'}</button></td>
              <td className="pv-codes-rotation" data-label="Rotation"><span className={rotation.state === 'overdue' ? 'pv-codes-rotation-due' : ''}>{rotation.label}</span><small>{rotation.days !== null ? `Changed ${rotation.days} ${rotation.days === 1 ? 'day' : 'days'} ago` : 'Review the recorded date'}</small></td>
              <td className="pv-codes-toggle"><button type="button" onClick={toggle} aria-label={`${expanded ? 'Hide' : 'Show'} ${label} details`} aria-expanded={expanded} aria-controls={expanded ? regionId : undefined}><Icon name="chevron" size={17}/></button></td>
            </tr>
            {expanded && <tr className="pv-codes-detail-row"><td colSpan={5}><div className="pv-codes-detail" id={regionId} role="region" aria-label={`${label} details`}>
              <div className="pv-codes-record"><div><h2>Location</h2><p>{code.location || 'Not recorded'}</p></div><div><h2>Last changed</h2><p>{dateLabel(rotation.changedAt)}</p></div><div><h2>Rotation reminder</h2><p>{rotation.nextAt ? dateLabel(rotation.nextAt) : 'Add a valid change date to track rotation.'}</p>{rotation.days !== null && <small>{rotation.days > 30 ? `${rotation.days - 30} days past the 30-day reminder` : rotation.days === 30 ? 'Due today' : `Due in ${30 - rotation.days} days`}</small>}</div>{code.notes && <div className="pv-codes-notes"><h2>Notes</h2><p>{revealed ? code.notes : "Notes are hidden until you reveal this code."}</p></div>}</div>
              <div className="pv-codes-access"><div className="pv-codes-access-heading"><h2>Recorded holders</h2><span>{holders.length} {holders.length === 1 ? 'person' : 'people'}</span></div><div className="pv-codes-holder-list">{holders.length ? holders.map(person => <span className="pv-codes-holder" key={person}>{person}<button type="button" aria-label={`Remove ${person} from ${label} access list`} onClick={() => removeHolder(code.id, person)}><Icon name="close" size={13}/></button></span>) : <p>No holders recorded for this code.</p>}</div><label className="pv-codes-add-holder"><span className="pv-inventory-sr-only">Add someone to {label} access list</span><select value="" disabled={!availableMembers.length} onChange={event => addHolder(code.id, event.target.value)}><option value="">{availableMembers.length ? 'Add a holder…' : members.length ? 'All household members added' : 'No household members yet'}</option>{availableMembers.map(member => <option key={member.id || member.name} value={member.name}>{member.name}</option>)}</select></label><p className="pv-codes-access-note">This records who knows the code. Updating this list does not change access on your lock, alarm or account.</p></div>
            </div></td></tr>}
          </Fragment>;
        })}</tbody>
      </table> : <div className="pv-inventory-empty"><span><Icon name={filtersActive ? 'search' : 'key'} size={30}/></span><h2>{filtersActive ? 'No codes match' : 'No access codes yet'}</h2><p>{filtersActive ? 'Try another name, location or holder, or clear your filters.' : 'Your recorded access codes and the people who know them will appear here.'}</p>{filtersActive && <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={clearFilters}>Clear filters</button>}</div>}
      <div className="pv-inventory-footer"><Icon name="shield" size={15}/><span>Code values stay hidden until you choose Reveal. Search never includes code values.</span></div>
    </div>
  </section>;
}
