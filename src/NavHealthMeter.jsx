import { useEffect, useId, useRef, useState } from 'react';
import './nav-health-meter.css';

const LEVELS = {
  bad: { bars: 1, label: 'Bad' },
  ok: { bars: 2, label: 'OK' },
  good: { bars: 3, label: 'Good' },
  unknown: { bars: 0, label: 'Not assessed' },
};

export default function NavHealthMeter({ health, descriptionId }) {
  const generatedId = useId();
  const meterRef = useRef(null);
  const [dismissed, setDismissed] = useState(false);
  const hasHealth = Boolean(health);
  useEffect(() => {
    const row = meterRef.current?.closest('.pv-nav-item');
    if (!row) return;
    let hovered = row.matches(':hover');
    let focused = document.activeElement === row;
    const dismissOnEscape = event => {
      if (event.key === 'Escape') setDismissed(true);
    };
    const updateEscapeListener = () => {
      if (hovered || focused) document.addEventListener('keydown', dismissOnEscape);
      else document.removeEventListener('keydown', dismissOnEscape);
    };
    const enter = () => { hovered = true; setDismissed(false); updateEscapeListener(); };
    const leave = () => { hovered = false; updateEscapeListener(); };
    const focus = () => { focused = true; setDismissed(false); updateEscapeListener(); };
    const blur = () => { focused = false; updateEscapeListener(); };
    row.addEventListener('pointerenter', enter);
    row.addEventListener('pointerleave', leave);
    row.addEventListener('focus', focus);
    row.addEventListener('blur', blur);
    updateEscapeListener();
    return () => {
      row.removeEventListener('pointerenter', enter);
      row.removeEventListener('pointerleave', leave);
      row.removeEventListener('focus', focus);
      row.removeEventListener('blur', blur);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [hasHealth]);
  if (!health) return null;
  const level = Object.hasOwn(LEVELS, health.level) ? health.level : 'unknown';
  const label = health.label || LEVELS[level].label;
  const detail = health.detail || 'Not enough information to assess this section.';
  const description = `Health: ${label}. ${detail}`;
  return <span ref={meterRef} className={`pv-nav-health is-${level}${dismissed ? ' is-tooltip-dismissed' : ''}`}>
    <span className="pv-nav-health-bars" role="img" aria-label={description}>
      {[1, 2, 3].map(bar => <span key={bar} className={bar <= LEVELS[level].bars ? 'is-filled' : undefined} aria-hidden="true" />)}
    </span>
    <span className="pv-nav-health-tooltip" role="tooltip" id={descriptionId || generatedId}>
      <strong>{label}</strong><span>{detail}</span>
    </span>
  </span>;
}
