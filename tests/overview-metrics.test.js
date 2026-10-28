import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOverviewInventory } from '../src/overview-metrics.js';

const categories = {
  water: { label: 'Water', subTypes: { stored: {}, filter: {}, well: {} } },
  food: { label: 'Food', subTypes: { rice: {}, cans: {} } },
  tools: { label: 'Tools', subTypes: { saw: {} } },
  power: { label: 'Power', subTypes: { generator: {} } },
};

test('overview counts entries instead of adding incompatible inventory quantities', () => {
  const items = [
    { category: 'water', subType: 'stored', quantity: 220 },
    { category: 'water', subType: 'stored', quantity: '55' },
    { category: 'water', subType: 'filter', quantity: 1 },
    { category: 'food', subType: 'rice', quantity: 500 },
  ];
  const before = structuredClone({ items, categories });
  const result = summarizeOverviewInventory(items, categories);
  assert.equal(result.totalEntries, 4);
  assert.equal(result.stockedEntries, 4);
  assert.equal(result.coveredCount, 2);
  assert.equal(result.emptyCount, 2);
  assert.deepEqual(result.categories[0], {
    key: 'water', label: 'Water', recordedEntries: 3, stockedEntries: 3,
    zeroEntries: 0, unknownQuantityEntries: 0, totalTypes: 3,
    stockedTypes: 2, status: 'stocked', coveragePercent: 67,
  });
  assert.deepEqual({ items, categories }, before);
});

test('duplicate or unregistered subtypes cannot inflate type coverage', () => {
  const result = summarizeOverviewInventory([
    { category: 'food', subType: 'rice', quantity: 1 },
    { category: 'food', subType: 'rice', quantity: 5 },
    { category: 'food', subType: 'cans', quantity: 0 },
    { category: 'food', subType: 'unrecognized', quantity: 10 },
  ], categories);
  const row = result.categories.find(entry => entry.key === 'food');
  assert.equal(row.stockedEntries, 3);
  assert.equal(row.stockedTypes, 1);
  assert.equal(row.coveragePercent, 50);
  assert.equal(result.coveredCount, 1);
});

test('explicit zero, unknown quantity and unrecorded categories remain distinct', () => {
  const result = summarizeOverviewInventory([
    { category: 'water', subType: 'stored', quantity: 0 },
    { category: 'water', subType: 'filter', quantity: '0' },
    { category: 'food', subType: 'rice' },
    { category: 'food', subType: 'cans', quantity: 0 },
    { category: 'power', subType: 'generator', quantity: 1 },
  ], categories);
  assert.equal(result.zeroEntries, 3);
  assert.equal(result.unknownQuantityEntries, 1);
  assert.equal(result.emptyCount, 3);
  assert.deepEqual(result.gaps.map(({ key, status }) => ({ key, status })), [
    { key: 'water', status: 'out-of-stock' },
    { key: 'food', status: 'unknown' },
    { key: 'tools', status: 'unrecorded' },
  ]);
});

test('missing, blank, negative, nonfinite and nonnumeric quantities never imply stock', () => {
  const unknown = [undefined, null, '', '  ', NaN, Infinity, -Infinity, -1, '-2', 'no', 'Infinity', false, true, [], [1], {}, 1n];
  const result = summarizeOverviewInventory(unknown.map(quantity => ({ category: 'water', subType: 'stored', quantity })), categories);
  assert.equal(result.unknownQuantityEntries, unknown.length);
  assert.equal(result.stockedEntries, 0);
  assert.equal(result.zeroEntries, 0);
  assert.equal(result.coveredCount, 0);
  assert.equal(result.categories[0].status, 'unknown');
});

test('positive finite fractions and numeric strings count as recorded stock', () => {
  const result = summarizeOverviewInventory([
    { category: 'water', subType: 'stored', quantity: 0.5 },
    { category: 'food', subType: 'rice', quantity: ' 0.25 ' },
    { category: 'tools', subType: 'saw', quantity: -0 },
  ], categories);
  assert.equal(result.stockedEntries, 2);
  assert.equal(result.coveredCount, 2);
  assert.equal(result.zeroEntries, 1);
});

test('unknown categories stay in entry totals without covering registered categories', () => {
  const result = summarizeOverviewInventory([
    { category: 'removed-category', quantity: 3 },
    { quantity: 0 },
    { category: 'toString', quantity: 'unknown' },
  ], categories);
  assert.equal(result.totalEntries, 3);
  assert.equal(result.stockedEntries, 1);
  assert.equal(result.zeroEntries, 1);
  assert.equal(result.unknownQuantityEntries, 1);
  assert.equal(result.unknownCategoryEntries, 3);
  assert.equal(result.coveredCount, 0);
  assert.equal(result.categories.reduce((sum, row) => sum + row.recordedEntries, 0), 0);
});

test('no registry and no type definitions have explicit empty/unknown coverage', () => {
  const empty = summarizeOverviewInventory();
  assert.equal(empty.categoryCount, 0);
  assert.equal(empty.coveredCount, 0);
  assert.equal(empty.emptyCount, 0);
  assert.deepEqual(empty.categories, []);
  assert.deepEqual(empty.gaps, []);
  const result = summarizeOverviewInventory([{ category: 'custom', quantity: 1 }], { custom: { label: '' } });
  assert.equal(result.categories[0].label, 'custom');
  assert.equal(result.categories[0].coveragePercent, null);
  assert.equal(result.categories[0].totalTypes, 0);
  assert.equal(result.categories[0].status, 'stocked');
});

test('property-filtered input cannot inherit stock from another property', () => {
  const items = [
    { propertyId: 'home', category: 'water', subType: 'stored', quantity: 20 },
    { propertyId: 'cabin', category: 'water', subType: 'stored', quantity: 0 },
    { propertyId: 'cabin', category: 'food', subType: 'rice', quantity: 5 },
  ];
  const home = summarizeOverviewInventory(items.filter(item => item.propertyId === 'home'), categories);
  const cabin = summarizeOverviewInventory(items.filter(item => item.propertyId === 'cabin'), categories);
  assert.equal(home.totalEntries, 1);
  assert.equal(home.categories[0].status, 'stocked');
  assert.equal(cabin.totalEntries, 2);
  assert.equal(cabin.categories[0].status, 'out-of-stock');
  assert.equal(cabin.categories[1].status, 'stocked');
  assert.equal(summarizeOverviewInventory(items, categories).coveredCount, 2);
});

test('malformed records do not crash the summary or become phantom entries', () => {
  const result = summarizeOverviewInventory([null, undefined, false, [], 'bad', { quantity: 1 }], null);
  assert.equal(result.totalEntries, 1);
  assert.equal(result.unknownCategoryEntries, 1);
  assert.equal(result.stockedEntries, 1);
  assert.equal(summarizeOverviewInventory(null, []).totalEntries, 0);
});
