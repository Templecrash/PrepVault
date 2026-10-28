import { useEffect, useRef } from 'react';

export function useDialogFocus(onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const previous = document.activeElement;
    const selector = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]';
    const focusable = () => [...panel.querySelectorAll(selector)].filter(el => el.getClientRects().length);
    const first = panel.querySelector('input:not([type="hidden"]):not(:disabled),select:not(:disabled),textarea:not(:disabled)') || focusable()[0];
    first?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const elements = focusable(), start = elements[0], end = elements.at(-1);
      if (!start) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === start || !panel.contains(document.activeElement))) { event.preventDefault(); end.focus(); }
      if (!event.shiftKey && (document.activeElement === end || !panel.contains(document.activeElement))) { event.preventDefault(); start.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return ref;
}
