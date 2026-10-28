import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmergencyPlan, validateEmergencyPlan, updateEmergencyPlan, deactivateEmergencyPlan, toggleEmergencyEvent, toggleEmergencyAction, buildEmergencySchedule, buildEmergencySummary, buildEmergencyCalendarEvents, emergencyDateKey, emergencyAddDays, EMERGENCY_SCENARIOS } from '../src/emergency-plan.js';
import { computeRationing } from '../src/rationing.js';
import { computeEssentialCoverage } from '../src/essential-coverage.js';
import { buildEssentialPlanning } from '../src/essential-planning.js';

const now = new Date(2026, 9, 28, 10, 0, 0);
const today = emergencyDateKey(now);
const people = [{ id: 'adult-a', name: 'A', isDependant: true }, { id: 'adult-b', name: 'B', isDependant: true }, { id: 'neighbour', name: 'C', isDependant: false }];
const food = { id: 'cans', category: 'food', subType: 'cannedGoods', name: 'Cans', quantity: 40, propertyId: 'prop1', fields: { calories: '250', servings: '2', expiryDate: '2027-01-01' } };
const water = { id: 'water', category: 'water', subType: 'storedWater', name: 'Stored water', quantity: 20, propertyId: 'prop1', fields: { capacity: '55' } };
const makePlan = changes => createEmergencyPlan({ propertyId: 'prop1', ...changes }, now);

test('activation preserves the existing calorie target, uses bounded defaults and does not mutate options', () => {
  const options = { propertyId: 'cabin', dailyCalTarget: 2300 };
  const before = structuredClone(options);
  const plan = createEmergencyPlan(options, now);
  assert.equal(plan.active, true);
  assert.equal(plan.dailyCalTarget, 2300);
  assert.equal(plan.waterGalPerPerson, 1);
  assert.equal(plan.horizonDays, 14);
  assert.deepEqual(plan.mealTimes, ['08:00', '13:00', '18:00']);
  assert.deepEqual(options, before);
  assert.equal(validateEmergencyPlan(undefined), null);
  assert.equal(validateEmergencyPlan(null), null);
});

test('strict validation rejects malformed backup settings and strips unknown fields', () => {
  const plan = makePlan();
  for (const change of [
    { version: 2 }, { active: 'true' }, { scenarioId: 'unknown' }, { propertyId: '__proto__' }, { propertyId: '' },
    { horizonDays: 0 }, { horizonDays: 91 }, { horizonDays: 1.5 }, { dailyCalTarget: 999 }, { dailyCalTarget: 3001 },
    { waterGalPerPerson: .5 }, { waterGalPerPerson: Infinity }, { mealTimes: ['08:00', '24:00', '19:00'] },
    { mealTimes: ['13:00', '08:00', '19:00'] }, { checkInTimes: ['09:00', '09:00'] },
    { startedAt: '2026-02-30T00:00:00Z' }, { endedAt: now.toISOString() }, { completed: [] },
    { startedAt: '0000-06-15T12:00:00Z' }, { startedAt: '0999-06-15T12:00:00Z' }, { startedAt: '9999-06-15T12:00:00Z' },
    { startedAt: '9998-12-25T12:00:00Z', horizonDays: 14 }, { active: false, endedAt: '9999-06-15T12:00:00Z' },
    { completed: { [`${today}:not-an-event`]: now.toISOString() } },
    { completed: { '2026-02-30:breakfast': now.toISOString() } },
    { checkedActions: ['invented-action'] }, { checkedActions: ['household-check', 'household-check'] },
  ]) assert.throws(() => validateEmergencyPlan({ ...plan, ...change }), undefined, JSON.stringify(change));
  assert.equal(Object.hasOwn(validateEmergencyPlan({ ...plan, credential: 'not retained' }), 'credential'), false);
});

test('only marked dependants count, and repeated directory IDs do not inflate allocations', () => {
  const plan = makePlan();
  const result = buildEmergencySummary({ plan, items: [food, water], rationPeople: [...people, people[0]], now });
  assert.equal(result.peopleCount, 2);
  assert.equal(result.dailyCalories, 4000);
  assert.equal(result.dailyWaterGal, 2);
  assert.equal(result.foodDays, 5);
  assert.equal(result.waterDays, 10);
});

test('each property remains isolated, with missing item properties treated as legacy prop1 only', () => {
  const missing = { ...food, id: 'legacy', propertyId: undefined };
  const cabin = { ...food, id: 'cabin-food', quantity: 4, propertyId: 'cabin' };
  assert.equal(buildEmergencySummary({ plan: makePlan(), items: [missing, cabin], rationPeople: people, now }).totalCalories, 20000);
  assert.equal(buildEmergencySummary({ plan: makePlan({ propertyId: 'cabin' }), items: [missing, cabin], rationPeople: people, now }).totalCalories, 2000);
  assert.equal(buildEmergencySummary({ plan: makePlan({ propertyId: 'deleted-place' }), items: [missing, cabin], rationPeople: people, now }).totalCalories, 0);
  assert.equal(buildEmergencySummary({ plan: makePlan({ propertyId: 'all' }), items: [missing, cabin], rationPeople: people, now }).totalCalories, 22000);
});

test('past or invalid expiries, livestock and hunting equipment are not meal stock', () => {
  const plan = makePlan();
  const result = buildEmergencySummary({ plan, rationPeople: people, now, items: [
    food, water,
    { ...food, id: 'expired', fields: { ...food.fields, expiryDate: '2026-10-27' } },
    { ...food, id: 'invalid-date', fields: { ...food.fields, expiryDate: '2026-02-30' } },
    { ...food, id: 'animals', subType: 'livestock' },
    { ...food, id: 'hunting', subType: 'huntingFishing' },
    { ...water, id: 'expired-water', fields: { expiryDate: '2026-10-27' } },
    { ...food, id: 'unknown-calories', fields: { servings: '2' } },
    { ...food, id: 'unknown-servings', fields: { calories: '250' } },
  ] });
  assert.equal(result.totalCalories, 20000);
  assert.equal(result.totalWaterGal, 20);
  assert.equal(result.excludedFoodCount, 4);
  assert.equal(result.excludedWaterCount, 1);
  assert.equal(result.omittedFoodCount, 2);
  assert.equal(result.foodItems.some(item => item.subType === 'livestock'), false);
  assert.ok(result.notes.some(note => /not a limit on drinking/.test(note)));
});

test('zero dependants produces unknown allocations and coverage rather than division or phantom people', () => {
  const plan = makePlan();
  const result = buildEmergencySummary({ plan, items: [food, water], rationPeople: [], now });
  assert.equal(result.peopleCount, 0);
  assert.equal(result.foodDays, null);
  assert.equal(result.dailyCalories, null);
  assert.equal(result.dailyWaterGal, null);
  assert.equal(result.resupplyDate, null);
  assert.equal(result.foodShortfallCalories, null);
  assert.equal(result.totalCalories, 20000);
  const events = buildEmergencySchedule({ plan, items: [food, water], rationPeople: [], now });
  assert.equal(events.length, 6);
  assert.ok(events.filter(event => event.type === 'meal').every(event => event.householdCalories === null && event.allocation.length === 0));
});

test('daily schedule has exact target splits, stable keys and no duplicated stock across meals', () => {
  const plan = makePlan({ dailyCalTarget: 2100 });
  const items = [{ ...food, quantity: 10 }, water];
  const before = structuredClone(items);
  const events = buildEmergencySchedule({ plan, items, rationPeople: people, now });
  const meals = events.filter(event => event.type === 'meal');
  assert.equal(events.length, 6);
  assert.deepEqual(meals.map(event => event.caloriesPerPerson), [525, 735, 840]);
  assert.equal(meals.reduce((sum, event) => sum + event.householdCalories, 0), 4200);
  assert.equal(meals.reduce((sum, event) => sum + event.allocation.reduce((total, item) => total + item.calories, 0), 0), 4200);
  assert.ok(meals.flatMap(event => event.allocation).reduce((sum, item) => sum + item.units, 0) <= 10);
  assert.equal(events.find(event => event.type === 'water').householdWaterGal, 2);
  assert.equal(events.find(event => event.title === 'Breakfast').key, `${today}:breakfast`);
  assert.deepEqual(items, before);
});

test('shortfalls stay visible instead of reducing target or promising the same limited food repeatedly', () => {
  const plan = makePlan();
  const events = buildEmergencySchedule({ plan, items: [{ ...food, quantity: 2 }, { ...water, quantity: 1 }], rationPeople: people, now });
  const meals = events.filter(event => event.type === 'meal');
  assert.equal(meals.reduce((sum, event) => sum + event.householdCalories, 0), 4000);
  assert.equal(meals.reduce((sum, event) => sum + event.shortfallCalories, 0), 3000);
  assert.equal(events.find(event => event.type === 'water').shortfallWaterGal, 1);
  assert.equal(plan.dailyCalTarget, 2000);
});

test('future meal projections account for earlier projected use and expiry', () => {
  const plan = makePlan();
  const tomorrow = emergencyAddDays(today, 1);
  const events = buildEmergencySchedule({ plan, items: [{ ...food, quantity: 10 }, water], rationPeople: people, date: tomorrow, now });
  assert.equal(events.filter(event => event.type === 'meal').reduce((sum, event) => sum + event.shortfallCalories, 0), 3000);
  const expiredTomorrow = buildEmergencySchedule({ plan, items: [{ ...food, fields: { ...food.fields, expiryDate: today } }, water], rationPeople: people, date: tomorrow, now });
  assert.ok(expiredTomorrow.filter(event => event.type === 'meal').every(event => event.allocation.length === 0));
});

test('water projections use earlier-expiring stock first without subtracting it again from later stock', () => {
  const items = [
    { ...water, id: 'later-water', quantity: 2, fields: { expiryDate: '2030-01-01' } },
    { ...water, id: 'use-today-water', quantity: 2, fields: { expiryDate: today } },
  ];
  const before = structuredClone(items);
  const options = { plan: makePlan(), items, rationPeople: people.slice(0, 1), now };
  // Today uses one gallon from the earlier expiry, tomorrow uses one fresh
  // gallon. One fresh gallon remains for day three; the unused old gallon expires.
  const dayThree = buildEmergencySchedule({ ...options, date: emergencyAddDays(today, 2) });
  assert.equal(dayThree.find(event => event.type === 'water').shortfallWaterGal, 0);
  const dayFour = buildEmergencySchedule({ ...options, date: emergencyAddDays(today, 3) });
  assert.equal(dayFour.find(event => event.type === 'water').shortfallWaterGal, 1);
  const expiredOnly = buildEmergencySchedule({ ...options, items: [items[1]], date: emergencyAddDays(today, 1) });
  assert.equal(expiredOnly.find(event => event.type === 'water').shortfallWaterGal, 1);
  assert.deepEqual(items, before);
});

test('completed breakfast is history and does not consume manually updated current stock again', () => {
  const plan = toggleEmergencyEvent(makePlan({ horizonDays: 1 }), `${today}:breakfast`, now);
  const items = [{ ...food, quantity: 3 }, water]; // 1,500 calories left after breakfast.
  const before = structuredClone(items);
  const events = buildEmergencySchedule({ plan, items, rationPeople: people.slice(0, 1), now });
  const breakfast = events.find(event => event.key === `${today}:breakfast`);
  assert.equal(breakfast.done, true);
  assert.deepEqual(breakfast.allocation, []);
  assert.equal(breakfast.shortfallCalories, null);
  const remaining = events.filter(event => event.type === 'meal' && !event.done);
  assert.deepEqual(remaining.map(event => event.allocation.reduce((sum, entry) => sum + entry.calories, 0)), [700, 800]);
  assert.ok(remaining.every(event => event.shortfallCalories === 0));
  const summary = buildEmergencySummary({ plan, items, rationPeople: people.slice(0, 1), now });
  assert.equal(summary.remainingCalories, 1500);
  assert.equal(summary.foodShortfallCalories, 0);
  assert.deepEqual(items, before);
  const undone = toggleEmergencyEvent(plan, `${today}:breakfast`, now);
  assert.equal(buildEmergencySummary({ plan: undone, items, rationPeople: people.slice(0, 1), now }).foodShortfallCalories, 500);
});

test('future projections and horizon shortfalls skip completed current-day meals and water allocations', () => {
  let plan = makePlan({ horizonDays: 2 });
  plan = toggleEmergencyEvent(toggleEmergencyEvent(plan, `${today}:breakfast`, now), `${today}:water`, now);
  const items = [{ ...food, quantity: 7 }, { ...water, quantity: 1 }];
  const options = { plan, items, rationPeople: people.slice(0, 1), now };
  const current = buildEmergencySchedule(options).find(event => event.type === 'water');
  assert.equal(current.done, true);
  assert.equal(current.shortfallWaterGal, null);
  const tomorrow = buildEmergencySchedule({ ...options, date: emergencyAddDays(today, 1) });
  assert.equal(tomorrow.filter(event => event.type === 'meal').reduce((sum, event) => sum + event.allocation.reduce((calories, entry) => calories + entry.calories, 0), 0), 2000);
  assert.ok(tomorrow.filter(event => event.type === 'meal').every(event => event.shortfallCalories === 0));
  assert.equal(tomorrow.find(event => event.type === 'water').shortfallWaterGal, 0);
  const summary = buildEmergencySummary(options);
  assert.equal(summary.remainingCalories, 3500);
  assert.equal(summary.remainingWaterGal, 1);
  assert.equal(summary.foodShortfallCalories, 0);
  assert.equal(summary.waterShortfallGal, 0);
  const undone = toggleEmergencyEvent(plan, `${today}:water`, now);
  assert.equal(buildEmergencySummary({ ...options, plan: undone }).waterShortfallGal, 1);
  assert.equal(buildEmergencySchedule({ ...options, plan: undone, date: emergencyAddDays(today, 1) }).find(event => event.type === 'water').shortfallWaterGal, 1);
});

test('completion persists independently of stock, can be undone, and future dates cannot be checked', () => {
  const plan = makePlan(), key = `${today}:breakfast`;
  const next = toggleEmergencyEvent(plan, key, now);
  assert.equal(next.completed[key], now.toISOString());
  assert.equal(plan.completed[key], undefined);
  assert.equal(buildEmergencySchedule({ plan: next, items: [food, water], rationPeople: people, now }).find(event => event.key === key).done, true);
  assert.equal(toggleEmergencyEvent(next, key, now).completed[key], undefined);
  assert.throws(() => toggleEmergencyEvent(plan, `${emergencyAddDays(today, 1)}:breakfast`, now), /Future/);
  assert.throws(() => toggleEmergencyEvent(plan, `${emergencyAddDays(today, -1)}:breakfast`, now), /outside/);
  assert.throws(() => toggleEmergencyEvent(plan, `${today}:invented`, now), /outside/);
  const futureKey = `${emergencyAddDays(today, 1)}:breakfast`;
  const futureRecorded = { ...plan, completed: { [futureKey]: now.toISOString() } };
  assert.equal(buildEmergencyCalendarEvents({ plan: futureRecorded, now }).find(event => event.key === futureKey).canComplete, true);
  assert.equal(toggleEmergencyEvent(futureRecorded, futureKey, now).completed[futureKey], undefined);
});

test('deactivation retains settings and records while stopping schedule generation', () => {
  const plan = toggleEmergencyEvent(makePlan(), `${today}:water`, now);
  const later = new Date(now.getTime() + 3600000);
  const ended = deactivateEmergencyPlan(plan, later);
  assert.equal(ended.active, false);
  assert.equal(ended.endedAt, later.toISOString());
  assert.deepEqual(ended.completed, plan.completed);
  assert.deepEqual(buildEmergencySchedule({ plan: ended, now: later }), []);
  assert.deepEqual(buildEmergencyCalendarEvents({ plan: ended, now: later }), []);
  assert.throws(() => toggleEmergencyEvent(ended, `${today}:water`, later), /Activate/);
});

test('settings edits preserve records unless switching property, and cannot bypass activation helpers', () => {
  const plan = toggleEmergencyAction(toggleEmergencyEvent(makePlan(), `${today}:breakfast`, now), 'household-check');
  assert.equal(updateEmergencyPlan(plan, { dailyCalTarget: 2200 }).completed[`${today}:breakfast`], now.toISOString());
  const moved = updateEmergencyPlan(plan, { propertyId: 'cabin' });
  assert.deepEqual(moved.completed, {});
  assert.deepEqual(moved.checkedActions, []);
  assert.throws(() => updateEmergencyPlan(plan, { active: false }), /settings/);
  assert.throws(() => toggleEmergencyAction(plan, 'power-safety'), /active/);
  assert.ok(EMERGENCY_SCENARIOS.every(scenario => scenario.sources.length && scenario.actions.length >= 4));
});

test('calendar includes the bounded horizon and date filters without producing unbounded events', () => {
  const plan = makePlan({ horizonDays: 90 });
  const all = buildEmergencyCalendarEvents({ plan, items: [food, water], rationPeople: people, now });
  assert.equal(all.length, 540);
  assert.equal(new Set(all.map(event => event.id)).size, 540);
  assert.ok(all.every(event => event.kind === 'emergency' && event.navigate === 'emergency-mode'));
  assert.ok(all.filter(event => event.date > today).every(event => event.canComplete === false));
  const one = buildEmergencyCalendarEvents({ plan, startDate: today, endDate: today, now });
  assert.equal(one.length, 6);
  assert.deepEqual(buildEmergencyCalendarEvents({ plan, startDate: emergencyAddDays(today, 100), now }), []);
  assert.throws(() => buildEmergencyCalendarEvents({ plan, startDate: 'invalid', now }), /valid/);
});

test('local day arithmetic survives daylight-saving transitions and elapsed days do not double-consume current inventory', () => {
  assert.equal(emergencyAddDays('2026-10-31', 1), '2026-11-01');
  assert.equal(emergencyAddDays('2026-11-01', 1), '2026-11-02');
  const plan = createEmergencyPlan({}, new Date(2026, 9, 25, 23, 30));
  const summary = buildEmergencySummary({ plan, items: [food, water], rationPeople: people, now });
  assert.equal(summary.dayIndex, 4);
  assert.equal(summary.planningDaysRemaining, 11);
  assert.equal(summary.foodDays, 5);
  assert.equal(summary.foodShortfallCalories, 24000);
  const schedule = buildEmergencySchedule({ plan, items: [food, water], rationPeople: people, now });
  assert.equal(schedule.filter(event => event.type === 'meal').reduce((sum, event) => sum + event.shortfallCalories, 0), 0);
});

test('emergency water needs stay consistent across schedule, overview, inventory pages and rationing', () => {
  const plan = makePlan({ waterGalPerPerson: 2.5 });
  const items = [food, water];
  const summary = buildEmergencySummary({ plan, items, rationPeople: people, now });
  assert.equal(summary.dailyWaterGal, 5);
  assert.equal(summary.waterDays, 4);
  assert.equal(summary.waterShortfallGal, 50);
  assert.equal(buildEmergencySchedule({ plan, items, rationPeople: people, now }).find(event => event.type === 'water').householdWaterGal, 5);
  assert.equal(computeRationing(items, 2, 2000, 2.5).waterDays, 4);
  const overview = computeEssentialCoverage(items, 2, 2000, 2.5);
  assert.equal(overview.water.days, 4);
  assert.match(overview.water.detail, /2.5 gal\/person\/day/);
  const inventory = buildEssentialPlanning('water', items, 2, 2000, 2.5);
  assert.equal(inventory.bigNum, '4');
  assert.equal(inventory.rows.find(row => row.label === 'Daily consumption').value, '5 gal/day');
  assert.equal(buildEssentialPlanning('food', items, 2, 2000, 2.5).bigNum, '5');
});

test('shared water planning defaults remain backward compatible and cannot fall below one gallon', () => {
  for (const amount of [undefined, null, 0, .1, -1, NaN, Infinity, 'invalid']) {
    const result = computeRationing([water], 2, 2000, amount);
    assert.equal(result.waterGalPerPerson, 1);
    assert.equal(result.waterDays, 10);
  }
  assert.equal(computeRationing([water], 2, 2000, 10).waterGalPerPerson, 5);
  assert.equal(computeRationing([water], 2, 2000, 5).waterDays, 2);
  assert.equal(computeRationing([water], 0, 2000, 2).waterDays, null);
});
