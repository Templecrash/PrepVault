import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareInventoryImport } from '../src/inventory-import.js';

const properties = [{ id: 'home', name: 'Home' }, { id: 'cabin', name: 'Cabin' }];
const supply = (changes = {}) => ({ id: 'water-1', category: 'water', subType: 'stored', name: 'Stored water', quantity: 4, propertyId: 'home', fields: { volume: '20 gal' }, ...changes });

function freezeDeep(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freezeDeep); }
  return value;
}

test('supplies-only import adds records and preserves current quantities and nested data', () => {
  const current = freezeDeep([supply({ quantity: '9', fields: { volume: '20 gal', notes: ['Current note'] } })]);
  const incoming = freezeDeep([supply({ id: 'food-1', category: 'food', quantity: '3', fields: { calories: 100, notes: ['Imported note'] } })]);
  const result = prepareInventoryImport(current, incoming, properties);
  assert.deepEqual(result.items[0], current[0]);
  assert.equal(result.items[1].quantity, 3);
  assert.equal(result.items.length, 2);
  assert.equal(result.addedCount, 1);
  assert.equal(result.duplicateCount, 0);
  assert.equal(result.conflictCount, 0);
  result.items[0].fields.notes.push('Result edit');
  result.items[1].fields.notes.push('Result edit');
  assert.deepEqual(current[0].fields.notes, ['Current note']);
  assert.deepEqual(incoming[0].fields.notes, ['Imported note']);
});

test('existing IDs win over changed quantities, categories, names and property assignments', () => {
  const original = supply({ quantity: 12 });
  const variants = [supply({ quantity: 1 }), supply({ category: 'food' }), supply({ name: 'Different supply' }), supply({ propertyId: 'cabin' })];
  const result = prepareInventoryImport([original], variants, properties);
  assert.deepEqual(result.items, [original]);
  assert.equal(result.addedCount, 0);
  assert.equal(result.conflictCount, 4);
  assert.equal(result.duplicateCount, 0);
});

test('identical IDs deduplicate independent of JSON field order and numeric quantity representation', () => {
  const original = supply();
  const reordered = { fields: { volume: '20 gal' }, quantity: '4', propertyId: 'home', name: 'Stored water', subType: 'stored', category: 'water', id: 'water-1' };
  const result = prepareInventoryImport([original], [reordered, supply()], properties);
  assert.deepEqual(result.items, [original]);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.conflictCount, 0);
});

test('conflicting repeated incoming IDs retain the first record and report every skipped entry', () => {
  const first = supply();
  const result = prepareInventoryImport([], [first, supply(), supply({ name: 'Conflict', quantity: 8 })], properties);
  assert.deepEqual(result.items, [first]);
  assert.equal(result.addedCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.conflictCount, 1);
});

test('known properties stay assigned while unavailable properties remap only with an explicit valid target', () => {
  const current = [supply()];
  const incoming = [supply({ id: 'known', propertyId: 'cabin' }), supply({ id: 'old', propertyId: 'former-house' }), supply({ id: 'missing', propertyId: undefined })];
  const before = structuredClone({ current, incoming, properties });
  assert.throws(() => prepareInventoryImport(current, incoming, properties), /missing property/);
  assert.throws(() => prepareInventoryImport(current, incoming, properties, 'all'), /existing property/);
  const result = prepareInventoryImport(current, incoming, properties, 'home');
  assert.deepEqual(result.items.map(item => item.propertyId), ['home', 'cabin', 'home', 'home']);
  assert.equal(result.remappedCount, 2);
  assert.equal(result.unavailablePropertyCount, 2);
  assert.equal(result.addedCount, 3);
  assert.deepEqual({ current, incoming, properties }, before);
});

test('reimporting a remapped backup is idempotent and never moves existing supplies', () => {
  const incoming = [supply({ propertyId: 'former-house' }), supply({ propertyId: 'former-house' })];
  const initial = prepareInventoryImport([], incoming, properties, 'home');
  assert.equal(initial.addedCount, 1);
  assert.equal(initial.duplicateCount, 1);
  assert.equal(initial.remappedCount, 1);
  const again = prepareInventoryImport(initial.items, incoming, properties, 'home');
  assert.equal(again.addedCount, 0);
  assert.equal(again.duplicateCount, 2);
  assert.equal(again.remappedCount, 0);
  const otherTarget = prepareInventoryImport(initial.items, incoming, properties, 'cabin');
  assert.equal(otherTarget.conflictCount, 2);
  assert.equal(otherTarget.items[0].propertyId, 'home');
});

test('invalid inventories fail before returning a partial result and leave both inputs intact', () => {
  const current = [supply()];
  for (const invalid of [null, {}, supply({ id: '' }), supply({ category: '' }), supply({ subType: '' }), supply({ name: null }), supply({ quantity: null }), supply({ quantity: ' ' }), supply({ quantity: -1 }), supply({ quantity: Infinity }), supply({ quantity: true }), supply({ fields: [] }), supply({ propertyId: 42 })]) {
    const incoming = [supply({ id: 'valid-new' }), invalid];
    const before = structuredClone({ current, incoming });
    assert.throws(() => prepareInventoryImport(current, incoming, properties), /invalid inventory entry/);
    assert.deepEqual({ current, incoming }, before);
  }
  assert.throws(() => prepareInventoryImport(null, [], properties), /valid supplies inventory/);
  assert.throws(() => prepareInventoryImport([], {}, properties), /valid supplies inventory/);
  assert.throws(() => prepareInventoryImport([], [], []), /Add a property/);
  assert.throws(() => prepareInventoryImport([], [], [{ id: 'home' }, { id: 'home' }]), /Property identities/);
  assert.throws(() => prepareInventoryImport([supply(), supply()], [], properties), /Existing supply identities/);
});

test('empty imports and skipped conflicts never introduce unrelated plan collections', () => {
  const current = [supply({ propertyId: 'legacy-location' })];
  const result = prepareInventoryImport(current, [], properties);
  assert.deepEqual(result.items, current);
  assert.deepEqual(Object.keys(result).sort(), ['items', 'addedCount', 'duplicateCount', 'conflictCount', 'unavailablePropertyCount', 'remappedCount'].sort());
  const conflict = prepareInventoryImport(current, [supply({ propertyId: 'missing', quantity: 100 })], properties);
  assert.deepEqual(conflict.items, current);
  assert.equal(conflict.conflictCount, 1);
});
