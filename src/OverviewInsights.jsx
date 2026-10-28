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
const GROUP_ICONS = { essentials: 'leaf', home: 'home', resilience: 'compass' };
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
  return <section className="pv-overview-insights" aria-labelledby={`${id}-title`}>
    <div className="pv-section-heading"><div><h2 id={`${id}-title`}>Readiness at a glance</h2><p>{propertyName} · {attention.length ? `${categoryCount(attention.length)} to review` : 'Your recorded categories look good'}</p></div><div className="pv-readiness-actions"><button className="pv-text-link" type="button" aria-expanded={attentionOnly} aria-controls={`${id}-details`} onClick={toggleGaps}>{attentionOnly ? 'Close gaps' : 'Focus on gaps'}<Icon name="arrow" size={14}/></button>{priorities.length > 0 && <button type="button" className="pv-text-link" onClick={onReview}>{priorities.length} reminders<Icon name="arrow" size={14}/></button>}</div></div>
    <div className="pv-readiness-charts">
      {groups.map(group => <article className="pv-readiness-chart" key={group.key}>
        <header><span className="pv-rollup-icon"><Icon name={GROUP_ICONS[group.key]} size={17}/></span><div><h3>{group.label}</h3><p>{group.description}</p></div></header>
        <div className="pv-readiness-chart-body"><ReadinessRing group={group}/><dl className="pv-readiness-counts">{STATES.map(state => <div key={state.key}><dt><i className={`is-${state.key}`} aria-hidden="true"/>{state.label}</dt><dd>{group.counts[state.key]}</dd></div>)}</dl></div>
        <div className="pv-readiness-next"><span className="pv-rollup-eyebrow">{group.attentionCount ? 'Start here' : 'At a glance'}</span>{group.rows.length ? group.rows.slice(0, 3).map(row => <CategoryLink key={row.key} row={row} onCategory={onCategory}/>) : <p>No categories in this group yet.</p>}</div>
        <button type="button" className="pv-readiness-explore" aria-expanded={activeGroup === group.key && !attentionOnly} aria-controls={`${id}-details`} onClick={event => openGroup(group.key, event)}>{activeGroup === group.key && !attentionOnly ? 'Close breakdown' : `View all ${group.total} categories`}<Icon name={activeGroup === group.key && !attentionOnly ? 'minus' : 'arrow'} size={14}/></button>
      </article>)}
    </div>
    <p className="pv-readiness-chart-note">Each segment is one category, based on recorded stock, days of cover and reminders. Open a group to see what needs attention.</p>
    <div id={`${id}-details`} hidden={!activeGroup} className="pv-readiness-breakdown" role="region" aria-labelledby={`${id}-detail-title`}>
      <div className="pv-readiness-breakdown-heading"><div><h3 ref={detailHeading} tabIndex={-1} id={`${id}-detail-title`}>{attentionOnly ? 'Where to focus next' : selected?.label || 'All categories'}</h3><p>{categoryCount(selectedRows.length)}{attentionOnly ? ' need a closer look.' : ' · Select a category to review your supplies.'}</p></div><button type="button" className="pv-text-link" onClick={closeBreakdown}>Close<Icon name="minus" size={14}/></button></div>
      <div className="pv-readiness-breakdown-list">{selectedRows.map(row => <CategoryLink key={row.key} row={row} onCategory={onCategory} detailed/>)}</div>
      {selectedRows.length === 0 && <p className="pv-readiness-empty">No recorded stock issues in this view. Keep quantities, dates and plans current.</p>}
    </div>
  </section>;
}
