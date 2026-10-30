import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFoodWaterRoster } from '../src/food-water-household.js';
import { validateSnapshot } from '../src/storage.js';
import { computeRationing } from '../src/rationing.js';
import { computeEssentialCoverage } from '../src/essential-coverage.js';
import { buildEssentialPlanning } from '../src/essential-planning.js';

const supplies = [
  { id: 'water', name: 'Stored water', category: 'water', subType: 'storedWater', quantity: 120, fields: {} },
  { id: 'food', name: 'Food supply', category: 'food', subType: 'cannedGoods', quantity: 120, fields: { calories: 300, servings: 2 } },
];

test('food and water includes only explicitly selected dependants, without inferring family or self', () => {
  const contacts = [
    { id: 'owner', name: 'You', role: 'Owner' },
    { id: 'child', name: 'Child', age: 4, group: 'Family' },
    { id: 'yes', name: 'Selected', isDependant: true },
    { id: 'no', name: 'Not selected', isDependant: false },
    ...['true', 'false', 1, 0, null, {}, []].map((isDependant, index) => ({ id: `legacy-${index}`, name: 'Legacy value', isDependant })),
  ];
  assert.deepEqual(buildFoodWaterRoster(contacts), [{ id: 'yes', name: 'Selected', isDependant: true }]);
});

test('roster projection preserves identity but excludes contact and care details', () => {
  const contacts = [{ id: 'p1', name: 'Morgan', isDependant: true, phone: 'private phone', address: 'private address', medical: 'private care note', custom: { retained: true } }];
  const original = structuredClone(contacts);
  const roster = buildFoodWaterRoster(contacts);
  assert.deepEqual(roster, [{ id: 'p1', name: 'Morgan', isDependant: true }]);
  assert.deepEqual(contacts, original);
  assert.notEqual(roster[0], contacts[0], 'the derived projection does not expose the mutable directory record');
});

test('separate people with the same name both count and keep their IDs', () => {
  assert.deepEqual(buildFoodWaterRoster([
    { id: 'p1', name: 'Alex', isDependant: true },
    { id: 'p2', name: 'Alex', isDependant: true },
    { id: 'p3', name: 'Alex', isDependant: false },
  ]), [
    { id: 'p1', name: 'Alex', isDependant: true },
    { id: 'p2', name: 'Alex', isDependant: true },
  ]);
});

test('empty and unavailable directories have no implicit people', () => {
  for (const contacts of [undefined, null, false, {}, '', [], [null, undefined]]) {
    assert.deepEqual(buildFoodWaterRoster(contacts), []);
  }
});

test('selecting, adding, removing and undoing a person immediately changes the derived count', () => {
  const first = { id: 'p1', name: 'Morgan', isDependant: true };
  const second = { id: 'p2', name: 'Alex', isDependant: false };
  const third = { id: 'p3', name: 'Sam', isDependant: true };
  const initial = [first, second];
  const selected = initial.map(person => person.id === 'p2' ? { ...person, isDependant: true } : person);
  const added = [...selected, third];
  const removed = added.filter(person => person.id !== 'p1');
  const undone = [first, ...removed];
  const deselected = undone.map(person => ({ ...person, isDependant: false }));
  assert.deepEqual([initial, selected, added, removed, undone, deselected].map(contacts => buildFoodWaterRoster(contacts).length), [1, 2, 3, 2, 3, 0]);
  assert.equal(buildFoodWaterRoster(initial)[0].id, 'p1', 'later edits do not mutate the earlier directory');
});

test('dependant selections survive complete backup roundtrips and older unmarked contacts stay unselected', () => {
  const snapshot = {
    items: supplies, people: 7,
    contacts: [
      { id: 'p1', name: 'Morgan', isDependant: true, custom: 'keep' },
      { id: 'p2', name: 'Alex', isDependant: false },
      { id: 'p3', name: 'Older contact' },
    ],
  };
  const restored = validateSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored.contacts, snapshot.contacts);
  assert.equal(restored.people, 7, 'separate household settings are not overwritten');
  assert.deepEqual(buildFoodWaterRoster(restored.contacts), [{ id: 'p1', name: 'Morgan', isDependant: true }]);
  assert.deepEqual(buildFoodWaterRoster(validateSnapshot({ items: [], contacts: [{ id: 'old', name: 'Older contact' }] }).contacts), []);
});

test('malformed dependant flags are rejected before restoring a backup', () => {
  for (const isDependant of ['true', 'false', 1, 0, null, {}, []]) {
    assert.throws(() => validateSnapshot({ items: [], contacts: [{ id: 'p1', name: 'Morgan', isDependant }] }), undefined, `flag ${JSON.stringify(isDependant)}`);
  }
  for (const isDependant of [true, false, undefined]) {
    assert.doesNotThrow(() => validateSnapshot({ items: [], contacts: [{ id: 'p1', name: 'Morgan', isDependant }] }));
  }
});

test('Overview, Food, Water and Rationing agree as the selected directory population changes', () => {
  const contacts = [
    { id: 'p1', name: 'Morgan', isDependant: true },
    { id: 'p2', name: 'Alex', isDependant: true },
    { id: 'p3', name: 'Other contact', isDependant: false },
  ];
  for (const [directory, foodDays, waterDays] of [
    [contacts, 18, 60],
    [contacts.filter(person => person.id !== 'p1'), 36, 120],
    [contacts.map(person => ({ ...person, isDependant: false })), null, null],
    [[], null, null],
  ]) {
    const count = buildFoodWaterRoster(directory).length;
    const ration = computeRationing(supplies, count, 2000);
    const overview = computeEssentialCoverage(supplies, count, 2000);
    assert.equal(ration.foodDays, foodDays);
    assert.equal(ration.waterDays, waterDays);
    assert.equal(overview.food.days, foodDays);
    assert.equal(overview.water.days, waterDays);
    assert.equal(buildEssentialPlanning('food', supplies, count, 2000).bigNum, foodDays === null ? '—' : String(foodDays));
    assert.equal(buildEssentialPlanning('water', supplies, count, 2000).bigNum, waterDays === null ? '—' : String(waterDays));
    assert.equal(ration.totalCalories, 72000, 'changing people never changes the saved supplies');
    assert.equal(ration.totalWaterGal, 120);
  }
});
