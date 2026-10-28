import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { addCalendarDays, addCalendarMonths, buildCalendarEvents, calendarDateKey, calendarMonthDays, calendarMonthReminders, calendarWeatherDay, normalizeCalendarSetting, parseCalendarDate, readCalendarSetting, toggleCalendarEvent } from '../src/calendar.js';

const task = { id: 't1', title: 'Check water storage', date: '2026-10-28', notes: 'Bring the checklist', done: false };
const setting = { events: [task], reviewed: [] };

test('calendar dates reject rollovers and ambiguous formats', () => {
  for (const invalid of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-10-00', '10/28/2026', '2026-10-28T00:00:00Z', '', null]) assert.equal(parseCalendarDate(invalid), null);
  assert.equal(calendarDateKey(parseCalendarDate('2028-02-29')), '2028-02-29');
});

test('calendar dates remain on the same day on both sides of UTC and across DST', () => {
  const script = "import { parseCalendarDate, calendarDateKey, addCalendarDays } from './src/calendar.js'; console.log(JSON.stringify([calendarDateKey(parseCalendarDate('2026-10-28')), addCalendarDays('2026-03-07', 2), addCalendarDays('2026-10-31', 2)]));";
  for (const timezone of ['America/Los_Angeles', 'America/Toronto', 'Pacific/Auckland']) {
    const actual = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' }));
    assert.deepEqual(actual, ['2026-10-28', '2026-03-09', '2026-11-02'], timezone);
  }
});

test('month navigation and oil intervals clamp at month end and leap days', () => {
  assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addCalendarMonths('2028-02-29', 12), '2029-02-28');
  assert.equal(addCalendarMonths('2026-12-31', 3), '2027-03-31');
  assert.equal(addCalendarDays('2026-02-29', 7), null);
  assert.equal(addCalendarDays('2026-01-01', 1.5), null);
});

test('month grid starts on Monday and covers complete weeks', () => {
  const days = calendarMonthDays('2026-10');
  assert.equal(days[0], '2026-09-28');
  assert.equal(days.at(-1), '2026-11-01');
  assert.equal(days.length, 35);
  assert.equal(new Set(days).size, 35);
  assert.deepEqual(calendarMonthDays('nonsense'), []);
});

test('supply dates retain their field meaning and inventory source', () => {
  const events = buildCalendarEvents({ items: [{ id: 'food-1', name: 'Beans', category: 'food', location: 'Pantry', quantity: 3, fields: { expiryDate: '2026-11-03', planExpiry: '2026-12-01', nextService: '2027-01-10', lastAudited: '2026-09-01' } }], bugOutEntries: [{ id: 'grab-1', inventoryId: 'food-1', name: 'Two cans', assignee: 'Sam' }] });
  assert.equal(events.length, 4);
  assert.equal(events.find(event => event.field === 'expiryDate').date, '2026-11-03');
  assert.equal(events.find(event => event.field === 'lastAudited').kind, 'record');
  assert.ok(events.every(event => event.category === 'food'));
  assert.match(events[0].notes, /Pantry/);
  assert.match(events[0].notes, /Two cans \(Sam\)/);
});

test('empty supplies, malformed dates and unanchored durations do not create dates', () => {
  const events = buildCalendarEvents({ items: [{ id: 'empty', quantity: 0, fields: { expiryDate: '2026-12-01' } }, { id: 'bad', fields: { expiryDate: '2026-02-30', daysSupply: '30', daysToHarvest: '75' } }, { id: 'miles', fields: { lastOilChange: '2026-01-31', oilInterval: 'Every 5000mi' } }], livestock: [{ id: 'feed', feedStockDays: 30 }], compostBins: [{ id: 'unanchored', turningFreqDays: 7 }] });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'record');
});

test('recorded calendar intervals create the next maintenance date only', () => {
  const events = buildCalendarEvents({ items: [{ id: 'car', name: 'Car', fields: { lastOilChange: '2026-01-31', oilInterval: 'Every 3mo' } }], compostBins: [{ id: 'comp', name: 'Garden', startDate: '2026-10-01', lastTurned: '2026-10-27', turningFreqDays: 7, stage: 'active' }] });
  assert.equal(events.find(event => event.field === 'oilDue').date, '2026-04-30');
  assert.equal(events.find(event => event.field === 'turn-due').date, '2026-11-03');
  assert.equal(events.filter(event => event.field === 'turn-due').length, 1);
  assert.equal(buildCalendarEvents({ compostBins: [{ id: 'done', startDate: '2026-10-01', turningFreqDays: 7, stage: 'ready' }] }).some(event => event.field === 'turn-due'), false);
});

test('monthly planting and harvest reminders recur without inventing an exact day', () => {
  const items = [{ id: 'seed', name: 'Roma seeds', category: 'farm', fields: { cropName: 'Tomato', plantMonth: 'Apr', harvestMonth: 'Aug' } }];
  assert.equal(buildCalendarEvents({ items }).length, 0);
  const reminders = calendarMonthReminders(items, '2026-04');
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].title, 'Plant: Tomato');
  assert.equal(reminders[0].date, undefined);
  assert.equal(calendarMonthReminders(items, '2027-04').length, 1);
  assert.equal(calendarMonthReminders(items, '2026-05').length, 0);
  assert.equal(calendarMonthReminders(items, '2026-08')[0].title, 'Harvest: Tomato');
});

test('garden planting cells are grouped by crop and actual date', () => {
  const events = buildCalendarEvents({ gardenBeds: [{ id: 'bed', name: 'East bed', cells: [{ cropId: 'tomato', plantedDate: '2026-05-20' }, { cropId: 'tomato', plantedDate: '2026-05-20' }, { cropId: 'tomato', plantedDate: '2026-05-21' }, { cropId: 'carrot' }] }] });
  assert.equal(events.length, 2);
  assert.match(events[0].notes, /2 planted cells/);
  assert.equal(events[0].navigate, 'farming');
  assert.equal(events[1].date, '2026-05-21');
});

test('farming dates distinguish estimates from recorded activity', () => {
  const events = buildCalendarEvents({ soilTests: [{ id: 's', bedName: 'East bed', date: '2026-10-20', ph: 6.5 }], livestock: [{ id: 'g', type: 'goat', status: 'pregnant', lastBred: '2026-06-01', name: 'Daisy' }], slaughterLog: [{ id: 'l', animalType: 'chicken', date: '2026-10-01', preservationMethod: 'frozen' }] });
  const estimate = events.find(event => event.field === 'expected');
  assert.equal(estimate.date, '2026-10-29');
  assert.match(estimate.title, /Estimated/);
  assert.match(estimate.notes, /150-day/);
  assert.equal(events.find(event => event.source === 'soil').kind, 'record');
  assert.equal(events.find(event => event.source === 'preservation').kind, 'record');
});

test('review status belongs to a source event and date, leaving supply data unchanged', () => {
  const items = [{ id: 'a', name: 'Beans', fields: { expiryDate: '2026-11-03' } }];
  const source = buildCalendarEvents({ items })[0];
  const next = toggleCalendarEvent({ events: [], reviewed: [] }, source);
  assert.equal(buildCalendarEvents({ items, setting: next })[0].done, true);
  assert.equal(items[0].fields.expiryDate, '2026-11-03');
  assert.equal(buildCalendarEvents({ items: [{ ...items[0], fields: { expiryDate: '2027-11-03' } }], setting: next })[0].done, false);
  assert.deepEqual(toggleCalendarEvent(next, source).reviewed, []);
});

test('personal task completion updates the task and round trips through storage', () => {
  const event = buildCalendarEvents({ setting })[0];
  const next = toggleCalendarEvent(setting, event);
  assert.equal(next.events[0].done, true);
  assert.equal(setting.events[0].done, false);
  const raw = normalizeCalendarSetting(JSON.stringify(next));
  assert.deepEqual(readCalendarSetting({ getItem: () => raw }), next);
  assert.deepEqual(readCalendarSetting({ getItem: () => null }), { events: [], reviewed: [] });
});

test('invalid calendar backups are rejected without silently dropping tasks', () => {
  for (const value of [null, {}, { events: [task], reviewed: false }, { events: [task, task], reviewed: [] }, { events: [{ ...task, date: '2026-02-30' }], reviewed: [] }, { events: [{ ...task, done: 'yes' }], reviewed: [] }, { events: [{ ...task, title: '  ' }], reviewed: [] }, { events: [], reviewed: [null] }]) assert.throws(() => normalizeCalendarSetting(JSON.stringify(value)));
  assert.throws(() => normalizeCalendarSetting('broken json'));
  assert.throws(() => readCalendarSetting({ getItem: () => 'broken json' }));
});

test('weather only appears for the exact day inside the available daily forecast', () => {
  const data = { weather: { status: 'ready', today: { high: 10 }, daily: [{ date: '2026-10-28', high: 9 }, { date: '2026-10-29', high: 12 }] } };
  assert.equal(calendarWeatherDay(data, '2026-10-29').high, 12);
  assert.equal(calendarWeatherDay(data, '2026-12-01'), null);
  assert.equal(calendarWeatherDay(data, '2026-10-27'), null);
  assert.equal(calendarWeatherDay({ weather: { ...data.weather, status: 'unavailable' } }, '2026-10-28'), null);
});
