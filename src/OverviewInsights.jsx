import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { buildReadinessGroups } from './overview-readiness.js';
import './overview-insights.css';

const STATES = [
  { key: 'good', label: 'Looks good' },
  { key: 'ok', label: 'Review' },
  { key: 'bad', label: 'Low / urgent' },
  { key: 'unknown', label: 'Unconfirmed' },
];
const categoryCount = count => `${count} ${count === 1 ? 'category' : 'categories'}`;
const dayLabel = row => row.days === null ? row.statusLabel : `${row.days.toLocaleString()} ${row.days === 1 ? 'day' : 'days'}`;

function ReadinessRing({ group }) {
  const slot = group.total ? 100 / group.total : 100;
  const gap = group.total > 1 ? Math.min(1.8, slot * .18) : 0;
  const description = `${group.label}: ${group.goodCount} of ${categoryCount(group.total)} look good. ${group.counts.ok} need review, ${group.counts.bad} are low or have urgent reminders, ${group.counts.unknown} are unconfirmed.`;
  return <div className="pv-readiness-ring" role="img" aria-label={description}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle className="pv-ring-track" cx="60" cy="60" r="48" fill="none" strokeWidth="9"/>
      {group.rows.map((row, index) => <circle key={row.key} className={`pv-ring-segment is-${row.level}`} cx="60" cy="60" r="48" fill="none" strokeWidth="9" pathLength="100" strokeDasharray={`${slot - gap} ${100 - slot + gap}`} strokeDashoffset={-index * slot} transform="rotate(-90 60 60)"/>)}
    </svg>
    <div aria-hidden="true"><strong>{group.total ? group.goodCount : '—'}{group.total > 0 && <span> / {group.total}</span>}</strong><span>{group.total ? 'look good' : 'no categories'}</span></div>
  </div>;
}

function CategoryLink({ row, onCategory, detailed = false }) {
  return <button className={`pv-rollup-category is-${row.level}${detailed ? ' is-detailed' : ''}`} type="button" onClick={() => onCategory(row.key)} aria-label={`${row.label}: ${row.statusLabel}. ${row.detail}`}>
    <i aria-hidden="true"/><span className="pv-rollup-category-copy"><strong>{row.label}</strong>{detailed && <small>{row.detail}</small>}</span>
    <span className="pv-rollup-category-value">{dayLabel(row)}{row.alertCount > 0 && <small>{row.alertCount} {row.alertCount === 1 ? 'reminder' : 'reminders'}</small>}</span><Icon name="chevron" size={13}/>
  </button>;
}

export default function OverviewInsights({ summary, priorities, coverage, propertyName, onCategory, onReview }) {
  const [activeGroup, setActiveGroup] = useState(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const detailHeading = useRef(null);
  const opener = useRef(null);
  const id = useId();
  const groups = buildReadinessGroups(summary.categories, coverage, priorities);
  const rows = groups.flatMap(group => group.rows);
  const attention = rows.filter(row => row.level !== 'good');
  const selected = groups.find(group => group.key === activeGroup);
  const selectedRows = (selected ? selected.rows : rows).filter(row => !attentionOnly || row.level !== 'good');
  const closeBreakdown = () => { setActiveGroup(null); setAttentionOnly(false); opener.current?.focus({ preventScroll: true }); opener.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); };
  const openGroup = (key, event) => { opener.current = event.currentTarget; setActiveGroup(value => value === key && !attentionOnly ? null : key); setAttentionOnly(false); };
  const toggleGaps = event => { opener.current = event.currentTarget; const opening = !attentionOnly; setActiveGroup(opening ? 'all' : null); setAttentionOnly(opening); };
  useEffect(() => {
    if (!activeGroup) return;
    detailHeading.current?.focus({ preventScroll: true });
    detailHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [activeGroup, attentionOnly]);
  if (!summary.totalEntries) return <section className="pv-readiness-start"><Icon name="box" size={23}/><div><h2>Start with what you have</h2><p>Add supplies to see coverage and gaps for {propertyName}.</p></div></section>;
  return <section className="pv-overview-insights" aria-labelledby={`${id}-title`}>
    <div className="pv-section-heading"><div><h2 id={`${id}-title`}>Readiness</h2></div><div className="pv-readiness-actions"><button className="pv-text-link" type="button" aria-expanded={attentionOnly} aria-controls={`${id}-details`} onClick={toggleGaps}>{attentionOnly ? 'Close gaps' : `${attention.length} categories to review`}<Icon name="arrow" size={14}/></button>{priorities.length > 0 && <button type="button" className="pv-text-link" onClick={onReview}>{priorities.length} reminders<Icon name="arrow" size={14}/></button>}</div></div>
    <div className="pv-readiness-charts">
      {groups.map(group => <button type="button" className="pv-readiness-compact" key={group.key} aria-expanded={activeGroup === group.key && !attentionOnly} aria-controls={`${id}-details`} onClick={event => openGroup(group.key, event)}>
        <ReadinessRing group={group}/><span className="pv-readiness-compact-copy"><strong>{group.label}</strong><span>{group.attentionCount ? `${group.attentionCount} to review` : 'No gaps flagged'}</span></span><Icon name="chevron" size={15}/>
      </button>)}
    </div>
    <div className="pv-readiness-key">{STATES.map(state => <span key={state.key}><i className={`is-${state.key}`} aria-hidden="true"/>{state.label}</span>)}<span>Based on recorded supplies</span></div>
    <div id={`${id}-details`} hidden={!activeGroup} className="pv-readiness-breakdown" role="region" aria-labelledby={`${id}-detail-title`}>
      <div className="pv-readiness-breakdown-heading"><div><h3 ref={detailHeading} tabIndex={-1} id={`${id}-detail-title`}>{attentionOnly ? 'Where to focus next' : selected?.label || 'All categories'}</h3><p>{categoryCount(selectedRows.length)}{attentionOnly ? ' need a closer look.' : ' · Select a category to review your supplies.'}</p></div><button type="button" className="pv-text-link" onClick={closeBreakdown}>Close<Icon name="minus" size={14}/></button></div>
      <div className="pv-readiness-breakdown-list">{selectedRows.map(row => <CategoryLink key={row.key} row={row} onCategory={onCategory} detailed/>)}</div>
      {selectedRows.length === 0 && <p className="pv-readiness-empty">No recorded stock issues in this view. Keep quantities, dates and plans current.</p>}
    </div>
  </section>;
}
