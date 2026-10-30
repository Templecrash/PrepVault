import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryReadiness, buildReadinessGroups } from '../src/overview-readiness.js';
const row = (key, changes = {}) => ({ key, stockedEntries: 2, zeroEntries: 0, unknownQuantityEntries: 0, ...changes });
const coverage = days => ({ days, basis: 'Recorded supply', detail: 'Based on entered amounts.' });

test('category coverage thresholds are applied to whole days at each boundary', () => {
  for (const [category, low, good] of [['water', 3, 14], ['power', 1, 3], ['food', 7, 30]]) {
    assert.equal(categoryReadiness(row(category), coverage(low - .1)).level, 'bad');
    assert.equal(categoryReadiness(row(category), coverage(low)).level, 'ok');
    assert.equal(categoryReadiness(row(category), coverage(good - .1)).level, 'ok');
    assert.equal(categoryReadiness(row(category), coverage(good)).level, 'good');
  }
});
test('missing or non-finite coverage stays unknown rather than becoming zero days', () => {
  for (const days of [undefined, null, NaN, Infinity, '30']) {
    const actual = categoryReadiness(row('food'), coverage(days));
    assert.equal(actual.days, null); assert.equal(actual.level, 'ok'); assert.equal(actual.statusLabel, 'Add details');
  }
  const negative = categoryReadiness(row('water'), coverage(-5));
  assert.equal(negative.days, 0); assert.equal(negative.level, 'bad');
});
test('inventory-only readiness distinguishes stock, empty inventory and unknown amounts', () => {
  assert.equal(categoryReadiness(row('tools'), null).level, 'good');
  assert.equal(categoryReadiness(row('tools', { stockedEntries: 0 }), null).level, 'bad');
  assert.equal(categoryReadiness(row('tools', { stockedEntries: 0, unknownQuantityEntries: 1 }), null).level, 'unknown');
  assert.equal(categoryReadiness(row('tools', { zeroEntries: 1 }), null).level, 'ok');
});
test('reminders and missing details prevent an otherwise green coverage label', () => {
  assert.equal(categoryReadiness(row('water'), coverage(20), [{ severity: 'low' }]).level, 'ok');
  assert.equal(categoryReadiness(row('water', { unknownQuantityEntries: 1 }), coverage(20)).level, 'ok');
  assert.equal(categoryReadiness(row('food'), { ...coverage(60), detail: 'Some entries need nutrition details.' }).level, 'ok');
});
test('urgent reminders override ample coverage and mixed-case red colours', () => {
  for (const alert of [{ severity: 'critical' }, { severity: 'high' }, { ac: '#EF4444' }]) {
    const actual = categoryReadiness(row('food'), coverage(90), [alert]);
    assert.equal(actual.level, 'bad'); assert.match(actual.detail, /urgent/);
  }
});
test('partial coverage metadata and counters do not leak undefined into labels', () => {
  const unknown = categoryReadiness(row('food'), {});
  assert.equal(typeof unknown.detail, 'string'); assert.ok(unknown.detail.length > 0);
  assert.doesNotMatch(categoryReadiness(row('water'), { days: 15 }).detail, /undefined|null/);
  assert.doesNotMatch(categoryReadiness({ key: 'tools' }, null).detail, /undefined|null/);
});

test('readiness groups account for every inventory category exactly once, including future categories', () => {
  const keys = ['water', 'food', 'medical', 'firewood', 'fuel', 'shelter', 'tools', 'comms', 'defense', 'firearms', 'vehicles', 'equipment', 'farm', 'hygiene', 'power', 'batteries', 'electronics', 'bugout', 'kids', 'boat', 'fishing', 'alcohol', 'recreational', 'books', 'nbc', 'clothing', 'pets', 'lighting', 'bullion', 'livestock', 'future-category'];
  const groups = buildReadinessGroups(keys.map(key => row(key)));
  assert.deepEqual(groups.map(group => [group.key, group.total]), [['essentials', 7], ['home', 13], ['resilience', 11]]);
  const output = groups.flatMap(group => group.rows.map(value => value.key));
  assert.equal(new Set(output).size, keys.length);
  assert.deepEqual([...output].sort(), [...keys].sort());
  assert.ok(groups[1].rows.some(value => value.key === 'nbc'));
  assert.ok(groups[2].rows.some(value => value.key === 'future-category'));
  for (const group of groups) {
    assert.equal(group.goodCount, group.total);
    assert.equal(group.attentionCount, 0);
    assert.equal(Object.values(group.counts).reduce((sum, value) => sum + value, 0), group.total);
  }
});

test('group totals preserve low, review, unknown and urgent states without averaging coverage', () => {
  const categories = [row('water'), row('food'), row('medical'), row('hygiene', { stockedEntries: 0, unknownQuantityEntries: 1 }), row('clothing'), row('kids', { stockedEntries: 0 })];
  const groups = buildReadinessGroups(categories, { water: coverage(2), food: coverage(120), medical: { days: null, detail: 'Add prescription coverage.' } }, [{ category: 'food', severity: 'critical' }, { category: 'outside-scope', severity: 'critical' }]);
  const essentials = groups[0];
  assert.deepEqual(essentials.counts, { good: 1, ok: 1, bad: 3, unknown: 1 });
  assert.equal(essentials.goodCount, 1);
  assert.equal(essentials.attentionCount, 5);
  assert.deepEqual(essentials.rows.map(value => value.key), ['food', 'water', 'kids', 'hygiene', 'medical', 'clothing']);
  const food = essentials.rows.find(value => value.key === 'food');
  assert.equal(food.days, 120);
  assert.equal(food.level, 'bad');
  assert.equal(food.alertCount, 1);
  assert.equal(essentials.rows.find(value => value.key === 'water').days, 2);
  assert.equal(essentials.rows.find(value => value.key === 'medical').days, null);
  assert.equal(essentials.rows.find(value => value.key === 'hygiene').days, null);
});

test('rollups respect the supplied property scope and do not mutate its data', () => {
  const categories = [Object.freeze(row('power')), Object.freeze(row('tools', { stockedEntries: 0 }))];
  const source = Object.freeze(categories);
  const before = JSON.stringify(source);
  const result = buildReadinessGroups(source, { power: coverage(5), water: coverage(100) }, [{ category: 'water', severity: 'critical' }]);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(result.map(group => group.total), [0, 2, 0]);
  assert.deepEqual(result[1].counts, { good: 1, ok: 0, bad: 1, unknown: 0 });
  assert.deepEqual(result.flatMap(group => group.rows.map(value => value.key)), ['tools', 'power']);
  const empty = buildReadinessGroups();
  assert.equal(empty.length, 3);
  for (const group of empty) {
    assert.equal(group.total, 0);
    assert.equal(group.goodCount, 0);
    assert.equal(group.attentionCount, 0);
    assert.deepEqual(group.rows, []);
    assert.deepEqual(group.counts, { good: 0, ok: 0, bad: 0, unknown: 0 });
  }
});
