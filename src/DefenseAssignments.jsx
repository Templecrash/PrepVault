import { Fragment, useId, useState } from 'react';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { groupPositionAssignments } from './defense-positions.js';
import './defense-assignments.css';

function AssignmentEditor({ record, members, onSave, onClose }) {
  const id = useId();
  const ref = useDialogFocus(onClose);
  const [draft, setDraft] = useState(() => Object.fromEntries(['assignee', 'assignmentRole', 'assignmentEquipment', 'notes'].map(key => [key, record.pin[key] || ''])));
  const names = [...new Set(members.map(member => member.name).filter(Boolean))];
  const change = key => event => setDraft(previous => ({ ...previous, [key]: event.target.value }));
  return <div className="pv-map-modal" onClick={onClose}><form ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); onSave(record, draft); }}>
    <span className="pv-eyebrow">{record.propertyName}</span><h2 id={`${id}-title`}>Edit assignment</h2><p className="pv-assignment-editor-place">{record.pin.label || 'Unnamed position'}</p>
    <label className="pv-field">Assigned to<input value={draft.assignee} onChange={change('assignee')} list={`${id}-people`} maxLength={120} placeholder="Leave blank if unassigned"/></label>
    <datalist id={`${id}-people`}>{names.map(name => <option key={name} value={name}/>)}</datalist>
    <label className="pv-field">Role or responsibility<input value={draft.assignmentRole} onChange={change('assignmentRole')} maxLength={200} placeholder="Describe the responsibility"/></label>
    <label className="pv-field">Equipment notes<input value={draft.assignmentEquipment} onChange={change('assignmentEquipment')} maxLength={500} placeholder="Optional equipment notes"/></label>
    <label className="pv-field">Position notes<textarea value={draft.notes} onChange={change('notes')} maxLength={3000} rows={3}/></label>
    <p className="pv-assignment-help">Saved with this map marker. A name records an assignment; it does not indicate live presence.</p>
    <div className="pv-map-actions"><button className="pv-button pv-primary" type="submit">Save assignment</button><button className="pv-button" type="button" onClick={onClose}>Cancel</button></div>
  </form></div>;
}

function PositionDetails({ record, onEdit, onMap, showHeading }) {
  const pin = record.pin;
  return <article className="pv-assignment-details">
    {showHeading && <h3>{pin.label || 'Unnamed position'}<small>{record.propertyName}</small></h3>}
    <dl><div><dt>Responsibility</dt><dd>{pin.assignmentRole?.trim() || 'Not recorded'}</dd></div><div><dt>Equipment notes</dt><dd>{pin.assignmentEquipment?.trim() || 'Not recorded'}</dd></div><div className="pv-assignment-notes"><dt>Position notes</dt><dd>{pin.notes || 'No notes recorded'}</dd></div></dl>
    <div className="pv-assignment-actions"><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => onEdit(record)}><Icon name="edit" size={15}/>Edit assignment</button><button type="button" className="pv-assignment-map-link" onClick={() => onMap(record.propertyId)}>Open property map <Icon name="arrow" size={14}/></button></div>
  </article>;
}

export default function DefenseAssignments({ records = [], pinTypes = [], members = [], sampleRoles = [], showProperties, onSave, onMap }) {
  const [view, setView] = useState('positions');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const id = useId();
  const typeName = pin => pinTypes.find(type => type.v === pin.type)?.l || 'Position';
  const assigned = records.filter(({ pin }) => pin.assignee?.trim()).length;
  const activeFilters = query.trim() || filter !== 'all';
  const clear = () => { setQuery(''); setFilter('all'); };
  const visible = records.filter(({ pin, propertyName }) => {
    if (filter === 'assigned' && !pin.assignee?.trim()) return false;
    if (filter === 'unassigned' && pin.assignee?.trim()) return false;
    return [pin.label, pin.assignee, pin.assignmentRole, pin.assignmentEquipment, pin.notes, propertyName, typeName(pin)].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  });
  const groups = groupPositionAssignments(visible);
  const unassigned = visible.filter(({ pin }) => !pin.assignee?.trim());
  if (unassigned.length) groups.push({ key: 'unassigned', name: 'Unassigned', positions: unassigned });
  const entries = view === 'positions' ? visible.map(record => ({ key: record.key, name: record.pin.label || 'Unnamed position', positions: [record] })) : groups;
  const toggle = key => setExpanded(previous => previous === key ? null : key);
  const expandedKey = key => `${view}-${key}`;

  return <section className="pv-inventory-workspace pv-assignments" aria-labelledby={`${id}-title`}>
    <header className="pv-assignment-heading"><div><p className="pv-inventory-eyebrow">PEOPLE & PLACES</p><h2 id={`${id}-title`}>Positions & assignments</h2><p>See who is assigned, what they are responsible for, and which places are unassigned.</p></div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => onMap()}><Icon name="map" size={16}/>Open map</button></header>
    <div className="pv-assignment-summary"><span><strong>{records.length}</strong> positions</span><span><strong>{assigned}</strong> assigned</span><span><strong>{records.length - assigned}</strong> unassigned</span><small>Recorded plan · no live presence status</small></div>
    <div className="pv-assignment-toolbar"><div className="pv-assignment-switch" aria-label="Assignment views">{[['positions', 'By position', 'map'], ['people', 'By person', 'users']].map(([key, label, icon]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => { setView(key); setExpanded(null); }}><Icon name={icon} size={15}/>{label}</button>)}</div><div className="pv-inventory-search"><Icon name="search" size={17}/><input type="search" aria-label="Search positions and assignments" placeholder="Search people, places or roles…" value={query} onChange={event => setQuery(event.target.value)}/></div><label className="pv-inventory-select"><span className="pv-inventory-sr-only">Assignment status</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All assignments</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label></div>
    {activeFilters && <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{visible.length}</strong> matching positions<button type="button" onClick={clear}>Clear filters <Icon name="close" size={12}/></button></p></div>}
    {entries.length ? <table className="pv-inventory-table pv-assignment-table"><thead><tr><th scope="col">{view === 'positions' ? 'Position' : 'Person'}</th><th scope="col">{view === 'positions' ? 'Assigned to' : 'Positions'}</th><th scope="col">Recorded role</th><th scope="col"><span className="pv-inventory-sr-only">Details</span></th></tr></thead><tbody>{entries.map((entry, index) => {
      const record = entry.positions[0];
      const key = expandedKey(entry.key);
      const open = expanded === key;
      const detailId = `${id}-details-${index}`;
      const roleNames = [...new Set(entry.positions.map(({ pin }) => pin.assignmentRole?.trim()).filter(Boolean))];
      return <Fragment key={entry.key}><tr className={open ? 'is-expanded' : undefined}><td><div className="pv-assignment-name"><span className="pv-inventory-item-symbol"><Icon name={view === 'positions' ? 'map' : 'users'} size={18}/></span><div><button type="button" className="pv-inventory-item-name" onClick={() => toggle(key)} aria-expanded={open} aria-controls={open ? detailId : undefined}>{entry.name}</button><small>{view === 'positions' ? `${typeName(record.pin)}${showProperties ? ` · ${record.propertyName}` : ''}` : `${entry.positions.length} ${entry.positions.length === 1 ? 'position' : 'positions'}`}</small></div></div></td><td data-label={view === 'positions' ? 'Assigned to' : 'Positions'}>{view === 'positions' ? <span className={!record.pin.assignee?.trim() ? 'pv-assignment-unassigned' : undefined}>{record.pin.assignee?.trim() || 'Unassigned'}</span> : entry.positions.map(position => <span className="pv-assignment-place" key={position.key}>{position.pin.label || 'Unnamed position'}{showProperties && <small>{position.propertyName}</small>}</span>)}</td><td data-label="Recorded role">{roleNames.length ? roleNames.join(' · ') : <span className="pv-assignment-muted">Not recorded</span>}</td><td className="pv-assignment-toggle"><button type="button" aria-label={`${open ? 'Hide' : 'Show'} ${entry.name} assignment details`} aria-expanded={open} onClick={() => toggle(key)}><Icon name="chevron" size={17}/></button></td></tr>{open && <tr className="pv-assignment-detail-row"><td colSpan={4}><div id={detailId} role="region" aria-label={`${entry.name} assignment details`}>{entry.positions.map(position => <PositionDetails key={position.key} record={position} showHeading={view === 'people'} onEdit={setEditing} onMap={onMap}/>)}</div></td></tr>}</Fragment>;
    })}</tbody></table> : <div className="pv-inventory-empty"><Icon name={records.length ? 'search' : 'map'} size={28}/><h3>{records.length ? 'No matching assignments' : 'Your positions start on the map'}</h3><p>{records.length ? 'Try another person, place or role, or clear the filter.' : 'Add positions to the Defense layer on your property map. Assign people and record responsibilities here.'}</p><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={records.length ? clear : () => onMap()}>{records.length ? 'Clear filters' : 'Open property map'}</button></div>}
    <div className="pv-assignment-footer" role="status">{notice || 'Open a row to edit its assignment or read position notes.'}</div>
    {sampleRoles.length > 0 && <details className="pv-assignment-examples"><summary>Example role reference <span>Sample plan only</span><Icon name="chevron" size={15}/></summary><p>These original examples are separate from your saved map assignments.</p><div>{sampleRoles.map(role => <article key={role.id}><strong>{role.name}</strong><span>{role.role}</span><small>{role.position} · {role.weapon}</small></article>)}</div></details>}
    {editing && <AssignmentEditor key={editing.key} record={editing} members={members} onClose={() => setEditing(null)} onSave={(record, patch) => { onSave(record, patch); setEditing(null); setNotice(`Assignment saved for ${record.pin.label || 'this position'}.`); }}/>} 
  </section>;
}
