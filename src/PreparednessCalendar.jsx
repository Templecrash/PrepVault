import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { LOCATION_EVENT, getLocalConditions, readLocation, weatherLabel } from './location.js';
import { isLocalEdition } from './runtime-mode.js';
import { buildEmergencyCalendarEvents, toggleEmergencyEvent } from './emergency-plan.js';
import { CALENDAR_EVENT, CALENDAR_KEY, addCalendarDays, addCalendarMonths, buildCalendarEvents, calendarDateKey, calendarMonthDays, calendarMonthReminders, calendarWeatherDay, normalizeCalendarSetting, parseCalendarDate, readCalendarSetting, toggleCalendarEvent } from './calendar.js';
import './inventory.css';
import './calendar.css';

const KINDS = { all: 'All dates', emergency: 'Emergency schedule', expiry: 'Expiries', maintenance: 'Maintenance', garden: 'Growing', livestock: 'Livestock', task: 'My tasks', record: 'Recorded activity' };
const EMPTY_SETTING = { events: [], reviewed: [] };
const isActionable = event => event.kind !== 'record' && event.source !== 'garden';
const dateLabel = (value, options = { month: 'short', day: 'numeric', year: 'numeric' }) => parseCalendarDate(value)?.toLocaleDateString('en-US', options) || value;
const amount = (value, unit = '') => Number.isFinite(value) ? `${Math.round(value * 10) / 10}${unit}` : '—';
const timeLabel = value => typeof value === 'string' && /T\d{2}:\d{2}/.test(value) ? value.match(/T(\d{2}:\d{2})/)[1] : '—';
const initialSetting = () => {
  try { return { value: readCalendarSetting(localStorage), error: '' }; }
  catch (error) { return { value: EMPTY_SETTING, error: error.message }; }
};

function CalendarWeather({ selected, onNavigate }) {
  const [location, setLocation] = useState(() => readLocation(localStorage));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const local = isLocalEdition();
  useEffect(() => {
    const changed = () => { setLocation(readLocation(localStorage)); setData(null); setError(''); };
    window.addEventListener(LOCATION_EVENT, changed);
    return () => window.removeEventListener(LOCATION_EVENT, changed);
  }, []);
  useEffect(() => {
    if (local || !location) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true); setError('');
      getLocalConditions(location, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setData(result); })
        .catch(problem => { if (!controller.signal.aborted) setError(problem.message); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [local, location, refresh]);
  useEffect(() => {
    if (local || !location) return;
    const update = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) setRefresh(value => value + 1); };
    const timer = setInterval(update, 300_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('online', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('online', update); };
  }, [local, location]);
  const day = calendarWeatherDay(data, selected);
  const daily = data?.weather?.daily || [];
  const fetched = data?.fetchedAt && new Date(data.fetchedAt);
  const flags = day ? [day.low != null && day.low <= 0 && 'Freezing low', day.windGusts >= 50 && 'Strong gusts', day.precipitationProbability >= 60 && 'Rain or snow likely'].filter(Boolean) : [];
  return <section className="pv-calendar-weather" aria-label={`Weather for ${dateLabel(selected)}`}>
    <div className="pv-calendar-section-heading"><div><p className="pv-calendar-eyebrow">DAILY FORECAST</p><h3>{location ? location.name : 'Weather for your plans'}</h3></div><Icon name="sun" size={23}/></div>
    {local ? <p>Live forecasts are available on the online site. Your calendar and tasks work offline.</p> : !location ? <><p>Choose your planning location to see the forecast alongside your dates.</p>{onNavigate && <button type="button" className="pv-calendar-link" onClick={() => onNavigate('location')}>Set location<Icon name="arrow" size={14}/></button>}</> : <>
      {day ? <><div className="pv-calendar-temperature"><strong>{amount(day.high, '°')}<small> / {amount(day.low, '°')}</small></strong><span>{weatherLabel(day.weatherCode)}<small>High / low · °C</small></span></div><dl className="pv-calendar-weather-details"><div><dt>Precipitation</dt><dd>{amount(day.precipitationProbability, '%')}</dd></div><div><dt>Rain</dt><dd>{amount(day.rain, ' mm')}</dd></div><div><dt>Snow</dt><dd>{amount(day.snow, ' cm')}</dd></div><div><dt>Wind gusts</dt><dd>{amount(day.windGusts, ' km/h')}</dd></div><div><dt>Sunrise / sunset</dt><dd>{timeLabel(day.sunrise)} / {timeLabel(day.sunset)}</dd></div><div><dt>UV index</dt><dd>{amount(day.uvIndex)}</dd></div></dl>{flags.length > 0 && <div className="pv-calendar-weather-flags">{flags.map(flag => <span key={flag}>{flag}</span>)}</div>}</> : <p>{busy ? 'Loading the latest forecast…' : error ? 'Weather is unavailable right now. Your saved dates are still available.' : daily.length ? 'No forecast is available for this date. Past weather and dates beyond the forecast horizon are not shown.' : 'No daily forecast is available right now.'}</p>}
      {daily.length > 0 && <p className="pv-calendar-weather-note">Forecast: {dateLabel(daily[0].date, { month: 'short', day: 'numeric' })}–{dateLabel(daily[daily.length - 1].date, { month: 'short', day: 'numeric' })}. Dates and daylight times are local to {location.name}.</p>}
      {error && day && <p className="pv-calendar-weather-note" role="status">Refresh failed. Showing the last loaded forecast.</p>}
      <div className="pv-calendar-weather-footer"><span>{fetched && Number.isFinite(fetched.getTime()) ? `Updated ${fetched.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Forecasts can change'}{data && <> · <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></>}</span><button type="button" className="pv-calendar-link" disabled={busy} onClick={() => setRefresh(value => value + 1)}><Icon name="refresh" size={13}/>{busy ? 'Loading…' : 'Refresh'}</button></div>
    </>}
  </section>;
}

function CalendarEvent({ event, onToggle, onEdit, onDelete, onCategory, onNavigate, disabled }) {
  const history = !isActionable(event);
  const completable = event.kind === 'task' || event.kind === 'emergency';
  return <article className={`pv-calendar-event is-${event.kind}${event.done ? ' is-done' : ''}`}>
    <label className="pv-calendar-event-check"><input type="checkbox" checked={event.done} disabled={disabled} onChange={() => onToggle(event)} aria-label={`${completable ? 'Complete' : 'Review'} ${event.title}${event.time ? ` at ${event.time}` : ''}`}/></label>
    <div className="pv-calendar-event-content"><div className="pv-calendar-event-meta"><span>{KINDS[event.kind]}</span>{event.time && <time dateTime={`${event.date}T${event.time}`}>{event.time}</time>}{event.done && <span>{completable ? 'Completed' : 'Reviewed'}</span>}</div><h3>{event.title}</h3>{event.notes && <p>{event.notes}</p>}<div className="pv-calendar-event-actions">
      {event.kind === 'task' ? <><button type="button" className="pv-calendar-link" disabled={disabled} onClick={() => onEdit(event)}>Edit</button><button type="button" className="pv-calendar-link" disabled={disabled} onClick={() => onDelete(event)}>Delete</button></> : event.kind === 'emergency' ? <><span>{!event.canComplete && !event.done ? 'Upcoming plan' : 'From Emergency mode'}</span>{onNavigate && <button type="button" className="pv-calendar-link" onClick={() => onNavigate('emergency-mode')}>Open Emergency mode<Icon name="arrow" size={13}/></button>}</> : <><span>{history ? 'Activity record' : 'From your plan'}</span>{event.category && onCategory ? <button type="button" className="pv-calendar-link" onClick={() => onCategory(event.category)}>Open supplies<Icon name="arrow" size={13}/></button> : event.navigate && onNavigate ? <button type="button" className="pv-calendar-link" onClick={() => onNavigate(event.navigate)}>Open {event.sourceLabel}<Icon name="arrow" size={13}/></button> : null}</>}
    </div></div>
  </article>;
}

export default function PreparednessCalendar({ items = [], gardenBeds = [], soilTests = [], compostBins = [], livestock = [], slaughterLog = [], bugOutEntries = [], emergencyPlan = null, emergencyItems = items, rationPeople = [], onEmergencyPlanChange, onCategory, onNavigate }) {
  const [loaded] = useState(initialSetting);
  const [setting, setSetting] = useState(loaded.value);
  const [today, setToday] = useState(() => calendarDateKey());
  const [selected, setSelected] = useState(() => calendarDateKey());
  const [month, setMonth] = useState(() => calendarDateKey().slice(0, 7));
  const [kind, setKind] = useState('all');
  const [showDone, setShowDone] = useState(true);
  const [draft, setDraft] = useState(null);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [undoTask, setUndoTask] = useState(null);
  const dayPanel = useRef(null);
  useEffect(() => {
    const timer = setInterval(() => setToday(calendarDateKey()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const regularEvents = useMemo(() => buildCalendarEvents({ items, gardenBeds, soilTests, compostBins, livestock, slaughterLog, bugOutEntries, setting }), [items, gardenBeds, soilTests, compostBins, livestock, slaughterLog, bugOutEntries, setting]);
  const emergencyEvents = useMemo(() => buildEmergencyCalendarEvents({ plan: emergencyPlan, items: emergencyItems, rationPeople, now: new Date(`${today}T12:00:00`) }), [emergencyPlan, emergencyItems, rationPeople, today]);
  const events = useMemo(() => [...regularEvents, ...emergencyEvents].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '00:00').localeCompare(b.time || '00:00') || a.title.localeCompare(b.title)), [regularEvents, emergencyEvents]);
  const filtered = events.filter(event => (kind === 'all' || event.kind === kind) && (showDone || !event.done));
  const byDate = new Map();
  filtered.forEach(event => byDate.set(event.date, [...(byDate.get(event.date) || []), event]));
  const dayEvents = byDate.get(selected) || [];
  const monthly = ['all', 'garden'].includes(kind) ? calendarMonthReminders(items, month) : [];
  const overdue = events.filter(event => event.date < today && !event.done && isActionable(event));
  const todayOpen = events.filter(event => event.date === today && !event.done && isActionable(event));
  const next30 = events.filter(event => event.date >= today && event.date <= addCalendarDays(today, 30) && !event.done && isActionable(event));
  const upcoming = filtered.filter(event => event.date >= today && !event.done && isActionable(event)).slice(0, 6);
  const days = calendarMonthDays(month);
  const persist = next => {
    if (loaded.error) return false;
    try {
      const raw = normalizeCalendarSetting(JSON.stringify(next));
      localStorage.setItem(CALENDAR_KEY, raw);
      setSetting(JSON.parse(raw)); setSaveError('');
      window.dispatchEvent(new Event(CALENDAR_EVENT));
      return true;
    } catch (error) { setSaveError(error.message || 'Calendar changes could not be saved. Please try again.'); return false; }
  };
  const chooseDate = (date, focus = false) => {
    if (!parseCalendarDate(date)) return;
    setSelected(date); setMonth(date.slice(0, 7));
    if (focus) dayPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const moveMonth = direction => { const next = addCalendarMonths(selected, direction); if (next) chooseDate(next); };
  const openTask = event => {
    setDraft(event ? { id: event.taskId, title: event.title, date: event.date, notes: event.notes, done: event.done } : { id: '', title: '', date: selected, notes: '', done: false });
    setNotice(''); dayPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const saveTask = event => {
    event.preventDefault();
    if (!draft.title.trim() || !parseCalendarDate(draft.date)) { setSaveError('Give your task a name and a valid date.'); return; }
    const task = { ...draft, id: draft.id || (globalThis.crypto?.randomUUID?.() ?? `calendar-${Date.now()}-${Math.random().toString(36).slice(2)}`), title: draft.title.trim(), notes: draft.notes.trim() };
    const next = { ...setting, events: draft.id ? setting.events.map(current => current.id === draft.id ? task : current) : [...setting.events, task] };
    if (persist(next)) { setDraft(null); setUndoTask(null); setNotice(draft.id ? 'Task updated.' : 'Task added.'); setKind('all'); setShowDone(true); chooseDate(task.date); }
  };
  const toggle = event => {
    if (event.kind === 'emergency') {
      if (!onEmergencyPlanChange || (!event.done && !event.canComplete)) return;
      try {
        const next = toggleEmergencyEvent(emergencyPlan, event.key);
        if (onEmergencyPlanChange(next) === false) return;
        setSaveError(''); setUndoTask(null);
        setNotice(event.done ? 'Emergency task marked as open.' : 'Emergency task completed. Inventory quantities are unchanged.');
      } catch (error) { setSaveError(error.message || 'The emergency task could not be updated.'); }
      return;
    }
    if (persist(toggleCalendarEvent(setting, event))) { setNotice(event.done ? 'Marked as open.' : event.kind === 'task' ? 'Task completed.' : 'Date reviewed. Update its source record when the work is done.'); setUndoTask(null); }
  };
  const remove = event => {
    const task = setting.events.find(current => current.id === event.taskId);
    if (persist({ ...setting, events: setting.events.filter(current => current.id !== event.taskId) })) { setUndoTask(task); setNotice('Task deleted.'); if (draft?.id === task.id) setDraft(null); }
  };
  const undoDelete = () => { if (undoTask && persist({ ...setting, events: [...setting.events, undoTask] })) { setUndoTask(null); setNotice('Task restored.'); } };
  const filtersActive = kind !== 'all' || !showDone;

  return <section className="pv-inventory pv-calendar" aria-labelledby="calendar-title">
    <header className="pv-inventory-heading"><div><p className="pv-inventory-eyebrow">MAKE ROOM FOR WHAT’S NEXT</p><h1 id="calendar-title">Your calendar<span>.</span></h1><p className="pv-inventory-intro">Expiries, growing dates and the everyday jobs that keep you prepared.</p></div><div className="pv-inventory-actions"><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => chooseDate(today)}>Today<Icon name="clock" size={16}/></button><button type="button" className="pv-inventory-button pv-inventory-button-primary" disabled={Boolean(loaded.error)} onClick={() => openTask()}><Icon name="plus" size={17}/>Add task</button></div></header>
    {emergencyPlan?.active && <div className="pv-calendar-emergency-note"><div><strong>Emergency schedule is included</strong><p>Meals, water allocation and household check-ins follow your active plan. Completion stays in sync with Emergency mode.</p></div>{onNavigate && <button type="button" className="pv-calendar-link" onClick={() => onNavigate('emergency-mode')}>Open emergency plan<Icon name="arrow" size={14}/></button>}</div>}
    <div className="pv-inventory-overview pv-calendar-overview">
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" onClick={() => { setKind('all'); setShowDone(false); chooseDate(today); }}><span className="pv-inventory-stat-icon"><Icon name="clock" size={22}/></span><div><span className="pv-inventory-stat-value">{todayOpen.length}<small>on today’s list</small></span><p>Give the day a little direction</p></div><Icon name="arrow" size={17}/></button>
      <button type="button" className="pv-inventory-stat pv-inventory-stat-action" onClick={() => { setKind('all'); setShowDone(false); chooseDate(next30[0]?.date || today); }}><span className="pv-inventory-stat-icon"><Icon name="leaf" size={22}/></span><div><span className="pv-inventory-stat-value">{next30.length}<small>in the next 30 days</small></span><p>Plan ahead, one day at a time</p></div><Icon name="arrow" size={17}/></button>
      <button type="button" className={`pv-inventory-stat pv-inventory-stat-action${overdue.length ? ' has-overdue' : ''}`} onClick={() => { setKind('all'); setShowDone(false); chooseDate(overdue[0]?.date || today); }}><span className="pv-inventory-stat-icon"><Icon name="bell" size={22}/></span><div><span className="pv-inventory-stat-value">{overdue.length}<small>past dates to review</small></span><p>Check records and close the loop</p></div><Icon name="arrow" size={17}/></button>
    </div>
    {(loaded.error || saveError) && <p className="pv-calendar-error" role="alert">{loaded.error || saveError}</p>}
    <div className="pv-calendar-layout"><div className="pv-calendar-main">
      <section className="pv-calendar-month" aria-label="Month calendar">
        <div className="pv-calendar-month-toolbar"><h2 aria-live="polite">{dateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</h2><div><button type="button" className="pv-calendar-icon-button is-previous" aria-label="Previous month" onClick={() => moveMonth(-1)}><Icon name="chevron" size={17}/></button><button type="button" className="pv-calendar-icon-button" aria-label="Next month" onClick={() => moveMonth(1)}><Icon name="chevron" size={17}/></button></div></div>
        <div className="pv-calendar-filter-row"><label><span className="pv-inventory-sr-only">Calendar date type</span><select value={kind} onChange={event => setKind(event.target.value)}>{Object.entries(KINDS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="pv-calendar-checkbox"><input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)}/>Show completed / reviewed</label></div>
        <div className="pv-calendar-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="pv-calendar-grid" role="group" aria-label="Choose a calendar day">{days.map((date, index) => {
          if (!date) return <span key={`outside-${index}`} className="pv-calendar-day is-outside" aria-hidden="true"/>;
          const list = byDate.get(date) || [];
          const pending = list.filter(event => !event.done).length;
          const outside = !date.startsWith(month);
          return <button type="button" key={date} className={`pv-calendar-day${outside ? ' is-outside' : ''}${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}`} onClick={() => chooseDate(date)} aria-pressed={date === selected} aria-current={date === today ? 'date' : undefined} aria-label={`${dateLabel(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${list.length} ${list.length === 1 ? 'event' : 'events'}${pending ? `, ${pending} open` : ''}`}><span className="pv-calendar-day-number">{parseCalendarDate(date).getDate()}</span><span className="pv-calendar-day-events" aria-hidden="true">{list.slice(0, 2).map(event => <span key={event.id} className={`pv-calendar-chip is-${event.kind}${event.done ? ' is-done' : ''}`}>{event.title}</span>)}{list.length > 2 && <span className="pv-calendar-more">+{list.length - 2} more</span>}</span><span className="pv-calendar-day-dots" aria-hidden="true">{[...new Set(list.map(event => event.kind))].slice(0, 3).map(value => <i key={value} className={`is-${value}`}/>)}{list.length > 0 && <small>{list.length}</small>}</span></button>;
        })}</div>
        <div className="pv-calendar-legend"><span><i className="is-expiry"/>Expiry</span><span><i className="is-garden"/>Growing</span><span><i className="is-maintenance"/>Maintenance</span><span><i className="is-task"/>My tasks</span>{emergencyPlan?.active && <span><i className="is-emergency"/>Emergency</span>}</div>
      </section>
      {monthly.length > 0 && <section className="pv-calendar-month-reminders"><div className="pv-calendar-section-heading"><div><p className="pv-calendar-eyebrow">FROM YOUR SEED RECORDS</p><h2>Growing this month</h2></div><Icon name="leaf" size={22}/></div><p>These months come from your seed records. Add a task when you choose the day.</p><div>{monthly.map(reminder => <article key={reminder.id}><div><h3>{reminder.title}</h3><p>{reminder.notes}</p></div><button type="button" className="pv-calendar-icon-button" aria-label={`Schedule ${reminder.title}`} disabled={Boolean(loaded.error)} onClick={() => { setDraft({ id: '', title: reminder.title, date: selected, notes: reminder.notes, done: false }); dayPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Icon name="plus" size={16}/></button>{onCategory && <button type="button" className="pv-calendar-icon-button" aria-label={`Open supplies for ${reminder.title}`} onClick={() => onCategory(reminder.category)}><Icon name="arrow" size={16}/></button>}</article>)}</div></section>}
      <section className="pv-calendar-upcoming"><div className="pv-calendar-section-heading"><h2>Coming up</h2><span>Next open dates</span></div>{upcoming.length ? <div>{upcoming.map(event => <button type="button" key={event.id} onClick={() => chooseDate(event.date, true)}><time dateTime={event.date}><strong>{dateLabel(event.date, { day: 'numeric' })}</strong><span>{dateLabel(event.date, { month: 'short' })}</span></time><span><strong>{event.title}</strong><small>{KINDS[event.kind]}{event.time ? ` · ${event.time}` : ''} · {dateLabel(event.date, { weekday: 'short', year: 'numeric' })}</small></span><Icon name="arrow" size={16}/></button>)}</div> : <p>{filtersActive ? 'No upcoming dates match these filters.' : 'Your next dated supplies and tasks will appear here.'}</p>}</section>
    </div><aside className="pv-calendar-day-panel" ref={dayPanel} aria-label="Selected day">
      <section className="pv-calendar-agenda"><header><p className="pv-calendar-eyebrow">{selected === today ? 'TODAY' : dateLabel(selected, { weekday: 'long' }).toUpperCase()}</p><div className="pv-calendar-section-heading"><h2>{dateLabel(selected, { month: 'long', day: 'numeric' })}</h2><div className="pv-calendar-day-nav"><button type="button" className="pv-calendar-icon-button is-previous" aria-label="Previous day" onClick={() => chooseDate(addCalendarDays(selected, -1))}><Icon name="chevron" size={16}/></button><button type="button" className="pv-calendar-icon-button" aria-label="Next day" onClick={() => chooseDate(addCalendarDays(selected, 1))}><Icon name="chevron" size={16}/></button></div></div><label className="pv-calendar-date-jump">Jump to date<input type="date" min="1000-01-01" max="9999-12-31" value={selected} onInput={event => chooseDate(event.target.value)} onChange={event => chooseDate(event.target.value)}/></label></header>
        {draft && <form className="pv-calendar-task-form" onSubmit={saveTask}><h3>{draft.id ? 'Edit task' : 'A new task'}</h3><label>Task name<input autoFocus required maxLength={160} placeholder="What needs to happen?" value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}/></label><label>Date<input type="date" required min="1000-01-01" max="9999-12-31" value={draft.date} onInput={event => setDraft(current => ({ ...current, date: event.target.value }))} onChange={event => setDraft(current => ({ ...current, date: event.target.value }))}/></label><label>Notes <span>(optional)</span><textarea rows={3} maxLength={2000} placeholder="A little detail for the day" value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}/></label><div><button type="submit" className="pv-inventory-button pv-inventory-button-primary">Save task</button><button type="button" className="pv-inventory-button pv-inventory-button-secondary" onClick={() => setDraft(null)}>Cancel</button></div></form>}
        {notice && <p className="pv-calendar-notice" role="status">{notice}{undoTask && <button type="button" className="pv-calendar-link" onClick={undoDelete}>Undo</button>}</p>}
        <div className="pv-calendar-agenda-count" aria-live="polite"><span>{dayEvents.length} {dayEvents.length === 1 ? 'date' : 'dates'} to keep in view</span>{filtersActive && <button type="button" className="pv-calendar-link" onClick={() => { setKind('all'); setShowDone(true); }}>Clear filters</button>}</div>
        {dayEvents.length ? <div className="pv-calendar-events">{dayEvents.map(event => <CalendarEvent key={event.id} event={event} onToggle={toggle} onEdit={openTask} onDelete={remove} onCategory={onCategory} onNavigate={onNavigate} disabled={event.kind === 'emergency' ? !onEmergencyPlanChange || (!event.done && !event.canComplete) : Boolean(loaded.error)}/>)}</div> : <div className="pv-calendar-empty-day"><Icon name="sun" size={27}/><h3>A little breathing room</h3><p>{filtersActive ? 'No dates match your filters for this day.' : 'Nothing recorded for this day yet. Add a task, or choose another date.'}</p><button type="button" className="pv-calendar-link" disabled={Boolean(loaded.error)} onClick={() => openTask()}>Add a task<Icon name="plus" size={14}/></button></div>}
        {dayEvents.some(event => !['task', 'emergency'].includes(event.kind)) && <p className="pv-calendar-agenda-note">A check marks a date as reviewed. Edit the source record to change an expiry, schedule or recorded activity.</p>}
        {dayEvents.some(event => event.kind === 'emergency') && <p className="pv-calendar-agenda-note">Emergency checks record completed tasks. Update inventory after using supplies. Future dates cannot be marked complete.</p>}
      </section>
      <CalendarWeather selected={selected} onNavigate={onNavigate}/>
    </aside></div>
  </section>;
}
