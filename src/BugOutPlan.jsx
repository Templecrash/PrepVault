import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { BUG_OUT_LIMITS, BUG_OUT_STARTERS, MAX_BUG_OUT_ENTRIES, createBugOutEntry, moveBugOutEntry, restoreGrabbedChecks, summarizeBugOut, toggleBugOutEntry } from './bug-out.js';
import './bug-out.css';

const newId = () => `bo-${crypto.randomUUID()}`;
const EMPTY = { name: '', quantity: '', location: '', assignee: '', notes: '', grabbed: false };

function EntryDialog({ entry, items, contacts, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY, ...entry }));
  const [error, setError] = useState('');
  const id = useId();
  const ref = useDialogFocus(onClose);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const selectInventory = inventoryId => {
    const item = items.find(item => item.id === inventoryId);
    setDraft(current => item ? { ...current, inventoryId, name: item.name || '', location: item.location || '', quantity: current.quantity || '1' } : { ...current, inventoryId: '' });
  };
  const save = event => {
    event.preventDefault();
    try { onSave(createBugOutEntry(draft, entry?.id || newId())); }
    catch (failure) { setError(failure.message); }
  };
  return createPortal(<div className="pv-bugout-backdrop" onClick={onClose}>
    <section ref={ref} className="pv-bugout-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={event => event.stopPropagation()}>
      <header><div><span>MAKE LEAVING SIMPLER</span><h2 id={`${id}-title`}>{entry ? 'Edit grab item' : 'Add a grab item'}</h2></div><button type="button" className="pv-bugout-icon" aria-label="Close grab item form" onClick={onClose}><Icon name="close" size={20}/></button></header>
      <form onSubmit={save}>
        <label className="pv-bugout-field">Start from inventory <span>Optional</span><select value={draft.inventoryId || ''} onChange={event => selectInventory(event.target.value)}><option value="">Write a custom item</option>{draft.inventoryId && !items.some(item => item.id === draft.inventoryId) && <option value={draft.inventoryId}>Previously linked supply · no longer in inventory</option>}{items.map(item => <option value={item.id} key={item.id}>{item.name}{item.location ? ` · ${item.location}` : ''}</option>)}</select></label>
        <p className="pv-bugout-form-note">This copies a name and location. Choose what to take; your supply quantities stay unchanged.</p>
        <div className="pv-bugout-form-grid">
          <label className="pv-bugout-field is-wide">Item name<input autoComplete="off" required maxLength={BUG_OUT_LIMITS.name} value={draft.name} onChange={event => update('name', event.target.value)}/></label>
          <label className="pv-bugout-field">Amount to grab<input autoComplete="off" maxLength={BUG_OUT_LIMITS.quantity} placeholder="e.g. 2 bottles or 1 bag" value={draft.quantity} onChange={event => update('quantity', event.target.value)}/></label>
          <label className="pv-bugout-field">Who grabs it<input autoComplete="off" maxLength={BUG_OUT_LIMITS.assignee} list={`${id}-people`} placeholder="Name or role" value={draft.assignee} onChange={event => update('assignee', event.target.value)}/><datalist id={`${id}-people`}>{[...new Set(contacts.map(person => person.name).filter(Boolean))].map(name => <option key={name} value={name}/>)}</datalist></label>
          <label className="pv-bugout-field is-wide">Where to find it<input autoComplete="off" maxLength={BUG_OUT_LIMITS.location} placeholder="e.g. Hall closet, top shelf" value={draft.location} onChange={event => update('location', event.target.value)}/></label>
          <label className="pv-bugout-field is-wide">Notes<textarea rows={3} maxLength={BUG_OUT_LIMITS.notes} placeholder="Anything you need to remember when leaving" value={draft.notes} onChange={event => update('notes', event.target.value)}/></label>
        </div>
        {error && <p className="pv-bugout-error" role="alert">{error}</p>}
        <footer><button type="button" className="pv-button pv-secondary" onClick={onClose}>Cancel</button><button type="submit" className="pv-button pv-primary">{entry ? 'Save changes' : 'Add to checklist'}</button></footer>
      </form>
    </section>
  </div>, document.body);
}

export default function BugOutPlan({ entries = [], setEntries, items = [], contacts = [] }) {
  const [query, setQuery] = useState('');
  const [remainingOnly, setRemainingOnly] = useState(false);
  const [grabMode, setGrabMode] = useState(false);
  const [editor, setEditor] = useState(null);
  const [undoAction, setUndoAction] = useState(null);
  const [notice, setNotice] = useState('');
  const id = useId();
  const summary = summarizeBugOut(entries);
  const search = query.trim().toLowerCase();
  const shown = entries.filter(entry => (!remainingOnly || !entry.grabbed) && [entry.name, entry.quantity, entry.location, entry.assignee, entry.notes].join(' ').toLowerCase().includes(search));
  const full = entries.length >= MAX_BUG_OUT_ENTRIES;
  const save = entry => {
    if (!editor?.entry && full) { setNotice(`This checklist can hold up to ${MAX_BUG_OUT_ENTRIES} entries.`); setEditor(null); return; }
    setEntries(current => editor?.entry ? current.map(item => item.id === entry.id ? entry : item) : [...current, entry]);
    setEditor(null); setUndoAction(null); setNotice(`${entry.name} ${editor?.entry ? 'updated' : 'added'}.`); setQuery(''); setRemainingOnly(false);
  };
  const remove = entry => {
    setUndoAction({ type: 'remove', entry, index: entries.findIndex(item => item.id === entry.id) });
    setEntries(current => current.filter(item => item.id !== entry.id));
    setNotice(`${entry.name} removed.`);
  };
  const reset = () => {
    setUndoAction({ type: 'reset', ids: entries.filter(entry => entry.grabbed).map(entry => entry.id) });
    setEntries(current => current.map(entry => entry.grabbed ? { ...entry, grabbed: false } : entry));
    setNotice('Checks cleared for a new departure. Your checklist is unchanged.');
  };
  const undo = () => {
    if (undoAction.type === 'reset') setEntries(current => restoreGrabbedChecks(current, undoAction.ids));
    else if (undoAction.type === 'starters') setEntries(current => current.filter(entry => !undoAction.ids.includes(entry.id)));
    else setEntries(current => {
      if (current.some(entry => entry.id === undoAction.entry.id)) return current;
      const copy = [...current]; copy.splice(Math.min(undoAction.index, copy.length), 0, undoAction.entry); return copy;
    });
    setUndoAction(null); setNotice('Change undone.');
  };
  const useStarters = () => {
    const starters = BUG_OUT_STARTERS.map(entry => createBugOutEntry(entry, newId()));
    setEntries(current => current.length ? current : starters);
    setUndoAction({ type: 'starters', ids: starters.map(entry => entry.id) });
    setNotice('Starter suggestions added. Set amounts, locations and assignments for your household.');
  };
  const switchGrabMode = () => { setGrabMode(current => !current); setQuery(''); setRemainingOnly(false); };
  const checkEntry = entryId => {
    setEntries(current => toggleBugOutEntry(current, entryId));
    setUndoAction(null); setNotice('');
  };
  const moveEntry = (entryId, direction) => {
    setEntries(current => moveBugOutEntry(current, entryId, direction));
    setUndoAction(null); setNotice('');
  };
  return <section className={`pv-bugout${grabMode ? ' is-grab-mode' : ''}`} aria-labelledby={`${id}-title`}>
    <header className="pv-bugout-heading"><div><span className="pv-bugout-eyebrow">PLAN BEFORE YOU NEED IT</span><h1 id={`${id}-title`}>Bug Out<span>.</span></h1><p>Know what to grab, where it is, and who is bringing it.</p></div><div className="pv-bugout-actions"><button type="button" className={`pv-button ${grabMode ? 'pv-secondary' : 'pv-primary'}`} aria-pressed={grabMode} onClick={switchGrabMode}><Icon name={grabMode ? 'edit' : 'check'} size={18}/>{grabMode ? 'Edit checklist' : 'Grab mode'}</button>{!grabMode && <button type="button" className="pv-button pv-secondary" disabled={full} onClick={() => setEditor({ entry: null })}><Icon name="plus" size={17}/>Add item</button>}</div></header>
    <div className="pv-bugout-progress"><div><strong>{summary.remaining}</strong><span>left to grab</span></div><div className="pv-bugout-progress-main"><span><strong>{summary.grabbed} of {summary.total}</strong> marked grabbed</span><progress aria-label="Items marked grabbed" max={Math.max(summary.total, 1)} value={summary.grabbed}/><small>{grabMode ? 'Follow your list in order. Check each item when it is with you.' : 'Arrange your list in the order you want to collect it.'}</small></div>{summary.grabbed > 0 && <button type="button" className="pv-bugout-text" onClick={reset}><Icon name="refresh" size={15}/>Reset checks</button>}</div>
    <div className="pv-bugout-feedback" role="status">{notice && <><span>{notice}</span>{undoAction && <button type="button" className="pv-bugout-text" onClick={undo}>Undo</button>}<button type="button" className="pv-bugout-icon" aria-label="Dismiss checklist notice" onClick={() => { setNotice(''); setUndoAction(null); }}><Icon name="close" size={16}/></button></>}</div>
    {entries.length ? <div className="pv-bugout-workspace">
      <div className="pv-bugout-toolbar"><label className="pv-bugout-search"><Icon name="search" size={17}/><input type="search" placeholder="Find an item, place or person…" aria-label="Search Bug Out checklist" value={query} onChange={event => setQuery(event.target.value)}/></label><button type="button" className="pv-bugout-filter" aria-pressed={remainingOnly} onClick={() => setRemainingOnly(current => !current)}>{remainingOnly ? 'Show all items' : 'Only left to grab'}</button><span>{shown.length} {shown.length === 1 ? 'item' : 'items'}</span></div>
      <ol className="pv-bugout-list">{shown.map(entry => {
        const index = entries.findIndex(item => item.id === entry.id);
        return <li key={entry.id} className={entry.grabbed ? 'is-grabbed' : ''}>
          <button type="button" className="pv-bugout-check" aria-pressed={entry.grabbed} aria-label={`${entry.grabbed ? 'Mark not grabbed' : 'Mark grabbed'}: ${entry.name}`} onClick={() => checkEntry(entry.id)}><span>{entry.grabbed ? <Icon name="check" size={20}/> : index + 1}</span></button>
          <div className="pv-bugout-item"><div className="pv-bugout-item-title"><h2>{entry.name}</h2><span>{entry.quantity || 'Amount not set'}</span></div><dl><div><dt>Find it</dt><dd>{entry.location || 'Location not set'}</dd></div><div><dt>Who grabs it</dt><dd>{entry.assignee || 'Not assigned'}</dd></div></dl>{entry.notes && <p>{entry.notes}</p>}{!grabMode && entry.inventoryId && <small>{items.some(item => item.id === entry.inventoryId) ? 'Copied from inventory · review when supplies change' : 'Original supply no longer in inventory · check this item'}</small>}</div>
          {!grabMode && <div className="pv-bugout-item-actions"><button type="button" className="pv-bugout-icon" aria-label={`Move ${entry.name} earlier`} disabled={index === 0} onClick={() => moveEntry(entry.id, -1)}><Icon name="arrow" size={15} className="pv-bugout-up"/></button><button type="button" className="pv-bugout-icon" aria-label={`Move ${entry.name} later`} disabled={index === entries.length - 1} onClick={() => moveEntry(entry.id, 1)}><Icon name="arrow" size={15} className="pv-bugout-down"/></button><button type="button" className="pv-bugout-icon" aria-label={`Edit ${entry.name}`} onClick={() => setEditor({ entry })}><Icon name="edit" size={16}/></button><button type="button" className="pv-bugout-icon" aria-label={`Remove ${entry.name}`} onClick={() => remove(entry)}><Icon name="trash" size={16}/></button></div>}
        </li>;
      })}</ol>
      {!shown.length && <div className="pv-bugout-empty-filter"><h2>{remainingOnly && summary.remaining === 0 ? 'Everything is marked grabbed.' : 'No matching items'}</h2><p>{remainingOnly && summary.remaining === 0 ? 'This records your checklist progress; confirm everyone and everything is ready before leaving.' : 'Try another search or show your complete checklist.'}</p><button type="button" className="pv-button pv-secondary" onClick={() => { setQuery(''); setRemainingOnly(false); }}>Show all items</button></div>}
      <footer>Checks record what you have marked as grabbed. They do not change your inventory quantities.</footer>
    </div> : <div className="pv-bugout-empty"><Icon name="list" size={32}/><h2>Make your leaving list.</h2><p>Add the items you will take, their exact locations and who will collect them. Your checklist is saved with your plan on this device.</p><div><button type="button" className="pv-button pv-primary" onClick={() => setEditor({ entry: null })}><Icon name="plus" size={16}/>Add your first item</button><button type="button" className="pv-button pv-secondary" onClick={useStarters}>Use starter suggestions</button></div><small>Starter suggestions are a planning template, not a record of supplies you own.</small></div>}
    {editor && <EntryDialog entry={editor.entry} items={items} contacts={contacts} onSave={save} onClose={() => setEditor(null)}/>}
  </section>;
}
