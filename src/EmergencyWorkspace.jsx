import { useId, useState } from 'react';
import { Icon } from './brand.jsx';
import { EMERGENCY_SCENARIOS, buildEmergencySchedule, buildEmergencySummary, toggleEmergencyAction, toggleEmergencyEvent, updateEmergencyPlan } from './emergency-plan.js';
import './inventory.css';
import './emergency-workspace.css';

const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
const gallons = value => `${number(value)} ${value === 1 ? 'gallon' : 'gallons'}`;
const localDate = value => {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dateLabel = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Not set';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const dayNumber = (plan, now) => {
  const start = plan?.startedAt && new Date(plan.startedAt);
  const current = now instanceof Date ? now : new Date(now ?? Date.now());
  if (!start || !Number.isFinite(start.getTime())) return 1;
  const offset = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.max(1, Math.floor(offset / 86_400_000) + 1);
};
const quickLinks = [
  { id: 'bugout', icon: 'box', title: 'Bug Out', detail: 'Your emergency grab list' },
  { id: 'community', icon: 'users', title: 'Your people', detail: 'Contacts and dependants' },
  { id: 'location', icon: 'map', title: 'Local conditions', detail: 'Weather and official warnings' },
  { id: 'comms', icon: 'radio', title: 'Communications', detail: 'Radio and your contact plan' },
  { id: 'offline-maps', icon: 'compass', title: 'Offline maps', detail: 'Saved routes and travel plans' },
  { id: 'emergency', icon: 'book', title: 'Emergency guides', detail: 'Handbooks and task pictures' },
];

export function EmergencyBanner({ plan, schedule = [], onOpen, onNavigate, propertyName, now }) {
  if (!plan?.active) return null;
  const entries = Array.isArray(schedule) ? schedule : [];
  const openCount = entries.filter(entry => !entry.done).length;
  const scenario = EMERGENCY_SCENARIOS.find(value => value.id === plan.scenarioId);
  return <aside className="pv-emergency-banner" aria-label="Emergency mode is active">
    <div className="pv-emergency-banner-state"><span className="pv-emergency-indicator"/><div><strong>Emergency mode active <span>Day {dayNumber(plan, now)}</span></strong><p>{scenario?.label || 'Emergency plan'}{propertyName ? ` · ${propertyName}` : ''}</p></div></div>
    <div className="pv-emergency-banner-schedule"><Icon name="clock" size={17}/><span>{entries.length ? `${openCount} of ${entries.length} tasks open today` : dayNumber(plan, now) > plan.horizonDays ? 'Planning duration ended — review your plan' : 'Your daily plan is active'}</span>{onNavigate && <button type="button" onClick={() => onNavigate('rationing')}>Rationing schedule<Icon name="arrow" size={13}/></button>}</div>
    {onOpen && <button type="button" className="pv-emergency-banner-open" onClick={onOpen}>Open emergency plan<Icon name="arrow" size={15}/></button>}
  </aside>;
}

function ScheduleEntry({ entry, plan, onChange, onError, compact, now }) {
  const toggle = () => {
    try {
      const next = toggleEmergencyEvent(plan, entry.key, now);
      if (onChange(next) === false) onError('This update could not be saved. Please try again.');
      else onError('');
    } catch (error) { onError(error.message || 'This task could not be updated.'); }
  };
  const icon = entry.type === 'meal' ? 'ration' : entry.type === 'water' ? 'water' : 'users';
  return <li className={`pv-emergency-schedule-entry${entry.done ? ' is-done' : ''}`}>
    <time className="pv-emergency-entry-time" dateTime={`${entry.date}T${entry.time}`}>{entry.time}</time>
    <span className="pv-emergency-entry-icon"><Icon name={icon} size={18}/></span>
    <div className="pv-emergency-entry-main"><div className="pv-emergency-entry-heading"><h3>{entry.title}</h3>{entry.done && <span className="pv-emergency-done-label">Completed</span>}</div>
      {entry.type === 'meal' && <div className="pv-emergency-allocation"><strong>{number(entry.householdCalories)}<span> calories for the household</span></strong><small>{number(entry.caloriesPerPerson)} per dependant</small></div>}
      {entry.type === 'water' && <div className="pv-emergency-allocation"><strong>{number(entry.householdWaterGal)}<span> {entry.householdWaterGal === 1 ? 'gallon' : 'gallons'} for the household</span></strong><small>{gallons(entry.waterGalPerPerson)} per dependant</small></div>}
      <p>{entry.notes}</p>
      {entry.type === 'meal' && entry.shortfallCalories > 0 && <p className="pv-emergency-entry-gap">{number(entry.shortfallCalories)} calories of this meal target have no matching recorded stock.</p>}
      {entry.type === 'water' && entry.shortfallWaterGal > 0 && <p className="pv-emergency-entry-gap">{gallons(entry.shortfallWaterGal)} of this daily water target {entry.shortfallWaterGal === 1 ? 'has' : 'have'} no matching recorded stock.</p>}
      {!compact && entry.allocation?.length > 0 && <details className="pv-emergency-meal-detail"><summary>Food from your recorded stock <span>{entry.allocation.length} {entry.allocation.length === 1 ? 'item' : 'items'}</span></summary><ul>{entry.allocation.map(item => <li key={item.itemId}><span>{item.name}</span><strong>{number(item.units)} {item.unit}</strong><small>{number(item.calories)} cal</small></li>)}</ul><p>Planning portions, not a balanced menu. Check allergies, preparation needs and food condition before use.</p></details>}
    </div>
    <label className="pv-emergency-entry-check"><input type="checkbox" checked={Boolean(entry.done)} disabled={!entry.canComplete || !onChange} onChange={toggle} aria-label={`${entry.done ? 'Reopen' : 'Complete'} ${entry.title} on ${dateLabel(entry.date)}`}/><span className="pv-inventory-sr-only">Completed</span></label>
  </li>;
}

export function EmergencySchedule({ plan, items = [], rationPeople = [], onChange, onNavigate, date, now, compact = false }) {
  const id = useId();
  const [selectedDate, setSelectedDate] = useState(null);
  const [error, setError] = useState('');
  if (!plan?.active) return null;
  const today = localDate(now);
  const shownDate = date || selectedDate || today;
  const summary = buildEmergencySummary({ plan, items, rationPeople, now });
  const entries = buildEmergencySchedule({ plan, items, rationPeople, date: shownDate, now });
  const done = entries.filter(entry => entry.done).length;
  return <section className={`pv-emergency-schedule${compact ? ' is-compact' : ''}`} aria-labelledby={`${id}-title`}>
    <header className="pv-emergency-section-heading"><div><p className="pv-emergency-eyebrow">DAILY ROUTINE</p><h2 id={`${id}-title`}>{shownDate === today ? 'Today’s rationing & check-ins' : 'Rationing & check-ins'}</h2><p>{dateLabel(shownDate)} · {done} of {entries.length} completed</p></div>{!date && <label className="pv-emergency-date-picker"><span>Schedule date</span><input type="date" value={shownDate} min={summary.startedDate} onChange={event => setSelectedDate(event.target.value || null)}/></label>}</header>
    {!summary.peopleCount && <div className="pv-emergency-notice"><Icon name="users" size={18}/><div><strong>Select your food and water dependants.</strong><p>Food and water amounts will appear when you mark people as dependants in Your People.</p>{onNavigate && <button type="button" className="pv-emergency-text-button" onClick={() => onNavigate('community')}>Choose dependants<Icon name="arrow" size={14}/></button>}</div></div>}
    {summary.horizonElapsed && <div className="pv-emergency-notice"><Icon name="calendar" size={18}/><div><strong>Your planned duration has ended.</strong><p>Review your situation and extend the duration in your emergency plan to continue the daily routine.</p>{onNavigate && <button type="button" className="pv-emergency-text-button" onClick={() => onNavigate('emergency-mode')}>Review emergency plan<Icon name="arrow" size={14}/></button>}</div></div>}
    {error && <p className="pv-emergency-error" role="alert">{error}</p>}
    {shownDate > today && <p className="pv-emergency-schedule-note">This is a planning preview. Future tasks cannot be marked complete.</p>}
    {entries.length ? <ol className="pv-emergency-schedule-list">{entries.map(entry => <ScheduleEntry key={entry.key} entry={entry} plan={plan} onChange={onChange} onError={setError} compact={compact} now={now}/>)}</ol> : <p className="pv-emergency-schedule-note">No emergency tasks are scheduled for this date.</p>}
    <footer className="pv-emergency-schedule-footer"><Icon name="clock" size={15}/><p>Times use this device’s local time. Checking a task records completion; it does not deduct stock. Update Food and Water as supplies are used. Water is a daily supply allocation, not a limit on drinking.</p></footer>
  </section>;
}

function PlanSettings({ plan, properties, onChange }) {
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useState('');
  const value = field => draft[field] ?? plan[field];
  const edit = (field, next) => { setDraft(previous => ({ ...previous, [field]: next })); setMessage(''); };
  const editTime = (field, index, next) => { const times = [...value(field)]; times[index] = next; edit(field, times); };
  const save = event => {
    event.preventDefault();
    try {
      const patch = { ...draft };
      for (const field of ['horizonDays', 'dailyCalTarget', 'waterGalPerPerson']) if (field in patch) patch[field] = Number(patch[field]);
      if (onChange(updateEmergencyPlan(plan, patch)) === false) { setMessage('Your changes could not be saved. Please try again.'); return; }
      setDraft({}); setMessage('Emergency plan updated.');
    } catch (error) { setMessage(error.message || 'Check the plan settings and try again.'); }
  };
  return <details className="pv-emergency-settings">
    <summary><Icon name="settings" size={18}/><span>Adjust your emergency plan<small>Situation, property, planning targets and daily times</small></span><Icon name="chevron" size={16}/></summary>
    <form onSubmit={save}>
      <div className="pv-emergency-settings-grid">
        <label className="pv-emergency-field"><span>Situation</span><select aria-label="Situation" value={value('scenarioId')} onChange={event => edit('scenarioId', event.target.value)}>{EMERGENCY_SCENARIOS.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select></label>
        <label className="pv-emergency-field"><span>Use supplies from</span><select aria-label="Use supplies from" value={value('propertyId')} onChange={event => edit('propertyId', event.target.value)}>{value('propertyId') !== 'all' && !properties.some(property => property.id === value('propertyId')) && <option value={value('propertyId')} disabled>Property unavailable — choose a location</option>}{properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}<option value="all">All properties — combined stock</option></select></label>
        <label className="pv-emergency-field"><span>Plan for this many days</span><input type="number" min="1" max="90" step="1" required value={value('horizonDays')} onChange={event => edit('horizonDays', event.target.value)}/></label>
        <label className="pv-emergency-field"><span>Daily calories per dependant</span><input type="number" min="1000" max="3000" step="100" required value={value('dailyCalTarget')} onChange={event => edit('dailyCalTarget', event.target.value)}/></label>
        <label className="pv-emergency-field"><span>Daily stored water per dependant · gal</span><input type="number" min="1" max="5" step="0.25" required value={value('waterGalPerPerson')} onChange={event => edit('waterGalPerPerson', event.target.value)}/></label>
      </div>
      <p className="pv-emergency-settings-note">Your existing calorie target is carried into Emergency mode. Needs vary with age, health and activity; a planning target is not a personal nutrition prescription. Stored water includes drinking, cooking and basic hygiene. Keep drinking as needed.</p>
      {value('propertyId') === 'all' && <p className="pv-emergency-settings-note">Combined stock may be at different locations. Only rely on supplies you can safely reach.</p>}
      <fieldset className="pv-emergency-times"><legend>Meal times</legend><div>{['Breakfast', 'Lunch', 'Dinner'].map((label, index) => <label className="pv-emergency-field" key={label}><span>{label}</span><input type="time" required value={value('mealTimes')?.[index] || ''} onChange={event => editTime('mealTimes', index, event.target.value)}/></label>)}</div></fieldset>
      <fieldset className="pv-emergency-times"><legend>Household check-ins</legend><div>{['First check-in', 'Second check-in'].map((label, index) => <label className="pv-emergency-field" key={label}><span>{label}</span><input type="time" required value={value('checkInTimes')?.[index] || ''} onChange={event => editTime('checkInTimes', index, event.target.value)}/></label>)}</div></fieldset>
      <div className="pv-emergency-settings-footer"><p role="status">{message}</p><button type="submit" className="pv-inventory-button pv-inventory-button-primary">Save emergency plan<Icon name="check" size={16}/></button></div>
    </form>
  </details>;
}

export default function EmergencyWorkspace({ plan, onChange, onDeactivate, onActivate, items = [], rationPeople = [], onNavigate, onCategory, properties = [], now }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState('');
  if (!plan?.active) return <section className="pv-inventory pv-emergency-workspace"><header className="pv-inventory-heading"><div><p className="pv-inventory-eyebrow">WHEN THE PLAN BECOMES THE PRIORITY</p><h1>Emergency mode<span>.</span></h1><p className="pv-inventory-intro">Bring your daily rationing schedule, household check-ins and immediate actions together.</p></div></header><div className="pv-emergency-inactive"><Icon name="shield" size={34}/><h2>One place for your next steps.</h2><p>Activate your plan using your recorded supplies, selected dependants and current calorie target. You can adjust the situation and schedule afterwards.</p>{onActivate && <button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={onActivate}>Activate emergency mode<Icon name="arrow" size={17}/></button>}</div></section>;
  const summary = buildEmergencySummary({ plan, items, rationPeople, now });
  const scenario = EMERGENCY_SCENARIOS.find(value => value.id === plan.scenarioId) || EMERGENCY_SCENARIOS[0];
  const propertyMissing = plan.propertyId !== 'all' && !properties.some(property => property.id === plan.propertyId);
  const propertyName = plan.propertyId === 'all' ? 'All properties' : properties.find(property => property.id === plan.propertyId)?.name || 'Property unavailable';
  const checked = new Set(plan.checkedActions || []);
  const changeAction = id => {
    try { if (onChange(toggleEmergencyAction(plan, id)) === false) setError('The action could not be saved. Please try again.'); else setError(''); }
    catch (problem) { setError(problem.message || 'The action could not be saved.'); }
  };
  const end = () => { if (onDeactivate() !== false) setConfirmEnd(false); };
  const foodGap = summary.foodShortfallCalories > 0;
  const waterGap = summary.waterShortfallGal > 0;
  const coverageStatus = (days, hasGap, label) => !summary.peopleCount || days === null ? 'Needs details' : summary.horizonElapsed ? 'Review planning duration' : hasGap ? `Plan a ${label} resupply` : 'Recorded stock meets this target';
  const stockWarnings = [
    summary.omittedFoodCount > 0 && `${summary.omittedFoodCount} stocked food ${summary.omittedFoodCount === 1 ? 'entry needs' : 'entries need'} calorie or serving information before it can support this schedule.`,
    summary.excludedFoodCount > 0 && `${summary.excludedFoodCount} food ${summary.excludedFoodCount === 1 ? 'entry is' : 'entries are'} excluded: past or invalid expiry dates, animals and hunting equipment are not ready-to-use meal stock.`,
    summary.excludedWaterCount > 0 && `${summary.excludedWaterCount} stored-water ${summary.excludedWaterCount === 1 ? 'entry is' : 'entries are'} excluded because of a past or invalid recorded expiry date.`,
    summary.undatedFoodCount > 0 && `${summary.undatedFoodCount} stocked food ${summary.undatedFoodCount === 1 ? 'entry has' : 'entries have'} no expiry recorded. Check labels and condition.`,
  ].filter(Boolean);
  return <section className="pv-inventory pv-emergency-workspace" aria-labelledby="emergency-mode-title">
    <header className="pv-inventory-heading pv-emergency-heading"><div><p className="pv-inventory-eyebrow">YOUR EMERGENCY PLAN</p><h1 id="emergency-mode-title">Emergency overview<span>.</span></h1><p className="pv-inventory-intro">Your supplies, people and next steps. One day at a time.</p></div><div className="pv-emergency-heading-actions"><span className="pv-emergency-active-label"><span className="pv-emergency-indicator"/>Active · Day {summary.dayIndex || dayNumber(plan, now)}</span><button type="button" className="pv-inventory-button pv-inventory-button-secondary" aria-expanded={confirmEnd} onClick={() => setConfirmEnd(!confirmEnd)}><Icon name="shield" size={17}/>End emergency mode</button></div></header>
    {confirmEnd && <section className="pv-emergency-end-confirm" aria-label="End emergency mode confirmation"><div><h2>Return to everyday planning?</h2><p>This ends the active routine. Its completion record stays in your saved plan until you activate a new routine. Your inventory stays as recorded.</p></div><div><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setConfirmEnd(false)}>Keep active</button><button type="button" className="pv-inventory-button pv-inventory-button-primary" onClick={end}>Confirm end emergency mode</button></div></section>}
    <div className="pv-emergency-context"><span><Icon name="shield" size={15}/>{scenario.label}</span><span><Icon name="home" size={15}/>{propertyName}</span><span><Icon name="calendar" size={15}/>{summary.horizonDays} day planning target</span><span>Started {dateLabel(summary.startedDate)}</span></div>
    <p className="pv-emergency-follow-official">If there is immediate danger, contact emergency services. Follow current local evacuation and safety instructions.</p>
    {propertyMissing && <div className="pv-emergency-notice" role="status"><Icon name="home" size={18}/><div><strong>This plan’s property is no longer available.</strong><p>Open “Adjust your emergency plan” below and choose an available supply location before relying on these coverage estimates.</p></div></div>}
    <div className="pv-emergency-coverage" aria-label="Emergency supply coverage">
      <button type="button" onClick={() => onCategory?.('food')}><span className="pv-emergency-coverage-label"><Icon name="ration" size={18}/>Food</span><strong>{number(summary.foodDays)}<small>full days</small></strong><p>{summary.peopleCount ? `${number(summary.totalCalories)} eligible calories recorded` : 'Select dependants to estimate'}</p><span className={`pv-emergency-coverage-status${foodGap || summary.foodDays === null || summary.horizonElapsed ? ' needs-attention' : ''}`}><span/>{coverageStatus(summary.foodDays, foodGap, 'food')}</span></button>
      <button type="button" onClick={() => onCategory?.('water')}><span className="pv-emergency-coverage-label"><Icon name="water" size={18}/>Stored water</span><strong>{number(summary.waterDays)}<small>full days</small></strong><p>{summary.peopleCount ? `${number(summary.totalWaterGal)} gallons recorded` : 'Select dependants to estimate'}</p><span className={`pv-emergency-coverage-status${waterGap || summary.waterDays === null || summary.horizonElapsed ? ' needs-attention' : ''}`}><span/>{coverageStatus(summary.waterDays, waterGap, 'water')}</span></button>
      <button type="button" onClick={() => onNavigate?.('community')}><span className="pv-emergency-coverage-label"><Icon name="users" size={18}/>Dependants</span><strong>{summary.peopleCount}<small>{summary.peopleCount === 1 ? 'person' : 'people'}</small></strong><p>{number(summary.dailyCalTarget)} calories · {number(summary.waterGalPerPerson)} gal each day</p><span className="pv-emergency-coverage-status"><span/>Only people marked as dependants</span></button>
    </div>
    {(foodGap || waterGap || stockWarnings.length > 0 || plan.propertyId === 'all') && <div className="pv-emergency-gaps"><Icon name="bell" size={18}/><div><strong>Give these gaps your attention.</strong><ul>{foodGap && <li>{number(summary.foodShortfallCalories)} more recorded calories needed for the {summary.planningDaysRemaining} {summary.planningDaysRemaining === 1 ? 'day' : 'days'} remaining in this plan.</li>}{waterGap && <li>{number(summary.waterShortfallGal)} more gallons needed for the {summary.planningDaysRemaining} {summary.planningDaysRemaining === 1 ? 'day' : 'days'} remaining in this plan.</li>}{stockWarnings.map(note => <li key={note}>{note}</li>)}{plan.propertyId === 'all' && <li>Stock is combined across properties. Confirm what you can safely access.</li>}</ul>{summary.resupplyDate && <p>At the current planning rate, arrange supplies before {dateLabel(summary.resupplyDate)}. This estimate assumes recorded stock is usable and kept up to date.</p>}</div></div>}
    <div className="pv-emergency-layout"><div className="pv-emergency-main"><EmergencySchedule plan={plan} items={items} rationPeople={rationPeople} onChange={onChange} onNavigate={onNavigate} now={now}/><PlanSettings key={`${plan.startedAt}:${plan.scenarioId}:${plan.propertyId}`} plan={plan} properties={properties} onChange={onChange}/></div>
      <aside className="pv-emergency-support"><section className="pv-emergency-immediate" aria-labelledby="emergency-actions-title"><header className="pv-emergency-section-heading"><div><p className="pv-emergency-eyebrow">START HERE</p><h2 id="emergency-actions-title">Immediate actions</h2><p>{scenario.description}</p></div></header>{error && <p className="pv-emergency-error" role="alert">{error}</p>}<ul>{scenario.actions.map(action => <li key={action.id} className={checked.has(action.id) ? 'is-done' : ''}><label><input type="checkbox" checked={checked.has(action.id)} onChange={() => changeAction(action.id)}/><span><strong>{action.title}</strong><small>{action.detail}</small></span></label>{action.navigate && onNavigate && <button type="button" className="pv-emergency-text-button" onClick={() => onNavigate(action.navigate)}>Open<Icon name="arrow" size={13}/><span className="pv-inventory-sr-only"> {action.title}</span></button>}</li>)}</ul>{scenario.sources?.length > 0 && <footer className="pv-emergency-sources"><span>Official guidance</span>{scenario.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<Icon name="arrow" size={12}/><span className="pv-inventory-sr-only"> (opens in a new tab)</span></a>)}</footer>}</section>
      <section className="pv-emergency-quick" aria-labelledby="emergency-quick-title"><header className="pv-emergency-section-heading"><div><p className="pv-emergency-eyebrow">KEEP WITHIN REACH</p><h2 id="emergency-quick-title">Your essential tools</h2></div></header>{quickLinks.map(link => <button type="button" key={link.id} onClick={() => onNavigate?.(link.id)}><Icon name={link.icon} size={19}/><span><strong>{link.title}</strong><small>{link.detail}</small></span><Icon name="arrow" size={15}/></button>)}{onNavigate && <div className="pv-emergency-overview-link"><button type="button" className="pv-emergency-text-button" onClick={() => onNavigate('readiness')}>Readiness overview<Icon name="arrow" size={14}/></button></div>}</section>
      </aside></div>
    <footer className="pv-emergency-footer"><Icon name="shield" size={17}/><p>Your plan remains available on this device. Save an offline copy of the app and handbooks before connectivity is lost. Live weather, radio streams and connected services still require their usual connection.</p></footer>
  </section>;
}
