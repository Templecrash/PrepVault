import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import { BUG_OUT_LIMITS, BUG_OUT_STARTERS, MAX_BUG_OUT_ENTRIES, createBugOutEntry, moveBugOutEntry, restoreGrabbedChecks, toggleBugOutEntry } from './bug-out.js';
import { StatusPanel, StatusRing, StatusBar, StatusBreakdown } from './StatusCharts.jsx';
import { buildBugOutStatus, hasPlanningDetail, recordedPlanningAmount } from './household-status.js';
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
      <header><div><h2 id={`${id}-title`}>{entry ? 'Edit grab item' : 'Add a grab item'}</h2></div><button type="button" className="pv-bugout-icon" aria-label="Close grab item form" onClick={onClose}><Icon name="close" size={20}/></button></header>
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
  const [reviewOnly, setReviewOnly] = useState(false);
  const [grabMode, setGrabMode] = useState(false);
  const [editor, setEditor] = useState(null);
  const [undoAction, setUndoAction] = useState(null);
  const [notice, setNotice] = useState('');
  const id = useId();
  const summary = buildBugOutStatus(entries, items);
  const incomplete = entries.find(entry => ['quantity', 'location', 'assignee'].some(key => !hasPlanningDetail(entry[key])));
  const stockReview = summary.outOfStock + summary.unknownStock + summary.missingLink;
  const supplies = new Map(items.map(item => [item.id, item]));
  const stockNote = entry => {
    if (!entry.inventoryId) return '';
    const supply = supplies.get(entry.inventoryId);
    if (!supply) return 'Source no longer in inventory';
    const quantity = recordedPlanningAmount(supply.quantity);
    return quantity === null ? 'Source quantity not recorded' : quantity === 0 ? 'Source is out of stock' : '';
  };
  const search = query.trim().toLowerCase();
  const shown = entries.filter(entry => (!remainingOnly || !entry.grabbed) && (!reviewOnly || stockNote(entry)) && [entry.name, entry.quantity, entry.location, entry.assignee, entry.notes].join(' ').toLowerCase().includes(search));
  const full = entries.length >= MAX_BUG_OUT_ENTRIES;
  const save = entry => {
    if (!editor?.entry && full) { setNotice(`This checklist can hold up to ${MAX_BUG_OUT_ENTRIES} entries.`); setEditor(null); return; }
    setEntries(current => editor?.entry ? current.map(item => item.id === entry.id ? entry : item) : [...current, entry]);
    setEditor(null); setUndoAction(null); setNotice(`${entry.name} ${editor?.entry ? 'updated' : 'added'}.`); setQuery(''); setRemainingOnly(false); setReviewOnly(false);
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
  const switchGrabMode = () => { setGrabMode(current => !current); setQuery(''); setRemainingOnly(false); setReviewOnly(false); };
  const checkEntry = entryId => {
    setEntries(current => toggleBugOutEntry(current, entryId));
    setUndoAction(null); setNotice('');
  };
  const moveEntry = (entryId, direction) => {
    setEntries(current => moveBugOutEntry(current, entryId, direction));
    setUndoAction(null); setNotice('');
  };
  return <section className={`pv-bugout${grabMode ? ' is-grab-mode' : ''}`} aria-labelledby={`${id}-title`}>
    <header className="pv-bugout-heading"><div><h1 id={`${id}-title`}>Bug Out<span>.</span></h1><p>{grabMode ? 'Check each item when it is with you.' : 'What to grab, where to find it, and who brings it.'}</p></div><div className="pv-bugout-actions"><button type="button" className={`pv-button ${grabMode ? 'pv-secondary' : 'pv-primary'}`} aria-pressed={grabMode} onClick={switchGrabMode}><Icon name={grabMode ? 'edit' : 'check'} size={18}/>{grabMode ? 'Edit checklist' : 'Grab mode'}</button>{!grabMode && <button type="button" className="pv-button pv-secondary" disabled={full} onClick={() => setEditor({ entry: null })}><Icon name="plus" size={17}/>Add item</button>}</div></header>
    <StatusPanel title="Departure progress" summary={summary.total ? `${summary.grabbed} of ${summary.total} grabbed · ${summary.remaining} left to grab` : 'Your checklist is empty'} note="Checks track collection only; inventory quantities stay unchanged.">
      <StatusRing title="Departure checklist" value={summary.remaining} label="left to grab" emptyLabel="No checklist yet" segments={[
        { id: 'grabbed', label: 'Marked grabbed', value: summary.grabbed, tone: 'good' },
        { id: 'remaining', label: 'Still to grab', value: summary.remaining, tone: 'warning', onClick: () => { setRemainingOnly(true); setReviewOnly(false); setQuery(''); } },
      ]}/>
      <StatusBar title="Collection details" value={summary.detailed} max={summary.total} valueLabel={summary.total ? `${summary.detailed} of ${summary.total}` : 'No items yet'} targetLabel="items with amount, location and collector" tone={summary.total ? summary.missingDetails ? 'warning' : 'good' : 'unknown'} onClick={!grabMode && incomplete ? () => setEditor({ entry: incomplete }) : undefined} actionLabel="Complete the next item"/>
      <StatusBreakdown title="Linked supply checks" rows={[
        { id: 'stocked', label: 'Source has stock', value: summary.inStock, max: summary.total, tone: 'good' },
        { id: 'review', label: 'Source needs checking', value: stockReview, max: summary.total, tone: summary.outOfStock ? 'danger' : 'warning' },
        { id: 'custom', label: 'Custom / unlinked', value: summary.custom, max: summary.total, tone: 'unknown' },
      ]} note={stockReview ? `${summary.outOfStock} linked entries out of stock, ${summary.unknownStock} with unknown quantities and ${summary.missingLink} missing from inventory. Review the amount you need to take.` : 'Linked stock is a reference, not a reservation. Custom items need a separate stock check.'}/>
    </StatusPanel>
    {stockReview > 0 && <div className="pv-bugout-stock-notice" role="status"><p><strong>{stockReview} linked {stockReview === 1 ? 'supply needs' : 'supplies need'} checking.</strong> Stock is missing, empty or unrecorded.</p><button type="button" className="pv-bugout-text" onClick={() => { setReviewOnly(true); setRemainingOnly(false); setQuery(''); }}>Review items<Icon name="arrow" size={14}/></button></div>}
    <div className="pv-bugout-feedback" role="status">{notice && <><span>{notice}</span>{undoAction && <button type="button" className="pv-bugout-text" onClick={undo}>Undo</button>}<button type="button" className="pv-bugout-icon" aria-label="Dismiss checklist notice" onClick={() => { setNotice(''); setUndoAction(null); }}><Icon name="close" size={16}/></button></>}</div>
    {entries.length ? <div className="pv-bugout-workspace">
      <div className="pv-bugout-toolbar"><label className="pv-bugout-search"><Icon name="search" size={17}/><input type="search" placeholder="Find an item, place or person…" aria-label="Search Bug Out checklist" value={query} onChange={event => setQuery(event.target.value)}/></label><button type="button" className="pv-bugout-filter" aria-pressed={remainingOnly} onClick={() => { setRemainingOnly(current => !current); setReviewOnly(false); }}>{remainingOnly ? 'Show all items' : 'Only left to grab'}</button>{reviewOnly && <button type="button" className="pv-bugout-filter" onClick={() => setReviewOnly(false)}>Clear supply review</button>}{summary.grabbed > 0 && <button type="button" className="pv-bugout-text" onClick={reset}>Reset checks</button>}<span>{shown.length} {shown.length === 1 ? 'item' : 'items'}</span></div>
      <ol className="pv-bugout-list">{shown.map(entry => {
        const index = entries.findIndex(item => item.id === entry.id);
        return <li key={entry.id} className={entry.grabbed ? 'is-grabbed' : ''}>
          <button type="button" className="pv-bugout-check" aria-pressed={entry.grabbed} aria-label={`${entry.grabbed ? 'Mark not grabbed' : 'Mark grabbed'}: ${entry.name}`} onClick={() => checkEntry(entry.id)}><span>{entry.grabbed ? <Icon name="check" size={20}/> : index + 1}</span></button>
          <div className="pv-bugout-item"><div className="pv-bugout-item-title"><h2>{entry.name}</h2><span>{entry.quantity || 'Amount not set'}</span></div><dl><div><dt>Find it</dt><dd>{entry.location || 'Location not set'}</dd></div><div><dt>Who grabs it</dt><dd>{entry.assignee || 'Not assigned'}</dd></div></dl>{entry.notes && <p>{entry.notes}</p>}{stockNote(entry) && <small className="pv-bugout-stock-warning">{stockNote(entry)} · Check this item</small>}</div>
          {!grabMode && <div className="pv-bugout-item-actions"><button type="button" className="pv-bugout-icon" aria-label={`Move ${entry.name} earlier`} disabled={index === 0} onClick={() => moveEntry(entry.id, -1)}><Icon name="arrow" size={15} className="pv-bugout-up"/></button><button type="button" className="pv-bugout-icon" aria-label={`Move ${entry.name} later`} disabled={index === entries.length - 1} onClick={() => moveEntry(entry.id, 1)}><Icon name="arrow" size={15} className="pv-bugout-down"/></button><button type="button" className="pv-bugout-icon" aria-label={`Edit ${entry.name}`} onClick={() => setEditor({ entry })}><Icon name="edit" size={16}/></button><button type="button" className="pv-bugout-icon" aria-label={`Remove ${entry.name}`} onClick={() => remove(entry)}><Icon name="trash" size={16}/></button></div>}
        </li>;
      })}</ol>
      {!shown.length && <div className="pv-bugout-empty-filter"><h2>{remainingOnly && summary.remaining === 0 ? 'Everything is marked grabbed.' : 'No matching items'}</h2><p>{remainingOnly && summary.remaining === 0 ? 'Confirm everyone and everything is ready before leaving.' : 'Try another search or show your complete checklist.'}</p><button type="button" className="pv-button pv-secondary" onClick={() => { setQuery(''); setRemainingOnly(false); setReviewOnly(false); }}>Show all items</button></div>}
    </div> : <div className="pv-bugout-empty"><Icon name="list" size={32}/><h2>Make your leaving list.</h2><p>Add the items you will take, their exact locations and who will collect them. Your checklist is saved with your plan on this device.</p><div><button type="button" className="pv-button pv-primary" onClick={() => setEditor({ entry: null })}><Icon name="plus" size={16}/>Add your first item</button><button type="button" className="pv-button pv-secondary" onClick={useStarters}>Use starter suggestions</button></div><small>Starter suggestions are a planning template, not a record of supplies you own.</small></div>}
    {editor && <EntryDialog entry={editor.entry} items={items} contacts={contacts} onSave={save} onClose={() => setEditor(null)}/>}
  </section>;
}
