import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInventoryVisuals, essentialCoverageVisual, inventoryCondition, inventoryMatchesStatus, recordedQuantity, scopeInventoryItems, subtypeStockRows } from '../src/inventory-visuals.js';

const now = new Date(2026, 9, 29, 12).getTime();
const categories = {
  food: { label: 'Food', subTypes: { canned: { label: 'Canned food', fields: ['expiryDate', 'calories', 'servings'], unit: 'cans' }, rice: { label: 'Rice', fields: ['expiryDate', 'calories', 'servings'], unit: 'lb' } } },
  water: { label: 'Water', subTypes: { storedWater: { label: 'Stored water', fields: ['lastRefreshed'], unit: 'gal' }, filter: { label: 'Filter', fields: [] } } },
  medical: { label: 'Medical', subTypes: { prescription: { label: 'Prescriptions', fields: ['expiryDate', 'daysSupply'] } } },
  power: { label: 'Power', subTypes: { generator: { label: 'Generator', fields: ['runtimeHours'] }, batteryBackup: { label: 'Backup battery', fields: ['runtimeHours'] }, solar: { label: 'Solar', fields: ['watts'] } } },
  tools: { label: 'Tools', subTypes: { hand: { label: 'Hand tools', fields: [] }, power: { label: 'Power tools', fields: [] } } },
};
const tool = (id, quantity = 1, fields = {}) => ({ id, category: 'tools', subType: 'hand', quantity, fields });
const food = (quantity = 1, fields = {}) => ({ id: 'food', category: 'food', subType: 'canned', quantity, fields: { expiryDate: '2028-01-01', calories: 2000, servings: 1, ...fields } });
const water = (quantity = 1, fields = {}) => ({ id: 'water', category: 'water', subType: 'storedWater', quantity, fields: { lastRefreshed: '2026-10-01', ...fields } });
const visuals = items => buildInventoryVisuals({ items, categories, now });

test('recorded quantities distinguish zero, missing and invalid values', () => {
  assert.equal(recordedQuantity(0), 0);
  assert.equal(recordedQuantity('2.5'), 2.5);
  for (const value of [null, undefined, '', ' ', true, false, [], {}, -1, Infinity, 'lots']) assert.equal(recordedQuantity(value), null);
});

test('property scope includes legacy first-property records without leaking another property', () => {
  const items = [tool('legacy'), { ...tool('one'), propertyId: 'prop1' }, { ...tool('two'), propertyId: 'prop2' }];
  assert.deepEqual(scopeInventoryItems(items, 'prop1').map(item => item.id), ['legacy', 'one']);
  assert.deepEqual(scopeInventoryItems(items, 'prop2').map(item => item.id), ['two']);
  assert.equal(buildInventoryVisuals({ items, categories, propertyId: 'prop2', now }).total, 1);
  assert.equal(scopeInventoryItems(items, 'all').length, 3);
});

test('ring segments and filters partition the exact same records once', () => {
  const items = [tool('ready', 50), tool('empty', 0), tool('unknown', null), tool('expired', 2, { expiryDate: '2026-10-01' }), { ...tool('other'), subType: 'unrecognised' }];
  const before = structuredClone(items);
  const result = visuals(items);
  assert.deepEqual(result.counts, { ready: 1, attention: 1, empty: 1, unknown: 2 });
  for (const segment of result.segments) assert.equal(result.inventory.filter(item => inventoryMatchesStatus(item, segment.id)).length, segment.value);
  assert.equal(result.segments.reduce((sum, segment) => sum + segment.value, 0), items.length);
  assert.deepEqual(items, before);
});

test('missing expected dates, nutrition, runtime and invalid dates remain unconfirmed', () => {
  const missing = [food(1, { expiryDate: '' }), food(1, { expiryDate: '2026-02-31' }), food(1, { calories: null }), food(1, { servings: false }), water(10, { lastRefreshed: '2026-10-30' }), water(10, { lastRefreshed: '' }), { category: 'power', subType: 'generator', quantity: 1, fields: {} }, { category: 'medical', subType: 'prescription', quantity: 1, fields: { expiryDate: '2028-01-01' } }];
  for (const item of missing) assert.equal(inventoryCondition(item, categories, [], now).state, 'unknown');
  assert.equal(inventoryCondition(tool('valid'), categories, [], now).state, 'ready');
});

test('actual due checks take precedence over other missing details and expose exact due filters', () => {
  const cases = [
    [food(1, { expiryDate: '2026-10-28', calories: '' }), 'expired'],
    [food(1, { expiryDate: '2026-10-29' }), 'soon'],
    [food(1, { expiryDate: '2027-01-27' }), 'soon'],
    [food(1, { expiryDate: '2027-01-28' }), 'ready'],
    [water(10, { lastRefreshed: '2026-06-01' }), 'rotation'],
  ];
  for (const [item, expected] of cases) assert.equal(inventoryCondition(item, categories, [], now).id, expected);
  assert.equal(inventoryCondition(tool('service'), categories, [{ id: 'service', al: 'Inspect tool' }], now).id, 'maintenance');
  assert.equal(inventoryCondition(tool('empty', 0), categories, [{ id: 'empty' }], now).state, 'empty');
});

test('category and type bars count stocked types and entries, never mixed units', () => {
  const items = [food(999), { ...food(4), id: 'rice', subType: 'rice' }, { ...food(0), id: 'empty' }, { ...food(null), id: 'unknown' }];
  const result = visuals(items);
  assert.equal(result.categoryRows.find(row => row.id === 'food').value, 2);
  const rows = subtypeStockRows(result.inventory, categories.food);
  assert.equal(rows.find(row => row.id === 'canned').value, 1);
  assert.equal(rows.find(row => row.id === 'canned').max, 3);
  assert.equal(rows.find(row => row.id === 'canned').tone, 'warning');
  assert.equal(subtypeStockRows([], categories.tools)[0].tone, 'unknown');
});

test('food and water days use selected dependants and current ration targets', () => {
  const items = [food(120), water(56, { capacity: 55 })];
  const records = visuals(items).inventory;
  assert.equal(essentialCoverageVisual('food', items, 4, 2000, 1, records).value, 30);
  assert.equal(essentialCoverageVisual('food', items, 4, 1000, 1, records).value, 60);
  assert.equal(essentialCoverageVisual('water', items, 4, 2000, 1, records).value, 14);
  assert.equal(essentialCoverageVisual('water', items, 4, 2000, 2, records).value, 7);
  for (const category of ['food', 'water']) {
    const coverage = essentialCoverageVisual(category, items, 0, 2000, 1, records);
    assert.equal(coverage.value, null);
    assert.equal(coverage.tone, 'unknown');
  }
});

test('reference tones describe days with visible thresholds rather than invented readiness percentages', () => {
  for (const [days, tone] of [[0, 'danger'], [2, 'danger'], [3, 'warning'], [13, 'warning'], [14, 'good']]) {
    const items = [water(days)];
    const coverage = essentialCoverageVisual('water', items, 1, 2000, 1, visuals(items).inventory);
    assert.equal(coverage.value, days);
    assert.equal(coverage.tone, tone);
    assert.equal(coverage.max, 14);
    assert.match(coverage.targetLabel, /planning reference/);
    assert.match(coverage.note, /Low below 3 days/);
  }
});

test('unknown quantities block a duration estimate and incomplete or due entries prevent green', () => {
  let items = [food(100), { ...food(null), id: 'unknown' }];
  assert.equal(essentialCoverageVisual('food', items, 1, 2000, 1, visuals(items).inventory).value, null);
  for (const entry of [food(1, { calories: null }), food(1, { calories: true }), food(1, { expiryDate: '2026-10-01' })]) {
    items = [food(100), { ...entry, id: 'check' }];
    const result = essentialCoverageVisual('food', items, 1, 2000, 1, visuals(items).inventory);
    assert.equal(result.tone, 'warning');
    assert.match(result.note, /need review/);
    if (typeof entry.fields.calories !== 'number') assert.equal(result.value, 100);
  }
});

test('medical uses shortest prescription and power uses longest backup without quantity multiplication', () => {
  const items = [
    { category: 'medical', subType: 'prescription', quantity: 5, fields: { daysSupply: 30, expiryDate: '2028-01-01' } },
    { category: 'medical', subType: 'prescription', quantity: 7, fields: { daysSupply: 15, expiryDate: '2028-01-01' } },
    { category: 'power', subType: 'generator', quantity: 5, fields: { runtimeHours: 72 } },
    { category: 'power', subType: 'batteryBackup', quantity: 10, fields: { runtimeHours: 48 } },
    { category: 'power', subType: 'solar', quantity: 50, fields: { watts: 500 } },
  ];
  const records = visuals(items).inventory;
  assert.equal(essentialCoverageVisual('medical', items, 0, 2000, 1, records).value, 15);
  assert.equal(essentialCoverageVisual('power', items, 0, 2000, 1, records).value, 3);
  assert.equal(essentialCoverageVisual('power', [items[4]], 0).value, null);
});
