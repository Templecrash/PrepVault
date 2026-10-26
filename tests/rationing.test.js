import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRationing } from '../src/rationing.js';

const canned = { id: 'food', category: 'food', subType: 'cannedGoods', quantity: 120, fields: { calories: '250', servings: '2' } };
const water = { id: 'water', category: 'water', subType: 'storedWater', quantity: 220, fields: { capacity: '55' } };

test('uses recorded gallons once, without multiplying container capacity', () => {
  const result = computeRationing([canned, water], 4, 2000);
  assert.equal(result.totalWaterGal, 220);
  assert.equal(result.waterDays, 55);
  assert.equal(result.totalCalories, 60000);
  assert.equal(result.foodDays, 7);
});

test('zero quantities and invalid numbers cannot inflate recorded stock', () => {
  const result = computeRationing([
    { ...canned, quantity: 0 }, { ...canned, quantity: -5 }, { ...canned, quantity: 'Infinity' },
    { ...water, quantity: -100 }, { ...water, quantity: 'not recorded' },
  ], 4, 2000);
  assert.equal(result.totalCalories, 0);
  assert.equal(result.totalWaterGal, 0);
  assert.equal(result.foodDays, 0);
  assert.equal(result.waterDays, 0);
  assert.deepEqual(result.mealSuggestions, []);
});

test('records missing calorie or serving data without counting exhausted entries', () => {
  const result = computeRationing([
    { ...canned, id: 'no-calories', fields: {} },
    { ...canned, id: 'zero-servings', fields: { calories: 250, servings: 0 } },
    { ...canned, id: 'exhausted', quantity: 0, fields: {} },
    { ...canned, id: 'missing-serving', quantity: 2, fields: { calories: 100 } },
    { ...canned, id: 'recorded-serving', quantity: 2, fields: { calories: 100, servings: 1 } },
  ], 1, 2000);
  assert.equal(result.omittedFoodCount, 3);
  assert.equal(result.totalCalories, 200);
  assert.equal(result.foodItems.at(-1).servings, 1);
});

test('no people gives no duration or meal estimate, while totals remain visible', () => {
  const result = computeRationing([canned, water], 0, 2000);
  assert.equal(result.foodDays, null);
  assert.equal(result.waterDays, null);
  assert.equal(result.totalCalories, 60000);
  assert.deepEqual(result.mealSuggestions, []);
});

test('changing people and target produces shared, consistent durations', () => {
  assert.equal(computeRationing([canned, water], 4, 1500).foodDays, 10);
  assert.equal(computeRationing([canned, water], 5, 1500).foodDays, 8);
  assert.equal(computeRationing([canned, water], 5, 1500).waterDays, 44);
  assert.equal(computeRationing([canned], 4, 0).foodDays, null);
});

test('portion calculations use servings per unit, show shortages, and do not mutate inventory', () => {
  const source = [{ ...canned, quantity: 1, fields: { calories: 280, servings: 2.5 } }, water];
  const before = structuredClone(source);
  const result = computeRationing(source, 4, 2000);
  assert.equal(result.mealSuggestions[0].unitsNeeded, 2);
  assert.equal(result.mealSuggestions[0].shortOnStock, true);
  assert.deepEqual(source, before);
});

test('sample inventory yields 24 food days and 55 stored-water days for four people', () => {
  const result = computeRationing([
    canned,
    { ...canned, id: 'freeze-dried', subType: 'freezeDried', quantity: 96, fields: { calories: '280', servings: '2.5' } },
    { ...canned, id: 'beans', subType: 'dryGoods', quantity: 40, fields: { calories: '1650', servings: '1' } },
    water,
  ], 4, 2000);
  assert.equal(result.totalCalories, 193200);
  assert.equal(result.totalWaterGal, 220);
  assert.equal(result.foodDays, 24);
  assert.equal(result.waterDays, 55);
  assert.equal(result.omittedFoodCount, 0);
});
