import { useState } from 'react';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';

export default function InventoryItemDialog({ onAdd, onClose, editItem, initialCategory, initialSubType, categories, fieldMeta, makeId }) {
  const dialogRef = useDialogFocus(onClose);
  const startingCategory = editItem?.category || initialCategory || 'water';
  const [category, setCategory] = useState(startingCategory);
  const [type, setType] = useState(editItem?.subType || initialSubType || Object.keys(categories[startingCategory].subTypes)[0]);
  const [quantity, setQuantity] = useState(String(editItem?.quantity ?? 1));
  const [name, setName] = useState(editItem?.name || '');
  const [location, setLocation] = useState(editItem?.location || '');
  const [fields, setFields] = useState(editItem?.fields || {});
  const [notes, setNotes] = useState(editItem?.notes || '');
  const [error, setError] = useState('');
  const definition = categories[category];
  const selectedType = definition.subTypes[type];
  const vehicle = category === 'vehicles';
  const updateField = (key, value) => setFields(previous => ({ ...previous, [key]: value }));
  const submit = event => {
    event.preventDefault();
    if (!selectedType || quantity.trim() === '' || !Number.isFinite(Number(quantity)) || Number(quantity) < 0) { setError('Enter a valid quantity of zero or more.'); return; }
    onAdd({ ...editItem, id: editItem?.id || makeId(), category, subType: type, name: name.trim() || selectedType.label, quantity: Number(quantity), location: location.trim(), notes, fields, addedDate: editItem?.addedDate || new Date().toISOString().slice(0, 10) });
    onClose();
  };
  return <div className="pv-modal-backdrop" onClick={onClose}>
    <section ref={dialogRef} className="pv-dialog pv-item-dialog" role="dialog" aria-modal="true" aria-labelledby="supply-dialog-title" onClick={event => event.stopPropagation()}>
      <header className="pv-dialog-heading"><div><span className="pv-eyebrow">YOUR INVENTORY</span><h2 id="supply-dialog-title">{editItem ? 'Edit' : 'Add'} {vehicle ? 'vehicle or spare' : category === 'power' ? 'power equipment' : 'a supply'}</h2><p className="pv-muted">{definition.desc}. Add what you know; update it anytime.</p></div><button type="button" className="pv-icon-button" aria-label="Close supply form" onClick={onClose}><Icon name="close"/></button></header>
      <form onSubmit={submit}>
        <div className="pv-item-form-grid">
          <label className="pv-field">Category<select value={category} onChange={event => { const next = event.target.value; setCategory(next); setType(Object.keys(categories[next].subTypes)[0]); if (!editItem) setFields({}); }}>{Object.entries(categories).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
          <label className="pv-field">Type<select value={type} onChange={event => setType(event.target.value)}>{Object.entries(definition.subTypes).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
          <label className="pv-field">Name<input value={name} placeholder={selectedType?.label || 'Item name'} maxLength={240} onChange={event => setName(event.target.value)}/></label>
          <label className="pv-field">Quantity<input type="number" min="0" step="any" required value={quantity} onChange={event => setQuantity(event.target.value)}/></label>
        </div>
        {selectedType?.fields?.length > 0 && <fieldset className="pv-item-details"><legend>Item details</legend><div className="pv-item-form-grid">{selectedType.fields.map(key => {
          const meta = fieldMeta[key];
          if (!meta) return null;
          return <label className="pv-field" key={key}>{meta.label}{meta.type === 'select' ? <select value={fields[key] ?? ''} onChange={event => updateField(key, event.target.value)}><option value="">Not recorded</option>{meta.options.map(option => <option key={option}>{option}</option>)}</select> : <input type={meta.type} step={meta.type === 'number' ? 'any' : undefined} value={fields[key] ?? ''} onChange={event => updateField(key, event.target.value)} placeholder={meta.placeholder || ''} aria-describedby={meta.help ? `supply-help-${key}` : undefined}/>} {meta.help && <small id={`supply-help-${key}`} className="pv-field-help">{meta.help}</small>}</label>;
        })}</div></fieldset>}
        <label className="pv-field">Storage location<input value={location} onChange={event => setLocation(event.target.value)} placeholder={vehicle || category === 'power' ? 'e.g. Garage, west shelf' : 'e.g. Pantry, shelf 2'}/></label>
        <label className="pv-field">Notes<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Anything else worth remembering" rows={3}/></label>
        {vehicle && <p className="pv-field-help">Open this vehicle on the Vehicles page to track fuel, service history, spare parts, and EMP protection details.</p>}
        {error && <p className="pv-form-error" role="alert">{error}</p>}
        <footer className="pv-dialog-actions"><button type="button" className="pv-button pv-secondary" onClick={onClose}>Cancel</button><button type="submit" className="pv-button pv-primary">{editItem ? 'Save changes' : 'Add to inventory'}</button></footer>
      </form>
    </section>
  </div>;
}
