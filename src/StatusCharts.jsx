import { useId } from 'react';
import { Icon } from './brand.jsx';
import './status-charts.css';

const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const display = value => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const toneName = value => ['good', 'warning', 'danger', 'unknown', 'neutral'].includes(value) ? value : 'unknown';

export function StatusPanel({ title, summary, description, note, children, action }) {
  const id = useId();
  return <details className="pv-status-panel">
    <summary className="pv-status-summary"><span><span className="pv-status-summary-title" id={`${id}-title`}>{title}</span>{summary && <span className="pv-status-summary-value">{summary}</span>}</span><span className="pv-status-disclosure-label"><span className="when-closed">View insights</span><span className="when-open">Hide insights</span><Icon name="chevron" size={15}/></span></summary>
    <div className="pv-status-details" role="region" aria-labelledby={`${id}-title`}>
      {(description || action) && <header>{description && <p>{description}</p>}{action}</header>}
      <div className="pv-status-panel-grid">{children}</div>
      {note && <p className="pv-status-panel-note">{note}</p>}
    </div>
  </details>;
}

export function StatusRing({ title, segments = [], value, label, note, emptyLabel = 'No records yet' }) {
  const rows = segments.map((row, index) => ({ ...row, id: row.id || String(index), value: number(row.value) ?? 0, tone: toneName(row.tone) }));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const scale = Math.max(...rows.map(row => row.value), 1);
  const scaledTotal = rows.reduce((sum, row) => sum + row.value / scale, 0);
  const arcs = rows.map((row, index) => {
    const share = scaledTotal ? row.value / scale / scaledTotal * 100 : 0;
    const offset = scaledTotal ? rows.slice(0, index).reduce((sum, previous) => sum + previous.value / scale / scaledTotal * 100, 0) : 0;
    return { ...row, share, offset };
  });
  const description = total ? `${title}. ${rows.map(row => `${row.label}: ${display(row.value)}`).join('. ')}.` : `${title}. ${emptyLabel}.`;
  return <article className="pv-status-card pv-status-ring-card">
    <h3>{title}</h3>
    <div className="pv-status-ring-layout">
      <div className="pv-status-ring" role="img" aria-label={description}>
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="pv-status-track" cx="60" cy="60" r="48" fill="none" strokeWidth="9"/>{arcs.filter(row => row.share > 0).map(row => <circle key={row.id} className={`pv-status-arc is-${row.tone}`} cx="60" cy="60" r="48" fill="none" strokeWidth="9" pathLength="100" strokeDasharray={`${Math.max(0, row.share - (row.share < 100 ? Math.min(1.3, row.share * .12) : 0))} 100`} strokeDashoffset={-row.offset} transform="rotate(-90 60 60)"/>)}</svg>
        <div aria-hidden="true"><strong>{total ? value ?? display(total) : '—'}</strong><span>{total ? label || 'records' : emptyLabel}</span></div>
      </div>
      <div className="pv-status-legend">{rows.map(row => {
        const content = <><i className={`is-${row.tone}`} aria-hidden="true"/><span>{row.label}</span><strong>{display(row.value)}</strong>{row.onClick && <Icon name="chevron" size={12}/> }</>;
        return row.onClick ? <button type="button" key={row.id} onClick={row.onClick} aria-label={`${row.label}: ${display(row.value)}. View matching records.`}>{content}</button> : <div key={row.id}>{content}</div>;
      })}</div>
    </div>
    {note && <p className="pv-status-card-note">{note}</p>}
  </article>;
}

function Track({ value, max, label, valueLabel, tone }) {
  const actual = number(value);
  const target = number(max);
  const known = actual !== null && target !== null && target > 0;
  const percent = known ? Math.min(100, actual / target * 100) : 0;
  return known ? <div className={`pv-status-bar-track is-${toneName(tone)}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(actual, target)} aria-valuetext={valueLabel || `${display(actual)} of ${display(target)}`}><span style={{ width: `${percent}%` }}/></div> : <div className="pv-status-bar-track is-unknown is-unset" aria-hidden="true"/>;
}

export function StatusBar({ title, value, max, valueLabel, targetLabel, tone = 'neutral', note, onClick, actionLabel = 'View details' }) {
  const known = number(value) !== null && number(max) !== null && max > 0;
  const text = valueLabel ?? (known ? display(value) : 'Not recorded');
  return <article className={`pv-status-card pv-status-bar-card is-${toneName(tone)}`}>
    <h3>{title}</h3><div className="pv-status-bar-value"><i className={`pv-status-value-dot is-${known ? toneName(tone) : 'unknown'}`} aria-hidden="true"/><strong>{text}</strong>{targetLabel && <span>{targetLabel}</span>}</div>
    <Track value={value} max={max} valueLabel={String(text)} label={title} tone={tone}/>
    {note && <p className="pv-status-card-note">{note}</p>}
    {onClick && <button type="button" className="pv-status-action" onClick={onClick}>{actionLabel}<Icon name="arrow" size={13}/></button>}
  </article>;
}

export function StatusBreakdown({ title, rows = [], note }) {
  return <article className="pv-status-card pv-status-breakdown"><h3>{title}</h3><div className="pv-status-breakdown-rows">{rows.length ? rows.map((row, index) => {
    const text = row.valueLabel ?? (number(row.value) === null ? 'Not recorded' : `${display(row.value)}${number(row.max) !== null ? ` / ${display(row.max)}` : ''}`);
    const content = <><span className="pv-status-breakdown-label"><span>{row.label}</span><i className={`pv-status-value-dot is-${number(row.value) === null ? 'unknown' : toneName(row.tone)}`} aria-hidden="true"/><strong>{text}</strong>{row.onClick && <Icon name="chevron" size={12}/>}</span><Track value={row.value} max={row.max} valueLabel={String(text)} label={row.label} tone={row.tone}/></>;
    return row.onClick ? <button type="button" key={row.id || index} onClick={row.onClick} aria-label={`${row.label}: ${text}. View details.`}>{content}</button> : <div key={row.id || index}>{content}</div>;
  }) : <p className="pv-status-card-note">Add records to see this breakdown.</p>}</div>{note && <p className="pv-status-card-note">{note}</p>}</article>;
}
