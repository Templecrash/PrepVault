import { useId, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import './overview-insights.css';

const FIRST_CATEGORIES = ['water', 'food', 'medical', 'power', 'firewood', 'fuel', 'shelter', 'comms'];
const STATUS_LABELS = { unrecorded: 'No entries recorded', 'out-of-stock': 'Recorded quantity is zero', unknown: 'Quantity needs checking' };

function StockChart({ summary }) {
  const groups = [
    { key: 'stocked', label: 'With stock', count: summary.stockedEntries },
    { key: 'zero', label: 'Quantity is zero', count: summary.zeroEntries },
    { key: 'unknown', label: 'Quantity not confirmed', count: summary.unknownQuantityEntries },
  ];
  let offset = 0;
  const arcs = groups.map(group => {
    const length = summary.totalEntries ? group.count / summary.totalEntries * 100 : 0;
    const arc = { ...group, length, offset };
    offset += length;
    return arc;
  });
  return <div className="pv-stock-chart">
    <div className="pv-stock-ring" role="img" aria-label={`${summary.totalEntries} inventory entries: ${groups.map(group => `${group.count} ${group.label.toLowerCase()}`).join(', ')}`}>
      <svg viewBox="0 0 160 160" aria-hidden="true"><circle className="pv-stock-ring-track" cx="80" cy="80" r="65" />{arcs.filter(arc => arc.length > 0).map(arc => <circle key={arc.key} className={`pv-stock-arc is-${arc.key}`} cx="80" cy="80" r="65" pathLength="100" strokeDasharray={`${arc.length} ${100 - arc.length}`} strokeDashoffset={-arc.offset} />)}</svg>
      <div aria-hidden="true"><strong>{summary.totalEntries.toLocaleString()}</strong><span>inventory entries</span></div>
    </div>
    <dl className="pv-stock-legend">{groups.map(group => <div key={group.key}><dt><span className={`is-${group.key}`} />{group.label}</dt><dd>{group.count.toLocaleString()}</dd></div>)}</dl>
    <p className="pv-insight-note">Counts are inventory records, not combined quantities or days of supply.</p>
  </div>;
}

export default function OverviewInsights({ summary, priorities, propertyName, onCategory, onNavigate, onReview, onAdd }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const chartTitle = useRef(null);
  const id = useId();
  const remindersByCategory = new Map();
  for (const alert of priorities) remindersByCategory.set(alert.category, (remindersByCategory.get(alert.category) || 0) + 1);
  const ordered = [...summary.categories].sort((a, b) => {
    const aRank = FIRST_CATEGORIES.indexOf(a.key), bRank = FIRST_CATEGORIES.indexOf(b.key);
    return (aRank < 0 ? 100 : aRank) - (bRank < 0 ? 100 : bRank) || a.label.localeCompare(b.label);
  });
  const withReminders = ordered.filter(row => remindersByCategory.has(row.key));
  const filtered = filter === 'gaps' ? ordered.filter(row => row.status !== 'stocked') : filter === 'attention' ? withReminders : ordered;
  const shown = expanded ? filtered : filtered.slice(0, 8);
  const selectFilter = value => { setFilter(value); setExpanded(false); };

  return <section className="pv-overview-insights" aria-labelledby={`${id}-title`}>
    <div className="pv-section-heading"><div><h2 id={`${id}-title`}>Your preparation, in detail</h2><p>{propertyName} · Based on the inventory you’ve recorded.</p></div><button type="button" className="pv-text-link" onClick={() => onNavigate('inventory-search')}>Explore inventory<Icon name="arrow" size={15} /></button></div>
    <div className="pv-insight-stats">
      <button type="button" onClick={() => onNavigate('inventory-search')}><Icon name="box" size={18} /><span><strong>{summary.totalEntries.toLocaleString()}</strong><small>inventory entries</small></span><Icon name="arrow" size={14} /></button>
      <button type="button" onClick={() => selectFilter('all')}><Icon name="grid" size={18} /><span><strong>{summary.coveredCount}<em> / {summary.categoryCount}</em></strong><small>categories with stock</small></span><Icon name="arrow" size={14} /></button>
      <button type="button" onClick={() => selectFilter('gaps')}><Icon name="search" size={18} /><span><strong>{summary.emptyCount}</strong><small>without confirmed stock</small></span><Icon name="arrow" size={14} /></button>
      <button type="button" onClick={onReview}><Icon name="clock" size={18} /><span><strong>{priorities.length}</strong><small>reminders to review</small></span><Icon name="arrow" size={14} /></button>
    </div>
    <div className="pv-insights-grid">
      <section className="pv-insight-card pv-category-chart" aria-labelledby={`${id}-categories`}>
        <header><div><h3 id={`${id}-categories`} ref={chartTitle} tabIndex={-1}>Coverage by category</h3><p>See which types you have in stock.</p></div><Icon name="box" size={19} /></header>
        <div className="pv-chart-filters" role="group" aria-label="Filter category coverage">
          {[['all', 'All categories', ordered.length], ['gaps', 'No confirmed stock', summary.emptyCount], ['attention', 'With reminders', withReminders.length]].map(([value, label, count]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => selectFilter(value)}>{label}<span>{count}</span></button>)}
        </div>
        <div className="pv-category-chart-axis" aria-hidden="true"><span>Category</span><span>Types in stock / available types</span></div>
        <div className="pv-category-chart-rows" id={`${id}-rows`}>
          {shown.map(row => {
            const reminders = remindersByCategory.get(row.key) || 0;
            const detail = STATUS_LABELS[row.status] || `${row.stockedEntries} stocked ${row.stockedEntries === 1 ? 'entry' : 'entries'}`;
            return <button type="button" className="pv-category-chart-row" key={row.key} onClick={() => onCategory(row.key)} aria-label={`Open ${row.label}: ${row.totalTypes ? `${row.stockedTypes} of ${row.totalTypes} types in stock` : 'No type list defined'}, ${detail.toLowerCase()}${reminders ? `, ${reminders} ${reminders === 1 ? 'reminder' : 'reminders'}` : ''}`}>
              <span className="pv-category-chart-label"><strong>{row.label}</strong><small>{detail}{reminders > 0 && <span> · {reminders} {reminders === 1 ? 'reminder' : 'reminders'}</span>}</small></span>
              <span className={`pv-category-chart-bar${row.coveragePercent === null ? ' is-undefined' : ''}`} aria-hidden="true"><span style={{ width: `${row.coveragePercent ?? 0}%` }} /></span>
              <span className="pv-category-chart-value">{row.totalTypes ? <>{row.stockedTypes}<small> / {row.totalTypes}</small></> : '—'}</span><Icon name="chevron" size={14} />
            </button>;
          })}
          {!shown.length && <div className="pv-chart-empty"><Icon name="check" size={24} /><p>{!summary.categoryCount ? 'No inventory categories are available.' : filter === 'attention' ? 'No inventory categories have reminders.' : 'Every category has some stock recorded.'}</p>{filter !== 'all' && <button type="button" className="pv-text-link" onClick={() => selectFilter('all')}>Show all categories</button>}</div>}
        </div>
        {filtered.length > 8 && <button type="button" className="pv-chart-expand" aria-expanded={expanded} aria-controls={`${id}-rows`} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer categories' : `Show all ${filtered.length} categories`}<Icon name={expanded ? 'close' : 'plus'} size={14} /></button>}
        <p className="pv-insight-note">Bars show variety across inventory types, not required equipment or a readiness score. Open any category to review it.</p>
      </section>
      <div className="pv-insight-side">
        <section className="pv-insight-card" aria-labelledby={`${id}-stock`}>
          <header><div><h3 id={`${id}-stock`}>The stock behind the numbers</h3><p>Separate recorded stock from incomplete entries.</p></div></header>
          <StockChart summary={summary} />
          {summary.unknownCategoryEntries > 0 && <p className="pv-insight-note pv-unmapped-note">{summary.unknownCategoryEntries} {summary.unknownCategoryEntries === 1 ? 'entry has' : 'entries have'} an unrecognized category and {summary.unknownCategoryEntries === 1 ? 'is' : 'are'} included in these totals, but excluded from category coverage.</p>}
          {!summary.totalEntries && <button type="button" className="pv-chart-expand" onClick={onAdd}>Add your first supply<Icon name="plus" size={14} /></button>}
        </section>
        <section className="pv-insight-card pv-coverage-gaps" aria-labelledby={`${id}-gaps`}>
          <header><div><h3 id={`${id}-gaps`}>What isn’t confirmed yet</h3><p>{!summary.categoryCount ? 'No inventory categories are available.' : summary.emptyCount ? `${summary.emptyCount} categories without a positive recorded quantity.` : 'Every category has stock recorded.'}</p></div></header>
          {summary.gaps.length > 0 ? <div className="pv-coverage-gap-list">{summary.gaps.slice(0, 4).map(row => <button type="button" key={row.key} onClick={() => onCategory(row.key)}><span><strong>{row.label}</strong><small>{STATUS_LABELS[row.status]}</small></span><Icon name="arrow" size={15} /></button>)}</div> : <p className="pv-insight-note">Keep quantities current. Category coverage alone does not show how long supplies will last.</p>}
          {summary.gaps.length > 4 && <button type="button" className="pv-chart-expand" onClick={() => { selectFilter('gaps'); setExpanded(true); chartTitle.current?.focus({ preventScroll: true }); chartTitle.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }}>View all {summary.gaps.length} categories<Icon name="arrow" size={14} /></button>}
        </section>
      </div>
    </div>
  </section>;
}
