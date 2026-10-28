import { useId, useState } from 'react';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import FoodWaterInfo from './FoodWaterInfo.jsx';
import './people.css';

const EMPTY_PERSON = {
  name: '', group: 'Your Group', role: '', phone: '', address: '', age: '',
  bloodType: 'Unknown', medical: 'None', allergies: 'None', skills: '', notes: '', isDependant: false,
};
const BLOOD_TYPES = ['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const groupName = person => person.group?.trim() || 'Ungrouped';
const hasCareNote = value => Boolean(value != null && String(value).trim() && !['none', 'unknown', 'n/a'].includes(String(value).trim().toLowerCase()));
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const personId = () => `ct-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

function PersonDialog({ person, groups, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY_PERSON, ...person }));
  const [error, setError] = useState('');
  const ref = useDialogFocus(onClose);
  const id = useId();
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const save = event => {
    event.preventDefault();
    const name = String(draft.name ?? '').trim();
    if (!name) { setError('Enter a name for this person.'); return; }
    const ageText = String(draft.age ?? '').trim();
    const age = ageText === '' ? '' : /^\d+$/.test(ageText) ? Number(ageText) : ageText;
    onSave({ ...draft, name, group: String(draft.group ?? '').trim() || 'Your Group', age });
  };
  const field = (key, label, options = {}) => (
    <label className={`pv-people-field ${options.wide ? 'is-wide' : ''}`}>
      <span>{label}{options.required && <span className="pv-people-required"> · required</span>}</span>
      <input value={draft[key] ?? ''} onChange={event => update(key, event.target.value)} type={options.type || 'text'} inputMode={options.inputMode} required={options.required} maxLength={options.maxLength || 200} autoComplete={options.autoComplete || 'off'} list={options.list} />
    </label>
  );
  return <div className="pv-people-backdrop" onClick={onClose}>
    <section ref={ref} className="pv-people-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={event => event.stopPropagation()}>
      <header className="pv-people-dialog-heading">
        <div><span className="pv-people-eyebrow">YOUR DIRECTORY</span><h2 id={`${id}-title`}>{person ? 'Edit person' : 'Add a person'}</h2><p>Keep the details you need, together.</p></div>
        <button className="pv-people-icon-button" aria-label="Close person form" onClick={onClose}><Icon name="close" size={19}/></button>
      </header>
      <form onSubmit={save}>
        <div className="pv-people-form-grid">
          {field('name', 'Full name', { required: true, autoComplete: 'name' })}
          {field('role', 'Role', { maxLength: 120 })}
          {field('group', 'Group', { list: `${id}-groups` })}
          <datalist id={`${id}-groups`}>{groups.map(group => <option key={group} value={group}/>)}</datalist>
          {field('phone', 'Phone or contact method', { type: 'text', autoComplete: 'tel' })}
          {field('address', 'Address', { wide: true, autoComplete: 'street-address' })}
        </div>
        <div className="pv-people-dependant-field">
          <button type="button" className="pv-people-dependant" aria-pressed={draft.isDependant === true} aria-describedby={`${id}-dependant-note`} onClick={() => update('isDependant', draft.isDependant !== true)}><Icon name={draft.isDependant === true ? 'check' : 'plus'} size={14}/>Dependant</button>
          <p id={`${id}-dependant-note`}>Include this person in your food and water plan. Mark yourself too if you use these supplies.</p>
        </div>
        <details className="pv-people-optional">
          <summary>Care & background <span>Optional details</span></summary>
          <div className="pv-people-form-grid">
            {field('age', 'Age', { inputMode: 'numeric', maxLength: 30 })}
            <label className="pv-people-field"><span>Blood type</span><select value={draft.bloodType || 'Unknown'} onChange={event => update('bloodType', event.target.value)}>{[...new Set([...BLOOD_TYPES, draft.bloodType].filter(Boolean))].map(type => <option key={type}>{type}</option>)}</select></label>
            {field('medical', 'Medical conditions', { maxLength: 1000 })}
            {field('allergies', 'Allergies', { maxLength: 1000 })}
            <label className="pv-people-field is-wide"><span>Skills & experience</span><textarea value={draft.skills ?? ''} onChange={event => update('skills', event.target.value)} rows={2} maxLength={3000}/></label>
            <label className="pv-people-field is-wide"><span>Notes</span><textarea value={draft.notes ?? ''} onChange={event => update('notes', event.target.value)} rows={3} maxLength={5000}/></label>
          </div>
        </details>
        {error && <p className="pv-people-form-error" role="alert">{error}</p>}
        <footer className="pv-people-dialog-actions"><button className="pv-button pv-secondary" type="button" onClick={onClose}>Cancel</button><button className="pv-button pv-primary" type="submit">{person ? 'Save changes' : 'Add person'}</button></footer>
      </form>
    </section>
  </div>;
}

function PersonDetails({ person, onEdit, onRemove, id }) {
  const details = [
    ['Phone / contact', person.phone], ['Address', person.address], ['Age', person.age],
    ['Blood type', person.bloodType], ['Medical conditions', person.medical], ['Allergies', person.allergies],
    ['Skills & experience', person.skills], ['Notes', person.notes],
  ];
  return <div className="pv-people-details" id={id}>
    <dl>{details.map(([label, value]) => <div key={label} className={label === 'Notes' || label === 'Skills & experience' ? 'is-wide' : ''}><dt>{label}</dt><dd>{value === '' || value == null ? 'Not recorded' : value}</dd></div>)}</dl>
    <div className="pv-people-detail-actions"><button className="pv-button pv-secondary" onClick={onEdit}><Icon name="edit" size={15}/>Edit person</button><button className="pv-people-text-button" onClick={onRemove} aria-label={`Remove ${person.name}`}><Icon name="trash" size={15}/>Remove person</button></div>
  </div>;
}

export default function PeopleDirectory({ contacts, setContacts }) {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [editor, setEditor] = useState(null);
  const [removed, setRemoved] = useState(null);
  const [message, setMessage] = useState('');
  const id = useId();
  const groups = [...new Set(contacts.map(groupName))];
  const query = search.trim().toLowerCase();
  const filtered = contacts.filter(person => (!selectedGroup || groupName(person) === selectedGroup) && (!query || ['name', 'group', 'role', 'phone', 'medical', 'allergies', 'skills', 'notes'].some(field => String(person[field] || '').toLowerCase().includes(query))));
  const visibleGroups = [...new Set(filtered.map(groupName))];
  const dependantCount = contacts.filter(person => person.isDependant === true).length;
  const toggleDependant = person => {
    setContacts(current => current.map(contact => contact.id === person.id ? { ...contact, isDependant: contact.isDependant !== true } : contact));
    setMessage(`${person.name} ${person.isDependant === true ? 'is no longer marked as a dependant' : 'marked as a dependant'}.`);
  };
  const save = draft => {
    const saved = { ...draft, id: editor.person?.id || personId() };
    setContacts(current => editor.person ? current.map(person => person.id === saved.id ? { ...person, ...saved } : person) : [...current, saved]);
    setEditor(null);
    setExpanded(saved.id);
    setSearch('');
    setSelectedGroup('');
    setMessage(`${saved.name} ${editor.person ? 'updated' : 'added'}.`);
  };
  const remove = person => {
    setRemoved({ person, index: contacts.findIndex(contact => contact.id === person.id) });
    setContacts(current => current.filter(contact => contact.id !== person.id));
    setExpanded(null);
    setMessage('');
  };
  const undo = () => {
    const { person, index } = removed;
    setContacts(current => {
      if (current.some(contact => contact.id === person.id)) return current;
      const next = [...current];
      next.splice(Math.min(index, next.length), 0, person);
      return next;
    });
    setRemoved(null);
    setSearch('');
    setSelectedGroup('');
    setExpanded(person.id);
    setMessage(`${person.name} restored.`);
  };
  return <section className="pv-people-directory" aria-label="People directory">
    <div className="pv-people-plan-summary"><div><strong>{dependantCount} {dependantCount === 1 ? 'dependant' : 'dependants'} for food & water</strong><span id={`${id}-planning-note`}>{dependantCount ? 'Only marked dependants count toward these supplies.' : 'Mark people as dependants to calculate your food and water coverage.'}</span></div><FoodWaterInfo /></div>
    <div className="pv-people-toolbar">
      <label className="pv-people-search"><Icon name="search" size={18}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find someone…" aria-label="Search people"/>{search && <button aria-label="Clear people search" onClick={() => setSearch('')}><Icon name="close" size={15}/></button>}</label>
      <select className="pv-people-group-filter" value={selectedGroup} onChange={event => setSelectedGroup(event.target.value)} aria-label="Filter people by group"><option value="">All groups</option>{groups.map(group => <option key={group}>{group}</option>)}{selectedGroup && !groups.includes(selectedGroup) && <option>{selectedGroup}</option>}</select>
      <button className="pv-button pv-primary" onClick={() => setEditor({ person: null })}><Icon name="plus" size={17}/>Add person</button>
    </div>
    <div className="pv-people-directory-meta"><span>{filtered.length} {filtered.length === 1 ? 'person' : 'people'}{search || selectedGroup ? ` of ${contacts.length}` : ' in your directory'}</span><span>Select a person to view details</span></div>
    <div role="status" className={removed || message ? 'pv-people-feedback' : 'pv-people-feedback is-empty'}>{removed ? <><span>{removed.person.name} removed.</span><button className="pv-people-text-button" onClick={undo}>Undo</button><button className="pv-people-icon-button" aria-label="Dismiss removal notice" onClick={() => setRemoved(null)}><Icon name="close" size={15}/></button></> : message}</div>
    {visibleGroups.map(group => <section key={group} className="pv-people-group" aria-label={group}>
      <header><h2>{group}</h2><span>{filtered.filter(person => groupName(person) === group).length}</span></header>
      <div className="pv-people-list">{filtered.filter(person => groupName(person) === group).map(person => {
        const isExpanded = expanded === person.id;
        const detailsId = `${id}-${person.id}`;
        return <article className={`pv-people-person ${isExpanded ? 'is-expanded' : ''}`} key={person.id}>
          <div className="pv-people-person-heading">
          <button className="pv-people-row" onClick={() => setExpanded(isExpanded ? null : person.id)} aria-expanded={isExpanded} aria-controls={isExpanded ? detailsId : undefined} aria-label={`Details for ${person.name}`} aria-describedby={`${detailsId}-role ${detailsId}-contact ${detailsId}-care`}>
            <span className="pv-people-initials" aria-hidden="true">{initials(person.name)}</span>
            <span className="pv-people-identity"><strong>{person.name}</strong><span id={`${detailsId}-role`}>{person.role || 'No role recorded'}</span></span>
            <span className="pv-people-contact" id={`${detailsId}-contact`}>{person.phone || 'No contact method recorded'}</span>
            <span className="pv-people-care" id={`${detailsId}-care`}>{(hasCareNote(person.medical) || hasCareNote(person.allergies)) && <><Icon name="shield" size={14}/>Care notes</>}</span>
            <Icon name="chevron" size={17} className="pv-people-chevron"/>
          </button>
          <button type="button" className="pv-people-dependant" aria-label={`Dependant: ${person.name}`} aria-pressed={person.isDependant === true} aria-describedby={`${id}-planning-note`} onClick={() => toggleDependant(person)}><Icon name={person.isDependant === true ? 'check' : 'plus'} size={14}/>Dependant</button>
          </div>
          {isExpanded && <PersonDetails person={person} id={detailsId} onEdit={() => setEditor({ person })} onRemove={() => remove(person)}/>}
        </article>;
      })}</div>
    </section>)}
    {!filtered.length && <div className="pv-people-empty"><span><Icon name="users" size={27}/></span><h2>{contacts.length ? 'No matching people' : 'Keep your people close'}</h2><p>{contacts.length ? 'Try another name, role or group.' : 'Add the people you count on and keep their contact details in one place.'}</p>{contacts.length ? <button className="pv-button pv-secondary" onClick={() => { setSearch(''); setSelectedGroup(''); }}>Clear filters</button> : <button className="pv-button pv-primary" onClick={() => setEditor({ person: null })}>Add your first person</button>}</div>}
    {editor && <PersonDialog person={editor.person} groups={[...new Set(['Your Group', ...groups])]} onSave={save} onClose={() => setEditor(null)}/>}
  </section>;
}
