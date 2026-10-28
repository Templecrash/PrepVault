import { ANIMAL_TYPES } from './farming-data.js';

export const CALENDAR_KEY = 'prepvault-calendar';
export const CALENDAR_EVENT = 'prepvault-calendar-change';
export const CALENDAR_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_EVENTS = 2000;
const MAX_REVIEWED = 10000;
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value : '';
const named = value => text(value).replace(/_/g, ' ').replace(/^./, character => character.toUpperCase());
const settingError = () => new Error('Saved calendar data could not be read. Recover your calendar from a backup before making changes.');

// Calendar dates stay in local time: parsing YYYY-MM-DD with new Date(string)
// treats the value as UTC and can move a task to the previous day.
export function parseCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9999) return null;
  const result = new Date(year, month - 1, day, 12);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
}

export function calendarDateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(value, days) {
  const date = parseCalendarDate(value);
  if (!date || !Number.isInteger(days)) return null;
  date.setDate(date.getDate() + days);
  const key = calendarDateKey(date);
  return parseCalendarDate(key) ? key : null;
}

export function addCalendarMonths(value, months) {
  const date = parseCalendarDate(value);
  if (!date || !Number.isInteger(months)) return null;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  const key = calendarDateKey(date);
  return parseCalendarDate(key) ? key : null;
}

export function calendarMonthDays(month) {
  const date = parseCalendarDate(`${month}-01`);
  if (!date) return [];
  const offset = (date.getDay() + 6) % 7;
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const length = Math.ceil((count + offset) / 7) * 7;
  return Array.from({ length }, (_, index) => addCalendarDays(`${month}-01`, index - offset));
}

export function normalizeCalendarSetting(raw) {
  if (typeof raw !== 'string' || raw.length > 2_000_000) throw settingError();
  let value;
  try { value = JSON.parse(raw); } catch { throw settingError(); }
  if (!isRecord(value) || !Array.isArray(value.events) || !Array.isArray(value.reviewed) || value.events.length > MAX_EVENTS || value.reviewed.length > MAX_REVIEWED) throw settingError();
  const ids = new Set();
  const events = value.events.map(event => {
    if (!isRecord(event) || typeof event.id !== 'string' || !event.id.trim() || event.id.length > 200 || ids.has(event.id) || typeof event.title !== 'string' || !event.title.trim() || event.title.length > 160 || !parseCalendarDate(event.date) || typeof event.notes !== 'string' || event.notes.length > 2000 || typeof event.done !== 'boolean') throw settingError();
    ids.add(event.id);
    return { id: event.id, title: event.title.trim(), date: event.date, notes: event.notes, done: event.done };
  });
  if (value.reviewed.some(id => typeof id !== 'string' || !id.trim() || id.length > 600)) throw settingError();
  return JSON.stringify({ events, reviewed: [...new Set(value.reviewed)] });
}

export function readCalendarSetting(storage) {
  const raw = storage.getItem(CALENDAR_KEY);
  return raw === null ? { events: [], reviewed: [] } : JSON.parse(normalizeCalendarSetting(raw));
}

export function toggleCalendarEvent(setting, event) {
  if (event.kind === 'task') return { ...setting, events: setting.events.map(task => task.id === event.taskId ? { ...task, done: !task.done } : task) };
  const reviewed = new Set(setting.reviewed);
  if (reviewed.has(event.id)) reviewed.delete(event.id); else reviewed.add(event.id);
  return { ...setting, reviewed: [...reviewed] };
}

const ITEM_DATES = {
  expiryDate: ['Expiry', 'expiry', 'Recorded expiry date. Check the item and update its supply record after rotating or replacing it.'],
  planExpiry: ['Plan expires', 'expiry', 'Review this subscription or service plan before its recorded expiry.'],
  nextService: ['Service due', 'maintenance', 'Your recorded next service date.'],
  lastRefreshed: ['Water refreshed', 'record', 'Recorded water refresh.'],
  lastInspection: ['Inspected', 'record', 'Recorded inspection.'],
  lastService: ['Serviced', 'record', 'Recorded service.'],
  lastSwept: ['Chimney swept', 'record', 'Recorded sweep.'],
  lastRotated: ['Stock rotated', 'record', 'Recorded stock rotation.'],
  lastOilChange: ['Oil changed', 'record', 'Recorded oil change.'],
  lastReplaced: ['Replaced', 'record', 'Recorded replacement.'],
  lastAudited: ['Bag audited', 'record', 'Recorded bug-out bag audit.'],
};

export function buildCalendarEvents({ items = [], gardenBeds = [], soilTests = [], compostBins = [], livestock = [], slaughterLog = [], bugOutEntries = [], setting = { events: [], reviewed: [] } } = {}) {
  const events = [];
  const reviewed = new Set(setting.reviewed || []);
  const add = event => {
    if (!parseCalendarDate(event.date)) return;
    const id = `${event.source}:${event.sourceId}:${event.field}:${event.date}`;
    events.push({ ...event, id, done: reviewed.has(id), sourceLabel: event.sourceLabel || 'Farming' });
  };
  items.filter(isRecord).forEach((item, index) => {
    if (Number(item.quantity) === 0) return;
    const fields = isRecord(item.fields) ? item.fields : {};
    const linked = bugOutEntries.filter(entry => entry?.inventoryId === item.id);
    const context = [item.location && `Stored: ${item.location}`, linked.length && `Bug Out: ${linked.map(entry => `${entry.name}${entry.assignee ? ` (${entry.assignee})` : ''}`).join(', ')}`].filter(Boolean).join(' · ');
    Object.entries(ITEM_DATES).forEach(([field, [label, kind, detail]]) => add({ source: 'item', sourceId: item.id ?? index, field, date: fields[field], title: `${label}: ${item.name || 'Unnamed supply'}`, kind, notes: [detail, context].filter(Boolean).join(' '), category: item.category, sourceLabel: 'Supplies' }));
    const months = { 'Every 3mo': 3, 'Every 6mo': 6, Annually: 12 }[fields.oilInterval];
    if (months && parseCalendarDate(fields.lastOilChange)) add({ source: 'item', sourceId: item.id ?? index, field: 'oilDue', date: addCalendarMonths(fields.lastOilChange, months), title: `Oil change due: ${item.name || 'Vehicle'}`, kind: 'maintenance', notes: `Based on your recorded oil change and ${fields.oilInterval.toLowerCase()} interval. Update the oil-change record when complete. ${context}`.trim(), category: item.category, sourceLabel: 'Supplies' });
  });
  gardenBeds.filter(isRecord).forEach((bed, index) => {
    const grouped = new Map();
    (bed.cells || []).filter(isRecord).forEach(cell => {
      if (!parseCalendarDate(cell.plantedDate)) return;
      const key = `${cell.cropId}:${cell.plantedDate}`;
      const group = grouped.get(key) || { cropId: cell.cropId, date: cell.plantedDate, count: 0 };
      group.count += 1; grouped.set(key, group);
    });
    grouped.forEach(group => add({ source: 'garden', sourceId: bed.id ?? index, field: `planted-${group.cropId}`, date: group.date, title: `Planted: ${named(group.cropId) || 'Crop'}`, kind: 'garden', notes: `${bed.name || 'Garden bed'} · ${group.count} planted ${group.count === 1 ? 'cell' : 'cells'}${bed.location ? ` · ${bed.location}` : ''}. Recorded planting date.`, navigate: 'farming' }));
  });
  soilTests.filter(isRecord).forEach((test, index) => add({ source: 'soil', sourceId: test.id ?? index, field: 'tested', date: test.date, title: `Soil test: ${test.bedName || 'Growing area'}`, kind: 'record', notes: [test.ph !== '' && test.ph != null && `pH ${test.ph}`, test.soilType, test.notes].filter(Boolean).join(' · '), navigate: 'farming' }));
  compostBins.filter(isRecord).forEach((bin, index) => {
    const common = { source: 'compost', sourceId: bin.id ?? index, navigate: 'farming' };
    add({ ...common, field: 'started', date: bin.startDate, title: `Compost started: ${bin.name || 'Bin'}`, kind: 'record', notes: text(bin.notes) });
    add({ ...common, field: 'turned', date: bin.lastTurned, title: `Compost turned: ${bin.name || 'Bin'}`, kind: 'record', notes: text(bin.notes) });
    const frequency = Number(bin.turningFreqDays);
    const anchor = parseCalendarDate(bin.lastTurned) ? bin.lastTurned : bin.startDate;
    if (bin.stage !== 'ready' && bin.stage !== 'finished' && Number.isInteger(frequency) && frequency > 0 && frequency <= 366) add({ ...common, field: 'turn-due', date: addCalendarDays(anchor, frequency), title: `Turn compost: ${bin.name || 'Bin'}`, kind: 'garden', notes: `Next turn from your ${frequency}-day schedule. Record the new last-turned date in Farming after turning this bin.` });
  });
  livestock.filter(isRecord).forEach((animal, index) => {
    const type = ANIMAL_TYPES[animal.type];
    const common = { source: 'animal', sourceId: animal.id ?? index, navigate: 'farming' };
    add({ ...common, field: 'bred', date: animal.lastBred, title: `Breeding / incubation: ${animal.name || type?.label || 'Animal group'}`, kind: 'record', notes: text(animal.notes) });
    if (type?.gestation > 0 && animal.status === 'pregnant') add({ ...common, field: 'expected', date: addCalendarDays(animal.lastBred, type.gestation), title: `Estimated birth / hatch: ${animal.name || type.label}`, kind: 'livestock', notes: `Estimate from your recorded breeding / incubation date plus the ${type.gestation}-day reference in Farming. Actual timing varies.` });
  });
  slaughterLog.filter(isRecord).forEach((entry, index) => add({ source: 'preservation', sourceId: entry.id ?? index, field: 'record', date: entry.date, title: `Preservation: ${ANIMAL_TYPES[entry.animalType]?.label || named(entry.animalType) || 'Harvest'}`, kind: 'record', notes: [entry.yieldLbs && `${entry.yieldLbs} lb`, entry.preservationMethod, entry.storageLocation, entry.notes].filter(Boolean).join(' · '), navigate: 'farming' }));
  (setting.events || []).forEach(task => { if (parseCalendarDate(task.date)) events.push({ ...task, id: `task:${task.id}`, taskId: task.id, kind: 'task', sourceLabel: 'My task' }); });
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function calendarMonthReminders(items, month) {
  const date = parseCalendarDate(`${month}-01`);
  if (!date) return [];
  const shortMonth = CALENDAR_MONTHS[date.getMonth()];
  return items.filter(item => isRecord(item) && Number(item.quantity) !== 0).flatMap((item, index) => ['plantMonth', 'harvestMonth'].flatMap(field => item.fields?.[field] === shortMonth ? [{ id: `month:${item.id ?? index}:${field}:${month}`, title: `${field === 'plantMonth' ? 'Plant' : 'Harvest'}: ${item.fields.cropName || item.name || 'Crop'}`, notes: `${item.name || 'Seed record'} · ${shortMonth} is recorded in Supplies. Choose a day for your conditions.`, category: item.category || 'farm', kind: 'garden', month }] : []));
}

export function calendarWeatherDay(data, date) {
  if (!parseCalendarDate(date) || data?.weather?.status !== 'ready') return null;
  return (data.weather.daily || []).find(day => day.date === date) || null;
}
