import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInventoryRecommendations } from '../src/inventory-recommendations.js';
import { computeRationing } from '../src/rationing.js';
import { buildEssentialPlanning } from '../src/essential-planning.js';

const categories = {
  food: { label: 'Food', subTypes: { cannedGoods: { label: 'Canned goods' }, dryGoods: { label: 'Dry goods' }, preserves: { label: 'Preserves' } } },
  water: { label: 'Water', subTypes: { storedWater: { label: 'Stored water' }, purificationDevice: { label: 'Water filters' }, well: { label: 'Well' } } },
  tools: { label: 'Tools', subTypes: { handTool: { label: 'Hand tools' }, powerTool: { label: 'Power tools' } } },
};
const now = new Date(2026, 9, 28, 12).getTime();
const food = { id: 'food', category: 'food', subType: 'cannedGoods', name: 'Soup', quantity: 120, location: 'Pantry', fields: { calories: 250, servings: 2 } };
const water = { id: 'water', category: 'water', subType: 'storedWater', name: 'Drinking water', quantity: 220, location: 'Garage', fields: { capacity: 55 } };
const tool = { id: 'tool', category: 'tools', subType: 'handTool', name: 'Hammer', quantity: 1, location: 'Workshop', fields: {} };
const build = (items, rest = {}) => buildInventoryRecommendations({ items, categories, now, peopleCount: 4, dailyCalTarget: 2000, ...rest });
const suggestion = (result, id) => result.suggestions.find(entry => entry.id === id);
const coverage = (result, category) => result.coverage.find(entry => entry.category === category);

// The helper is catalogue-driven for every current category, including those
// without a bespoke planning calculator or any records yet.
test('all 30 inventory categories offer useful starting suggestions without requiring every subtype', () => {
  const keys = ['water','food','medical','firewood','fuel','shelter','tools','comms','defense','firearms','vehicles','equipment','farm','hygiene','power','batteries','electronics','bugout','kids','boat','fishing','alcohol','recreational','books','nbc','clothing','pets','lighting','bullion','livestock'];
  const catalogue = Object.fromEntries(keys.map(key => [key, { label: key, subTypes: { one: { label: 'Recorded type' }, two: { label: 'Optional type' } } }]));
  assert.equal(Object.keys(catalogue).length, 30);
  for (const key of keys) {
    const empty = build([], { categories: catalogue, categoryKey: key });
    assert.equal(suggestion(empty, 'start').action.categoryKey, key);
    const filled = build([{ ...tool, category: key, subType: 'one', fields: food.fields }], { categories: catalogue, categoryKey: key });
    assert.equal(filled.recordedTypes.length, 1);
    assert.equal(filled.stockedTypes.length, 1);
    assert.equal(filled.unrecordedTypes.length, 1);
    assert.match(suggestion(filled, 'unrecorded-types').detail, /does not mean you need all/);
    assert.ok(filled.suggestions.length <= 3);
  }
});

test('property and catalogue scope exclude other locations, food, and unknown categories from Supplies', () => {
  const elsewhere = { ...tool, id: 'other', name: 'Private cabin item', propertyId: 'cabin', quantity: -8 };
  const result = build([tool, elsewhere, food, { ...tool, id: 'bad', category: 'unknown' }], { categories: { tools: categories.tools }, propertyId: 'prop1', alerts: [{ id: 'other', category: 'tools' }] });
  assert.equal(result.recordedCount, 1);
  assert.equal(result.stockedCount, 1);
  assert.equal(result.coverage.length, 0);
  assert.equal(suggestion(result, 'quantities'), undefined);
  assert.equal(suggestion(result, 'reminders'), undefined);
  assert.equal(JSON.stringify(result).includes('Private cabin item'), false);
  assert.equal(build([tool, elsewhere], { propertyId: 'all' }).recordedCount, 2);
});

test('category selection filters recommendations as well as subtype and coverage counts', () => {
  const result = build([food, water, { ...tool, quantity: -1 }], { categoryKey: 'water' });
  assert.equal(result.recordedCount, 1);
  assert.deepEqual(result.coverage.map(entry => entry.category), ['water']);
  assert.equal(suggestion(result, 'quantities'), undefined);
  assert.ok(result.recordedTypes.every(entry => entry.category === 'water'));
  assert.equal(suggestion(result, 'unrecorded-types').action.categoryKey, 'water');
});

test('food and stored water use the same dependant count, calorie target and days as Rationing', () => {
  for (const [peopleCount, dailyCalTarget] of [[4, 2000], [5, 1500], [1, 3000]]) {
    const result = build([food, water], { peopleCount, dailyCalTarget });
    const ration = computeRationing([food, water], peopleCount, dailyCalTarget);
    assert.equal(coverage(result, 'food').days, ration.foodDays);
    assert.equal(coverage(result, 'water').days, ration.waterDays);
    assert.match(coverage(result, 'food').note, new RegExp(`${peopleCount} dependant`));
  }
});

test('water equipment and container capacity never create invented stored-water days', () => {
  const equipment = [{ ...water, id: 'filter', subType: 'purificationDevice', quantity: 500 }, { ...water, id: 'well', subType: 'well', quantity: 10 }];
  assert.equal(coverage(build(equipment), 'water').days, 0);
  assert.equal(coverage(build([water, ...equipment]), 'water').days, 55);
  assert.match(coverage(build(equipment), 'water').note, /treatment add no stored days/);
});

test('water recommendations match the active two-gallon plan without changing other recommendations', () => {
  const items = [food, water, tool];
  const original = build(items, { peopleCount: 2 });
  const result = build(items, { peopleCount: 2, waterGalPerPerson: 2 });
  const waterPlan = buildEssentialPlanning('water', items, 2, 2000, 2);
  assert.equal(coverage(original, 'water').days, 110);
  assert.equal(coverage(result, 'water').days, 55);
  assert.equal(String(coverage(result, 'water').days), waterPlan.bigNum);
  assert.match(coverage(result, 'water').note, /2 dependants · 2 gal\/person\/day/);
  assert.deepEqual(coverage(result, 'food'), coverage(original, 'food'));
  assert.deepEqual(result.suggestions, original.suggestions);
  assert.deepEqual(result.recordedTypes, original.recordedTypes);
  const waterOnly = build(items, { categoryKey: 'water', peopleCount: 2, waterGalPerPerson: 2 });
  assert.equal(coverage(waterOnly, 'water').days, 55);
  assert.match(coverage(waterOnly, 'water').note, /2 gal\/person\/day/);
  assert.equal(coverage(build(items, { peopleCount: 0, waterGalPerPerson: 2 }), 'water').days, null);
  assert.match(coverage(build(items, { waterGalPerPerson: .1 }), 'water').note, /1 gal\/person\/day/);
});

test('unknown dependant count and calorie target stay unknown with useful navigation actions', () => {
  const result = build([food, water], { peopleCount: 0 });
  assert.equal(coverage(result, 'food').days, null);
  assert.equal(coverage(result, 'water').days, null);
  assert.equal(suggestion(result, 'dependants').action.kind, 'people');
  const noTarget = build([food, water], { dailyCalTarget: 0 });
  assert.equal(coverage(noTarget, 'food').days, null);
  assert.equal(coverage(noTarget, 'water').days, 55);
  assert.equal(suggestion(noTarget, 'calorie-target').action.kind, 'rationing');
});

test('missing nutrition is distinguished from actual zero stock and points at the original entry', () => {
  const missing = { ...food, id: 'missing', fields: {} };
  const result = build([food, missing, { ...missing, id: 'exhausted', quantity: 0 }], { categoryKey: 'food' });
  assert.match(suggestion(result, 'nutrition').detail, /1 stocked entry is not counted/);
  assert.equal(suggestion(result, 'nutrition').action.item, missing);
  assert.equal(coverage(result, 'food').days, 7);
  assert.match(coverage(result, 'food').note, /incomplete nutrition data/);
});

test('invalid quantities, including coercible booleans and blanks, do not create stock or coverage', () => {
  for (const quantity of [null, undefined, '', ' ', true, false, [], {}, NaN, Infinity, -1, 'unknown']) {
    const result = build([{ ...food, quantity }], { categoryKey: 'food' });
    assert.equal(result.stockedCount, 0, String(quantity));
    assert.equal(coverage(result, 'food').days, 0, String(quantity));
    assert.equal(result.suggestions[0].id, 'quantities');
  }
  assert.equal(build([{ ...food, quantity: '1.5' }]).stockedCount, 1);
  const zero = build([{ ...food, quantity: '0' }]);
  assert.equal(zero.stockedCount, 0);
  assert.ok(suggestion(zero, 'zero-stock'));
  assert.equal(suggestion(zero, 'quantities'), undefined);
});

test('expiry includes today and 90 days, excludes later and zero-stock entries, and selects the oldest first', () => {
  const date = days => { const value = new Date(2026, 9, 28 + days, 12); return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`; };
  const items = [-2, 0, 90, 91].map((days, index) => ({ ...tool, id: `dated-${index}`, fields: { expiryDate: date(days) } }));
  const oldest = items[0];
  const result = build([...items, { ...tool, id: 'empty', quantity: 0, fields: { expiryDate: date(-10) } }], { categoryKey: 'tools' });
  assert.match(suggestion(result, 'expiry').detail, /1 past the recorded expiry date; 2 due today or within 90 days/);
  assert.equal(suggestion(result, 'expiry').action.item, oldest);
});

test('invalid calendar dates and future refresh dates do not quietly become valid reminders', () => {
  for (const fields of [{ expiryDate: '2026-02-30' }, { expiryDate: 'not a date' }, { lastRefreshed: '2026-10-29' }]) {
    const result = build([{ ...tool, fields }], { categoryKey: 'tools' });
    assert.ok(suggestion(result, 'dates'));
    assert.equal(suggestion(result, 'expiry'), undefined);
    assert.equal(suggestion(result, 'refresh'), undefined);
  }
});

test('refresh and external maintenance reminders reference only stocked entries in this view', () => {
  const refreshed = { ...tool, fields: { lastRefreshed: '2026-05-01' } };
  assert.equal(suggestion(build([refreshed], { categoryKey: 'tools' }), 'refresh').action.item, refreshed);
  const result = build([tool], { categoryKey: 'tools', alerts: [{ id: tool.id, category: 'tools', al: 'Service due' }, { id: 'other', category: 'tools' }] });
  assert.match(suggestion(result, 'reminders').detail, /1 reminder is/);
  assert.equal(suggestion(result, 'reminders').action.item, tool);
  assert.equal(suggestion(build([{ ...tool, quantity: 0 }], { alerts: [{ id: tool.id }] }), 'reminders'), undefined);
});

test('urgent data and expiry reviews outrank optional catalogue exploration and are capped at three', () => {
  const result = build([{ ...food, fields: { expiryDate: '2020-01-01' }, location: '' }, { ...tool, quantity: -1 }], { peopleCount: 0 });
  assert.deepEqual(result.suggestions.map(entry => entry.id), ['quantities', 'expiry', 'dependants']);
});

test('recorded and stocked subtype counts are distinct and duplicate entries never inflate them', () => {
  const result = build([tool, { ...tool, id: 'second' }, { ...tool, id: 'zero', subType: 'powerTool', quantity: 0 }], { categoryKey: 'tools' });
  assert.equal(result.recordedCount, 3);
  assert.equal(result.stockedCount, 2);
  assert.equal(result.recordedTypes.length, 2);
  assert.equal(result.stockedTypes.length, 1);
  assert.equal(result.unrecordedTypes.length, 0);
});

test('suggestions update after records change without mutating inputs or claiming full readiness', () => {
  const items = [{ ...tool, location: '' }];
  const before = structuredClone(items);
  assert.ok(suggestion(build(items, { categoryKey: 'tools' }), 'locations'));
  assert.deepEqual(items, before);
  const result = build([{ ...items[0], location: 'Garage' }], { categoryKey: 'tools' });
  assert.equal(suggestion(result, 'locations'), undefined);
  assert.equal(/fully prepared|all needs covered|ready for anything/i.test(JSON.stringify(result)), false);
});
