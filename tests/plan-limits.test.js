import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryUpgradeNotices } from '../src/plan-limits.js';
const rows = (length, category = 'food') => Array.from({ length }, (_, id) => ({ id, category, quantity: 50, propertyId: id % 2 ? 'home' : 'cabin' }));
test('20 inventory entries are free regardless of quantity or property', () => {
  assert.deepEqual(categoryUpgradeNotices(rows(19), rows(20)), []);
  assert.deepEqual(categoryUpgradeNotices(rows(20), rows(21)), [{ category: 'food', count: 21 }]);
});
test('edits and removals above 20 do not repeat the notice', () => {
  assert.deepEqual(categoryUpgradeNotices(rows(21), rows(21).map(i => ({...i, quantity: 200}))), []);
  assert.deepEqual(categoryUpgradeNotices(rows(23), rows(22)), []);
});
test('bulk imports and moving categories notify all categories that grew over the threshold', () => {
  assert.deepEqual(categoryUpgradeNotices(rows(20), [...rows(22), ...rows(25, 'water')]), [{category:'food',count:22},{category:'water',count:25}]);
  assert.deepEqual(categoryUpgradeNotices([...rows(21), ...rows(20, 'water')], [...rows(20), ...rows(21, 'water')]), [{category:'water',count:21}]);
});
