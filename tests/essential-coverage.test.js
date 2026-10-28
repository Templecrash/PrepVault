import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEssentialCoverage } from '../src/essential-coverage.js';

const water = { category: 'water', subType: 'storedWater', quantity: 220, fields: { capacity: '55' } };
const food = { category: 'food', subType: 'cannedGoods', quantity: 120, fields: { calories: '250', servings: '2' } };
const prescription = (daysSupply, quantity = 1) => ({ category: 'medical', subType: 'prescription', quantity, fields: { daysSupply } });
const backup = (runtimeHours, quantity = 1, subType = 'generator') => ({ category: 'power', subType, quantity, fields: { runtimeHours } });

test('water and food coverage matches rationing and counts stored quantities once', () => {
  const items = [water, food, { category: 'water', subType: 'well', quantity: 10, fields: { gpm: 100 } }];
  const before = structuredClone(items);
  const result = computeEssentialCoverage(items, 4, 2000);
  assert.equal(result.water.days, 55);
  assert.equal(result.food.days, 7);
  assert.equal(result.medical.days, null);
  assert.equal(result.power.days, null);
  assert.deepEqual(items, before);
});

test('current household and calorie settings control food/water days, with empty roster unknown', () => {
  const items = [water, food];
  assert.equal(computeEssentialCoverage(items, 5, 1500).water.days, 44);
  assert.equal(computeEssentialCoverage(items, 5, 1500).food.days, 8);
  const noPeople = computeEssentialCoverage(items, 0, 2000);
  assert.equal(noPeople.water.days, null);
  assert.equal(noPeople.food.days, null);
  assert.match(noPeople.water.detail, /Mark dependants in Your People/);
  assert.equal(computeEssentialCoverage(items, 4, 0).food.days, null);
});

test('food explains incomplete nutrition while excluding zero stock and invalid values', () => {
  const result = computeEssentialCoverage([
    food,
    { ...food, fields: {} },
    { ...food, quantity: 0, fields: {} },
    { ...food, quantity: Infinity },
    { ...water, quantity: -220 },
  ], 4, 2000);
  assert.equal(result.food.days, 7);
  assert.match(result.food.detail, /1 entry needs nutrition details/);
  assert.equal(result.water.days, 0);
});

test('medical coverage uses the shortest prescription entry without multiplying quantities', () => {
  const result = computeEssentialCoverage([
    prescription(90, 5), prescription('30', 3),
    { category: 'medical', subType: 'firstAidKit', quantity: 100, fields: { daysSupply: 500 } },
  ], 4);
  assert.equal(result.medical.days, 30);
  assert.equal(result.medical.basis, 'Recorded medication supply');
  assert.equal(computeEssentialCoverage([prescription(90), prescription(30, 0)]).medical.days, 0);
  assert.equal(computeEssentialCoverage([prescription(0)]).medical.days, 0);
  assert.equal(computeEssentialCoverage([prescription(0.5)]).medical.days, 0);
});

test('medical coverage stays unknown when any stocked prescription is missing valid days', () => {
  for (const missing of [undefined, null, '', '   ', -2, Infinity, 'not known', false]) {
    assert.equal(computeEssentialCoverage([prescription(90), prescription(missing)]).medical.days, null);
  }
  assert.equal(computeEssentialCoverage([{ category: 'medical', subType: 'firstAidKit', quantity: 3 }]).medical.days, null);
});

test('power uses the longest recorded entry runtime in full days without summing or multiplying', () => {
  const result = computeEssentialCoverage([backup('72', 4), backup(48, 6, 'powerBank')]);
  assert.equal(result.power.days, 3);
  assert.equal(result.power.basis, 'Longest recorded backup');
  assert.match(result.power.detail, /72 hours/);
  assert.equal(computeEssentialCoverage([backup(23.5)]).power.days, 0);
});

test('power distinguishes missing runtime from no stock and accepts explicitly zero runtime', () => {
  for (const missing of [undefined, null, '', '   ', -2, Infinity, 'not known', false]) {
    assert.equal(computeEssentialCoverage([backup(72), backup(missing, 1, 'powerBank')]).power.days, null);
  }
  assert.equal(computeEssentialCoverage([backup(72, 0), backup(undefined, 0, 'powerBank')]).power.days, 0);
  assert.equal(computeEssentialCoverage([backup(0)]).power.days, 0);
  assert.equal(computeEssentialCoverage([backup(72), backup(undefined, 0)]).power.days, 3);
});

test('solar generation, fuel stock and wattage alone never imply a backup duration', () => {
  const items = [
    { category: 'power', subType: 'solarPanel', quantity: 20, fields: { watts: 400, runtimeHours: 1000 } },
    { category: 'fuel', subType: 'gasoline', quantity: 100, fields: { gallons: 100 } },
    { category: 'batteries', subType: 'aa', quantity: 1000 },
  ];
  assert.equal(computeEssentialCoverage(items).power.days, null);
  assert.equal(computeEssentialCoverage([...items, { category: 'power', subType: 'generator', quantity: 1, fields: { watts: 5000 } }]).power.days, null);
});
