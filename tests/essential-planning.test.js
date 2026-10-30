import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEssentialPlanning } from '../src/essential-planning.js';
import { computeRationing } from '../src/rationing.js';

const food = { id: 'food', category: 'food', subType: 'cannedGoods', quantity: 120, fields: { calories: '250', servings: '2' } };
const water = { id: 'water', category: 'water', subType: 'storedWater', quantity: 220, fields: { capacity: '55' } };
const row = (plan, label) => plan.rows.find(entry => entry.label === label);

test('dedicated pages use the shared rationing stock, settings and full-day coverage', () => {
  const items = [food, water];
  const original = structuredClone(items);
  for (const [people, calories] of [[4, 2000], [4, 1500], [5, 1500]]) {
    const ration = computeRationing(items, people, calories);
    const foodPlan = buildEssentialPlanning('food', items, people, calories);
    const waterPlan = buildEssentialPlanning('water', items, people, calories);
    assert.equal(foodPlan.bigNum, String(ration.foodDays));
    assert.equal(waterPlan.bigNum, String(ration.waterDays));
    assert.equal(foodPlan.bigUnit, 'full days');
    assert.match(foodPlan.summary, new RegExp(`${people} people`));
    assert.equal(row(foodPlan, 'Daily consumption').value, `${(people * calories).toLocaleString()} cal/day`);
    assert.equal(row(waterPlan, 'Stored water').value, '220 gal');
  }
  assert.deepEqual(items, original);
});

test('empty stock cannot contribute food calories or stored-water days', () => {
  const items = [{ ...food, quantity: 0 }, { ...food, quantity: -1 }, { ...food, quantity: Infinity }, { ...water, quantity: 0 }];
  const foodPlan = buildEssentialPlanning('food', items, 4, 2000);
  assert.equal(foodPlan.bigNum, '0');
  assert.equal(row(foodPlan, 'Recorded calories').value, '0 cal');
  assert.equal(buildEssentialPlanning('water', items, 4, 2000).bigNum, '0');
});

test('missing nutrition is visible but excluded, without counting exhausted incomplete entries', () => {
  const items = [food, { ...food, id: 'missing', fields: {} }, { ...food, id: 'empty', quantity: 0, fields: {} }];
  const plan = buildEssentialPlanning('food', items, 4, 2000);
  assert.equal(plan.bigNum, '7');
  assert.equal(row(plan, 'Recorded calories').value, '60,000 cal');
  assert.equal(row(plan, 'Nutrition details').value, '1 entry not counted');
  assert.match(plan.summary, /1 entry needs nutrition details/);
});

test('filters and water sources add no reserve days or gallons', () => {
  const equipment = [
    { category: 'water', subType: 'purificationDevice', quantity: 5 },
    { category: 'water', subType: 'purificationTablets', quantity: 1000, fields: { gallonsPerTab: 50 } },
    { category: 'water', subType: 'well', quantity: 1, fields: { gpm: 50 } },
  ];
  assert.equal(buildEssentialPlanning('water', equipment, 4).bigNum, '0');
  const stocked = buildEssentialPlanning('water', [water, ...equipment], 4);
  assert.equal(stocked.bigNum, '55');
  assert.equal(row(stocked, 'Stored water').value, '220 gal');
  assert.match(row(stocked, 'Sources & treatment').note, /do not add stored gallons or bonus days/);
});

test('empty or invalid roster keeps stock totals visible and coverage unknown', () => {
  for (const people of [0, '', -1, NaN, Infinity]) {
    const foodPlan = buildEssentialPlanning('food', [food, water], people, 2000);
    const waterPlan = buildEssentialPlanning('water', [food, water], people, 2000);
    assert.equal(foodPlan.bigNum, '—');
    assert.equal(waterPlan.bigNum, '—');
    assert.equal(row(foodPlan, 'Recorded calories').value, '60,000 cal');
    assert.equal(row(waterPlan, 'Stored water').value, '220 gal');
    assert.match(foodPlan.summary, /Mark dependants in Your People/);
    assert.match(waterPlan.summary, /Mark dependants in Your People/);
    assert.equal(row(waterPlan, 'Daily consumption').value, 'Not available');
  }
});

test('missing calorie target affects food coverage only', () => {
  const plan = buildEssentialPlanning('food', [food, water], 4, 0);
  assert.equal(plan.bigNum, '—');
  assert.match(plan.summary, /Set a calorie target/);
  assert.equal(row(plan, 'Daily consumption').value, 'Not available');
  assert.equal(buildEssentialPlanning('water', [food, water], 4, 0).bigNum, '55');
  assert.equal(buildEssentialPlanning('fuel', [food, water], 4, 2000), null);
});
