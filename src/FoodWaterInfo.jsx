import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './brand.jsx';
import { useDialogFocus } from './useDialogFocus.js';
import './food-water-info.css';

function FoodWaterDialog({ id, onClose }) {
  const ref = useDialogFocus(onClose);
  return <div className="pv-food-water-backdrop" onClick={onClose}>
    <section ref={ref} id={id} className="pv-food-water-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={event => event.stopPropagation()}>
      <header><div><span>YOUR PEOPLE, YOUR PLAN</span><h2 id={`${id}-title`}>Food & water planning</h2></div><button type="button" aria-label="Close food and water information" onClick={onClose}><Icon name="close" size={20}/></button></header>
      <p>Only people marked as <strong>Dependant</strong> on <strong>Your People</strong> count toward your food and water plan. Mark anyone whose food and water you supply, including yourself.</p>
      <p>Each marked person counts once and receives the full per-person allowance. Unmarked contacts stay in your directory but are excluded from these estimates.</p>
      <p>Changing a dependant updates Overview, Food, Water and Rationing automatically. Search and group filters do not change the count. With no dependants selected, food and water coverage stays unknown.</p>
      <div className="pv-food-water-assumptions"><Icon name="ration" size={20}/><p>Food uses the daily calorie target in Rationing. Stored water uses 1 gallon per person per day. These are planning assumptions and do not adjust automatically for age or individual needs.</p></div>
      <footer><button type="button" className="pv-button pv-primary" onClick={onClose}>Got it</button></footer>
    </section>
  </div>;
}

export default function FoodWaterInfo() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <button type="button" className="pv-food-water-info" aria-label="How food and water planning counts people" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(true)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/></svg></button>
    {open && createPortal(<FoodWaterDialog id={id} onClose={() => setOpen(false)}/>, document.body)}
  </>;
}
