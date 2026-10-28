import { createPortal } from 'react-dom';
import { useDialogFocus } from './useDialogFocus.js';
import { Icon } from './brand.jsx';
import './plan-notice.css';

export default function PlanNotice({ title, eyebrow, onClose, actions, children }) {
  const ref = useDialogFocus(onClose);
  return createPortal(<div className="pv-plan-notice-backdrop" onClick={onClose}>
    <section className="pv-plan-notice" role="dialog" aria-modal="true" aria-labelledby="plan-notice-title" ref={ref} onClick={event => event.stopPropagation()}>
      <header><div><span className="pv-eyebrow">{eyebrow}</span><h2 id="plan-notice-title">{title}</h2></div><button className="pv-icon-button" aria-label="Close notice" onClick={onClose}><Icon name="close"/></button></header>
      <div className="pv-plan-notice-body">{children}</div>
      <footer>{actions}</footer>
    </section>
  </div>, document.body);
}
