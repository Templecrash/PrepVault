import { useId, useState } from 'react';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import './inventory.css';
import './specialist.css';

export default function RecordModal({ title, fields, onSave, onClose }) {
  const dialogRef = useDialogFocus(onClose);
  const [data, setData] = useState({});
  const id = useId();
  return <div className="pv-modal-backdrop" onClick={onClose}><form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="pv-dialog pv-specialist-dialog" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); onSave(data); }}><header><h2 id={`${id}-title`}>{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" size={20}/></button></header><div className="pv-specialist-form-grid">{fields.map(field => {
    const common = { id: `${id}-${field.key}`, value: data[field.key] ?? '', onChange: event => setData(previous => ({ ...previous, [field.key]: event.target.value })), placeholder: field.placeholder || '' };
    return <label key={field.key} htmlFor={common.id}>{field.label}{field.type === 'select' ? <select {...common}><option value="">Choose…</option>{(field.options || []).map(option => { const value = typeof option === 'string' ? option : option.value; return <option key={value} value={value}>{typeof option === 'string' ? option : option.label}</option>; })}</select> : field.type === 'textarea' ? <textarea {...common} rows="3"/> : <input {...common} type={field.type || 'text'}/>}</label>;
  })}</div><div className="pv-specialist-form-actions"><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="pv-inventory-button pv-inventory-button-primary">Save</button></div></form></div>;
}
