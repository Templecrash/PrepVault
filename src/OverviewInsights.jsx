import { useId, useState } from 'react';
import { Icon } from './brand.jsx';
import { categoryReadiness } from './overview-readiness.js';
import './overview-insights.css';

const FIRST = ['food', 'water', 'medical', 'power', 'firewood', 'fuel', 'shelter', 'comms'];
export default function OverviewInsights({ summary, priorities, coverage, propertyName, onCategory, onReview }) {
  const [attentionOnly, setAttentionOnly] = useState(false); const id = useId();
  const rows = summary.categories.map(row => ({ ...row, ...categoryReadiness(row, coverage?.[row.key], priorities.filter(alert => alert.category === row.key)) })).sort((a, b) => {
    const left = FIRST.indexOf(a.key), right = FIRST.indexOf(b.key);
    return (left < 0 ? 100 : left) - (right < 0 ? 100 : right) || a.label.localeCompare(b.label);
  });
  const attention = rows.filter(row => row.level !== 'good');
  return <section className="pv-overview-insights" aria-labelledby={`${id}-title`}>
    <div className="pv-section-heading"><div><h2 id={`${id}-title`}>Readiness at a glance</h2><p>{propertyName} · {attention.length} {attention.length === 1 ? 'category needs' : 'categories need'} attention</p></div><div className="pv-readiness-actions"><button className="pv-text-link" type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(value => !value)}>{attentionOnly ? 'Show all categories' : 'Focus on gaps'}</button>{priorities.length > 0 && <button type="button" className="pv-text-link" onClick={onReview}>{priorities.length} reminders<Icon name="arrow" size={15}/></button>}</div></div>
    <div className="pv-readiness-strip" role="group" aria-label="Category status. Scroll horizontally for all categories.">{(attentionOnly ? attention : rows).map(row => <button className={`pv-readiness-item is-${row.level}`} type="button" key={row.key} onClick={() => onCategory(row.key)} title={`${row.label}: ${row.detail}`} aria-label={`${row.label}: ${row.statusLabel}. ${row.detail}`}><span className="pv-readiness-circle" aria-hidden="true">{row.days !== null ? <strong>{row.days}</strong> : <Icon name={row.level === 'good' ? 'check' : row.level === 'unknown' ? 'search' : 'minus'} size={18}/>}</span><strong>{row.label}</strong><small>{row.days !== null ? `${row.days === 1 ? 'day' : 'days'} recorded` : row.statusLabel}</small></button>)}{attentionOnly && !attention.length && <p className="pv-readiness-empty">No recorded stock issues. Keep your quantities and plans current.</p>}</div>
    <p className="pv-readiness-legend"><span><i className="is-bad"/>Low or needs attention</span><span><i className="is-ok"/>Review</span><span><i className="is-good"/>Recorded stock looks good</span><span>Days appear where your records support an estimate. Select a circle for details.</span></p>
  </section>;
}
