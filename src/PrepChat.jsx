import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import PrivateAdvisor from './PrivateAdvisor.jsx';
import { OWNER_SIGN_OUT_EVENT } from './tracking-auth.js';
import './prep-chat.css';

export default function PrepChat({ getContext }) {
  const [open, setOpen] = useState(false);
  const launcher = useRef(null);
  const closeButton = useRef(null);
  const panel = useRef(null);
  const restoreFocus = useRef(false);
  const id = useId();
  const close = useCallback(() => {
    restoreFocus.current = true;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open) closeButton.current?.focus({ preventScroll: true });
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      launcher.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    // A successful sign-out elsewhere also clears an open private conversation.
    const onSignOut = () => {
      // The sign-out button is replaced by a status message while the request
      // runs, which can leave focus on body before the success event arrives.
      restoreFocus.current = Boolean(panel.current && (panel.current.contains(document.activeElement) || document.activeElement === document.body));
      setOpen(false);
    };
    window.addEventListener(OWNER_SIGN_OUT_EVENT, onSignOut);
    return () => window.removeEventListener(OWNER_SIGN_OUT_EVENT, onSignOut);
  }, []);

  return <>
    {open && <section ref={panel} className="pv-prep-chat-panel" id={id} role="dialog" aria-labelledby={`${id}-title`} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
      <header className="pv-prep-chat-heading">
        <span className="pv-prep-chat-mark"><Icon name="advisor" size={23} /></span>
        <div><h2 id={`${id}-title`}>Prep Chat</h2><p><Icon name="shield" size={12} />Private to you</p></div>
        <button type="button" ref={closeButton} className="pv-prep-chat-close" onClick={close} aria-label="Close Prep Chat"><Icon name="close" size={19} /></button>
      </header>
      <div className="pv-prep-chat-content"><PrivateAdvisor getContext={getContext} /></div>
    </section>}
    <button type="button" ref={launcher} className={`pv-prep-chat-launcher${open ? ' is-open' : ''}`} aria-label={open ? 'Close Prep Chat' : 'Open Prep Chat'} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" onClick={() => open ? close() : setOpen(true)}>
      <Icon name={open ? 'close' : 'advisor'} size={22} /><span>Prep Chat</span>
    </button>
  </>;
}
