import { Fragment, useId, useMemo, useState } from 'react';
import { Icon } from './brand.jsx';
import { StatusPanel, StatusBar, StatusBreakdown } from './StatusCharts.jsx';
import { CONVERSIONS, computeResourcePools, buildResourceSystems, buildResourceRows, buildStockConversions, computeResourceTradeoff, buildResourceVisualSummary } from './resource-planning.js';
import './inventory.css';
import './resource-planning.css';

const SECTIONS = [
  ['stock', 'Resources'], ['convert', 'Conversions'], ['tradeoff', 'Trade-offs'], ['graph', 'System map'], ['opps', 'Opportunities'],
];
const SYSTEM_LABELS = { power: 'Power', heat: 'Heat', water: 'Water', food: 'Food', comms: 'Communications' };
const SYSTEM_ICONS = { water: 'water', heat: 'sun', power: 'bolt', comms: 'radio', food: 'ration' };
const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
const belowTarget = row => row.days !== null && row.target && row.days < row.target;
const matches = (query, values) => values.join(' ').toLowerCase().includes(query.trim().toLowerCase());

function EmptyResults({ onClear }) {
  return <div className="pv-inventory-empty"><span><Icon name="search" size={30} /></span><h2>No matching results</h2><p>Try another search or clear your filters to see the full plan.</p><button className="pv-inventory-button pv-inventory-button-primary" onClick={onClear}>Clear filters</button></div>;
}

function SearchField({ label, placeholder, value, onChange }) {
  return <div className="pv-inventory-search"><Icon name="search" size={18} /><input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} /></div>;
}

function ResourceRows({ rows, query, setQuery, filter, setFilter, people, climate }) {
  const [sort, setSort] = useState('default');
  const [expanded, setExpanded] = useState(null);
  const id = useId();
  const clear = () => { setQuery(''); setFilter('all'); };
  const filtered = rows.filter(row => matches(query, [row.name, row.detail, row.unit || '']) && (filter === 'all' || (filter === 'below' ? belowTarget(row) : filter === 'met' ? row.days !== null && row.days >= row.target : row.days === null)));
  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'coverage') filtered.sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
  return <div className="pv-inventory-workspace">
    <div className="pv-inventory-toolbar"><SearchField label="Search resources" placeholder="Search resources…" value={query} onChange={setQuery} /><label className="pv-inventory-select"><span className="pv-inventory-sr-only">Resource status</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All resources</option><option value="below">Below planning target</option><option value="met">Meets planning target</option><option value="stock">Coverage not estimated</option></select></label></div>
    <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{filtered.length}</strong> {filtered.length === 1 ? 'resource' : 'resources'} · {people} {people === 1 ? 'dependant' : 'dependants'} · {climate}{(query || filter !== 'all') && <button onClick={clear}>Clear filters <Icon name="close" size={12} /></button>}</p><label className="pv-inventory-sort">Sort by <select aria-label="Sort resources" value={sort} onChange={event => setSort(event.target.value)}><option value="default">Planning order</option><option value="name">Name, A–Z</option><option value="coverage">Coverage, low first</option></select></label></div>
    {filtered.length ? <table className="pv-inventory-table pv-resource-table"><thead><tr><th scope="col">Resource</th><th scope="col">Recorded stock</th><th scope="col">Estimated coverage</th><th scope="col">Planning target</th><th scope="col"><span className="pv-inventory-sr-only">Details</span></th></tr></thead><tbody>
      {filtered.map(row => {
        const open = expanded === row.id;
        const toggle = () => setExpanded(open ? null : row.id);
        return <Fragment key={row.id}><tr className={open ? 'is-expanded' : ''}>
          <td className="pv-resource-name"><div className="pv-inventory-item"><span className="pv-inventory-item-symbol" aria-hidden="true">{row.icon}</span><div><button className="pv-inventory-item-name" onClick={toggle} aria-expanded={open} aria-controls={open ? `${id}-${row.id}` : undefined}>{row.name}</button><span className="pv-inventory-item-type">{row.days === null ? row.target ? 'Planning data needed' : 'Track by quantity' : belowTarget(row) ? 'Below planning target' : 'Meets planning target'}</span></div></div></td>
          <td data-label="Recorded stock">{row.qty} {row.unit || ''}</td><td data-label="Estimated coverage"><strong className="pv-resource-value">{row.days === null ? 'Not estimated' : `${row.minimum ? 'At least ' : ''}${number(row.days)} days`}</strong></td><td data-label="Planning target">{row.target ? `${row.target} days` : '—'}</td>
          <td className="pv-resource-toggle"><button onClick={toggle} aria-label={`${open ? 'Hide' : 'Show'} ${row.name} assumptions`} aria-expanded={open} aria-controls={open ? `${id}-${row.id}` : undefined}><Icon name="chevron" size={17} /></button></td>
        </tr>{open && <tr className="pv-resource-detail-row"><td colSpan={5}><div className="pv-resource-detail" id={`${id}-${row.id}`}><h3>Planning basis</h3><p>{row.detail}</p><p>{row.days === null ? 'A quantity alone does not establish how long this resource will last.' : 'Coverage uses the model’s preset consumption and equipment assumptions. Adjust your plan to the equipment and conditions you actually have.'}</p></div></td></tr>}</Fragment>;
      })}
    </tbody></table> : <EmptyResults onClear={clear} />}
    <div className="pv-inventory-footer"><Icon name="compass" size={15} /><span>Planning estimates, based on selected supplies. Open a resource to see its assumptions.</span></div>
  </div>;
}

function ConversionTable({ resources }) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const clear = () => { setQuery(''); setSource('all'); };
  const rows = [
    ...buildStockConversions(resources).map(row => ({ id: `stock-${row.id}`, input: `${row.label} · ${row.val}`, output: row.conv, equiv: 'Estimate from your selected supplies and the model’s preset rates.', source: 'stock' })),
    ...Object.entries(CONVERSIONS).map(([id, row]) => ({ ...row, id, source: 'reference' })),
  ].filter(row => (source === 'all' || source === row.source) && matches(query, [row.input, row.output, row.equiv]));
  return <div className="pv-inventory-workspace"><div className="pv-inventory-toolbar"><SearchField label="Search conversions" placeholder="Search water, fuel, energy or calories…" value={query} onChange={setQuery} /><label className="pv-inventory-select"><span className="pv-inventory-sr-only">Conversion source</span><select value={source} onChange={event => setSource(event.target.value)}><option value="all">All conversions</option><option value="stock">Your stock</option><option value="reference">Reference rates</option></select></label></div>
    <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{rows.length}</strong> {rows.length === 1 ? 'conversion' : 'conversions'}{(query || source !== 'all') && <button onClick={clear}>Clear filters <Icon name="close" size={12} /></button>}</p><span className="pv-resource-caption">Preset rates · approximate outputs</span></div>
    {rows.length ? <table className="pv-inventory-table pv-conversion-table"><thead><tr><th scope="col">Input</th><th scope="col">Estimated output</th><th scope="col">Assumptions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.input}</strong><span className="pv-inventory-item-type">{row.source === 'stock' ? 'Your stock' : 'Reference rate'}</span></td><td data-label="Estimated output">{row.output}</td><td data-label="Assumptions">{row.equiv}</td></tr>)}</tbody></table> : <EmptyResults onClear={clear} />}
    <div className="pv-inventory-footer"><Icon name="compass" size={15} /><span>Actual output depends on equipment, load, weather and losses. These rates are planning assumptions.</span></div>
  </div>;
}

function TradeoffPlanner({ items, resources, from, setFrom, to, setTo, amount, setAmount }) {
  const id = useId();
  const result = useMemo(() => computeResourceTradeoff(items, resources, from, to, amount), [items, resources, from, to, amount]);
  const selectFrom = value => { setFrom(value); if (value === to) setTo(value === 'power' ? 'heat' : 'power'); };
  return <div className="pv-inventory-workspace pv-resource-tradeoff">
    <div className="pv-resource-section-heading"><div><h2>Explore a trade-off</h2><p>See the model’s estimate when you redirect part of one resource budget.</p></div><Icon name="compass" size={22} /></div>
    <div className="pv-resource-tradeoff-controls"><label>Divert from<select aria-label="Divert from" value={from} onChange={event => selectFrom(event.target.value)}>{Object.entries(SYSTEM_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><span className="pv-resource-direction"><Icon name="arrow" size={22} /></span><label>Direct toward<select aria-label="Direct toward" value={to} onChange={event => setTo(event.target.value)}>{Object.entries(SYSTEM_LABELS).filter(([key]) => key !== from).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="pv-resource-slider"><div><label htmlFor={`${id}-amount`}>Share of resource budget</label><output htmlFor={`${id}-amount`}>{amount}%</output></div><input id={`${id}-amount`} type="range" min={5} max={75} step={5} value={amount} onChange={event => setAmount(Number(event.target.value))} /><span>5%</span><span>75%</span></div>
    </div>
    <div className="pv-resource-tradeoff-results" aria-live="polite"><table className="pv-inventory-table"><caption>Estimated coverage in this scenario</caption><thead><tr><th scope="col">System</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody><tr><th scope="row">{SYSTEM_LABELS[from]}<small>Source</small></th><td>{number(result.fromOrigDays)} days</td><td>{number(result.fromNewDays)} days</td></tr><tr><th scope="row">{SYSTEM_LABELS[to]}<small>Recipient</small></th><td>{number(result.toOrigDays)} days</td><td>{number(result.toNewDays)} days</td></tr></tbody></table><div className="pv-resource-tradeoff-notes"><p><span>Budget redirected</span>{result.fromLoss}</p><p><span>Estimated effect</span>{result.toGain}</p></div></div>
    <div className="pv-inventory-footer"><Icon name="compass" size={15} /><span>Illustrative scenario only. A resource budget is not always physically transferable; the model uses simplified conversion assumptions. Your recorded supplies are unchanged.</span></div>
  </div>;
}

function SystemMap({ systems }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const id = useId();
  const clear = () => { setQuery(''); setFilter('all'); };
  const rows = systems.filter(system => matches(query, [system.label, ...system.nodes.map(node => node.label)]) && (filter === 'all' || system.nodes.some(node => node.status !== 'green')));
  return <div className="pv-inventory-workspace"><div className="pv-inventory-toolbar"><SearchField label="Search system map" placeholder="Search systems or components…" value={query} onChange={setQuery} /><label className="pv-inventory-select"><span className="pv-inventory-sr-only">System status</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All systems</option><option value="review">Needs review</option></select></label></div>
    <div className="pv-inventory-results-bar"><p aria-live="polite"><strong>{rows.length}</strong> {rows.length === 1 ? 'system chain' : 'system chains'}{(query || filter !== 'all') && <button onClick={clear}>Clear filters <Icon name="close" size={12} /></button>}</p><span className="pv-resource-caption">Select a system to trace its components</span></div>
    {rows.length ? <table className="pv-inventory-table pv-system-table"><thead><tr><th scope="col">System</th><th scope="col">Inventory matches</th><th scope="col">Review</th><th scope="col"><span className="pv-inventory-sr-only">Components</span></th></tr></thead><tbody>{rows.map(system => {
      const count = system.nodes.filter(node => node.status === 'green').length;
      const open = expanded === system.id;
      const toggle = () => setExpanded(open ? null : system.id);
      return <Fragment key={system.id}><tr className={open ? 'is-expanded' : ''}><td className="pv-resource-name"><div className="pv-inventory-item"><span className="pv-inventory-item-symbol"><Icon name={SYSTEM_ICONS[system.id]} size={20} /></span><button className="pv-inventory-item-name" onClick={toggle} aria-expanded={open} aria-controls={open ? `${id}-${system.id}` : undefined}>{system.label}</button></div></td><td data-label="Inventory matches">{count} of {system.nodes.length}<span className="pv-inventory-item-type">{Math.round(count / system.nodes.length * 100)}% of model checks</span></td><td data-label="Review">{count === system.nodes.length ? 'All checks matched' : system.nodes.some(node => node.status === 'red') ? 'Gaps to review' : 'Needs review'}</td><td className="pv-resource-toggle"><button onClick={toggle} aria-label={`${open ? 'Hide' : 'Show'} ${system.label} components`} aria-expanded={open} aria-controls={open ? `${id}-${system.id}` : undefined}><Icon name="chevron" size={17} /></button></td></tr>
        {open && <tr className="pv-resource-detail-row"><td colSpan={4}><div id={`${id}-${system.id}`} className="pv-system-components"><h3>{system.label} components</h3><ol>{system.nodes.map(node => <li key={node.id}><span className="pv-system-node-status"><Icon name={node.status === 'green' ? 'check' : 'search'} size={15} />{node.status === 'green' ? 'Matched' : node.status === 'red' ? 'Gap' : 'Check'}</span><strong>{node.label}</strong><span>{node.val} {node.unit}</span></li>)}</ol><p>Matches are inferred from recorded supplies. Verify the equipment and each connection in practice.</p></div></td></tr>}
      </Fragment>;
    })}</tbody></table> : <EmptyResults onClear={clear} />}
    <div className="pv-inventory-footer"><Icon name="compass" size={15} /><span>A chain is only as reliable as its weakest component. Open each system to review its connections.</span></div>
  </div>;
}

export default function ResourcePlanningView({ items, people, climateConfig, dailyCalTarget = 2000, waterGalPerPerson = 1, opportunities, onSetup, onSupplies }) {
  const [section, setSection] = useState('stock');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [from, setFrom] = useState('power');
  const [to, setTo] = useState('heat');
  const [amount, setAmount] = useState(25);
  const resources = useMemo(() => computeResourcePools(items, people, climateConfig, { dailyCalTarget, waterGalPerPerson }), [items, people, climateConfig, dailyCalTarget, waterGalPerPerson]);
  const rows = useMemo(() => buildResourceRows(items, people, climateConfig, { dailyCalTarget, waterGalPerPerson }), [items, people, climateConfig, dailyCalTarget, waterGalPerPerson]);
  const systems = useMemo(() => buildResourceSystems(items, resources), [items, resources]);
  const summary = buildResourceVisualSummary(resources, rows);
  const showResources = status => { setSection('stock'); setQuery(''); setFilter(status); };
  return <section className="pv-inventory pv-resource-planning" aria-labelledby="resource-planning-title">
    <header className="pv-inventory-heading"><div><h1 id="resource-planning-title">Resource planning<span>.</span></h1><p className="pv-inventory-intro">Review coverage, conversions and resource trade-offs.</p></div><div className="pv-inventory-actions"><button className="pv-inventory-button pv-inventory-button-secondary" onClick={onSetup}><Icon name="settings" size={18} />Household setup</button><button className="pv-inventory-button pv-inventory-button-primary" onClick={onSupplies}><Icon name="box" size={18} />View supplies</button></div></header>
    <StatusPanel title="Resource status" eyebrow="" summary={`${rows.filter(belowTarget).length} below planning target · ${rows.filter(row => row.target && row.days === null).length} need planning details`} note="Food and water follow your rationing settings. Energy and heat estimates use the assumptions shown.">
      <StatusBreakdown title="Estimated reserve coverage" rows={summary.reserves.map(row => ({ ...row, onClick: () => { showResources('all'); setQuery(rows.find(resource => resource.id === row.id).name); } }))} note="Each resource has its own target. Select one to review assumptions."/>
      <StatusBar title="Daily solar model" {...summary.solar} note={`${resources.solarPanels} recorded panels × 100 W × 5 effective sun hours. Compared with an assumed 2 kWh/day load; other power sources are separate.`} onClick={() => setSection('convert')} actionLabel="See conversion assumptions"/>
      <StatusBar title="Potential stored electricity" {...summary.storedPower} note="Assumes 5.5 kWh per gallon of gasoline with a compatible generator, plus 3 Wh per AA-equivalent cell. This is potential output, not verified usable capacity." onClick={() => setSection('tradeoff')} actionLabel="Explore the energy budget"/>
    </StatusPanel>
    <nav className="pv-resource-sections" aria-label="Resource planning sections">{SECTIONS.map(([key, label]) => <button key={key} className={section === key ? 'is-active' : ''} onClick={() => setSection(key)} aria-current={section === key ? 'page' : undefined}>{label}</button>)}</nav>
    {section === 'stock' && <ResourceRows rows={rows} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} people={resources.people} climate={climateConfig.label} />}
    {section === 'convert' && <ConversionTable resources={resources} />}
    {section === 'tradeoff' && <TradeoffPlanner items={items} resources={resources} from={from} setFrom={setFrom} to={to} setTo={setTo} amount={amount} setAmount={setAmount} />}
    {section === 'graph' && <SystemMap systems={systems} />}
    {section === 'opps' && opportunities}
  </section>;
}
