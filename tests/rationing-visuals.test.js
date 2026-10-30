import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRationingVisuals } from '../src/rationing-visuals.js';

const now = new Date('2026-10-29T12:00:00').getTime();
const categories = {
  food: { subTypes: { cannedGoods: { fields: ['calories', 'servings', 'expiryDate'] } } },
  water: { subTypes: { storedWater: { fields: ['lastRefreshed'] } } },
};
const food = { id: 'food', category: 'food', subType: 'cannedGoods', quantity: 30, fields: { calories: 2000, servings: 1, expiryDate: '2027-12-31' } };
const water = { id: 'water', category: 'water', subType: 'storedWater', quantity: 50, fields: { lastRefreshed: '2026-10-20', capacity: 50 } };
const summary = (items, options = {}) => buildRationingVisuals({ items, categories, now, peopleCount: 1, planningDays: 14, ...options });

test('rationing visuals compare recorded amounts with the chosen window and daily targets', () => {
  const input = [food, water];
  const before = structuredClone(input);
  const current = summary(input);
  assert.equal(current.food.value, 30);
  assert.equal(current.food.max, 14);
  assert.equal(current.food.tone, 'good');
  assert.equal(current.water.value, 50);
  assert.equal(current.water.tone, 'good');
  const larger = summary(input, { planningDays: 90, waterGalPerPerson: 2, dailyCalTarget: 3000 });
  assert.equal(larger.food.value, 20);
  assert.equal(larger.water.value, 25);
  assert.equal(larger.food.tone, 'danger');
  assert.equal(larger.water.max, 90);
  assert.deepEqual(input, before);
});

test('unknown quantities do not become empty stock or a green complete estimate', () => {
  for (const quantity of [undefined, null, ' ', 'unknown', [], true, -1, Infinity]) {
    const result = summary([food, water, { ...food, id: 'unknown-food', quantity }, { ...water, id: 'unknown-water', quantity }]);
    assert.equal(result.food.value, null);
    assert.equal(result.water.value, null);
    assert.equal(result.food.tone, 'unknown');
    assert.equal(result.water.tone, 'unknown');
    assert.match(result.food.note, /60,000 calories counted/);
    assert.equal(result.foodDetails.segments.find(row => row.id === 'quantity').value, 1);
  }
  assert.equal(summary([{ ...food, quantity: 0 }, { ...water, quantity: 0 }]).food.value, 0);
  assert.equal(summary([]).food.tone, 'danger');
});

test('missing nutrition is unknown without a counted food baseline and partial with one', () => {
  const incomplete = { ...food, id: 'incomplete', fields: { expiryDate: '2027-12-31' } };
  const unknown = summary([incomplete]);
  assert.equal(unknown.food.value, null);
  assert.equal(unknown.food.tone, 'unknown');
  const partial = summary([food, incomplete]);
  assert.equal(partial.food.value, 30);
  assert.equal(partial.food.tone, 'warning');
  assert.equal(partial.food.valueLabel, '≥ 30 days');
  assert.match(partial.food.note, /lower-bound estimate/);
  assert.equal(partial.foodDetails.segments.some(row => row.tone === 'good'), false);
  assert.equal(summary([{ ...food, fields: { calories: true, servings: 1 } }]).food.value, null);
});

test('missing, invalid and due expiry or rotation checks prevent green coverage', () => {
  for (const expiryDate of [undefined, '2026-01-01', '2026-02-30', '2026-11-01']) {
    const result = summary([{ ...food, fields: { ...food.fields, expiryDate } }]);
    assert.equal(result.food.value, 30);
    assert.equal(result.food.tone, 'warning');
    assert.match(result.food.note, /stock entry needs an expiry, rotation or detail check/);
  }
  for (const lastRefreshed of [undefined, '2026-01-01', 'bad', '2027-01-01']) {
    assert.equal(summary([{ ...water, fields: { lastRefreshed } }]).water.tone, 'warning');
  }
});

test('missing dependants or calorie target cannot imply a shortfall or completed plan', () => {
  const nobody = summary([food, water], { peopleCount: 0 });
  assert.equal(nobody.food.value, null);
  assert.equal(nobody.water.value, null);
  assert.equal(nobody.food.tone, 'unknown');
  assert.match(nobody.food.note, /Select dependants/);
  const noTarget = summary([food, water], { dailyCalTarget: 0 });
  assert.equal(noTarget.food.value, null);
  assert.match(noTarget.food.note, /calorie target/);
  assert.equal(noTarget.water.value, 50);
});
