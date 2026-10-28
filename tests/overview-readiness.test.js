import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryReadiness } from '../src/overview-readiness.js';
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
