import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefensePositions, groupPositionAssignments, patchPositionAssignment } from '../src/defense-positions.js';

const position = (id, fields = {}) => ({ id, layer: 'defense', type: 'observation', label: id, x: 25, y: 40, ...fields });
const properties = [{ id: 'cabin', name: 'Cabin' }, { id: 'prop1', name: 'Home' }];

test('positions use saved maps, preserve property identity, and exclude other marker types', () => {
  const home = position('home');
  const cabin = position('cabin');
  const records = getDefensePositions({ properties, activePropertyId: 'all', legacyPins: [position('legacy')], mapSetups: {
    prop1: { pins: [home, position('alarm', { type: 'alarm_trip' }), position('obstacle', { type: 'obstacle' }), position('building', { layer: 'buildings' })] },
    cabin: { pins: [cabin] },
  } });
  assert.deepEqual(records, [
    { key: '["cabin","cabin"]', propertyId: 'cabin', propertyName: 'Cabin', pin: cabin },
    { key: '["prop1","home"]', propertyId: 'prop1', propertyName: 'Home', pin: home },
  ]);
  assert.equal(records[0].pin, cabin);
  assert.deepEqual(getDefensePositions({ properties, activePropertyId: 'cabin', legacyPins: [home] }), []);
  assert.deepEqual(getDefensePositions({ properties, activePropertyId: 'missing', legacyPins: [home] }), []);
});

test('legacy positions belong only to the primary property, with prop1 preferred over array order', () => {
  const legacy = position('legacy');
  assert.deepEqual(getDefensePositions({ properties, legacyPins: [legacy] }).map(record => record.propertyId), ['prop1']);
  assert.deepEqual(getDefensePositions({ properties: [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }], activePropertyId: 'all', legacyPins: [legacy] }).map(record => record.propertyId), ['first']);
  assert.deepEqual(getDefensePositions({ legacyPins: [legacy] }), []);
});

test('an explicitly empty saved map keeps the primary property empty', () => {
  assert.deepEqual(getDefensePositions({ properties, activePropertyId: 'all', legacyPins: [position('legacy')], mapSetups: { prop1: { pins: [] } } }), []);
});

test('compound keys distinguish duplicate marker IDs and delimiter-like property names', () => {
  const shared = position('same');
  const records = getDefensePositions({ properties, activePropertyId: 'all', legacyPins: [shared], mapSetups: { cabin: { pins: [{ ...shared }] } } });
  assert.equal(records.length, 2);
  assert.notEqual(records[0].key, records[1].key);
  assert.deepEqual(records.map(record => JSON.parse(record.key)), [['cabin', 'same'], ['prop1', 'same']]);
  const unusual = getDefensePositions({ properties: [{ id: 'a:b', name: 'One' }, { id: 'a', name: 'Two' }], activePropertyId: 'all', mapSetups: { 'a:b': { pins: [position('c')] }, a: { pins: [position('b:c')] } } });
  assert.notEqual(unusual[0].key, unusual[1].key);
});

test('grouping trims outer whitespace without merging different recorded identities', () => {
  const records = [' Sam ', 'Sam', 'sam', '', '  ', undefined, '__proto__'].map((assignee, index) => ({ key: String(index), propertyId: `property-${index}`, pin: position(String(index), { assignee }) }));
  const groups = groupPositionAssignments(records);
  assert.deepEqual(groups.map(group => [group.name, group.positions.length]), [['Sam', 2], ['sam', 1], ['__proto__', 1]]);
  assert.equal(groups[0].positions[0], records[0]);
  assert.equal(groups[0].positions[1], records[1]);
  assert.equal(groupPositionAssignments([...records].reverse()).find(group => group.name === 'Sam').key, groups[0].key);
  assert.deepEqual(groupPositionAssignments([]), []);
});

test('assignment patches retain placement, marker metadata and untouched records without mutating input', () => {
  const original = position('one', { notes: 'Existing', custom: { retained: true }, assignee: 'Before' });
  const other = position('two', { assignee: 'Other' });
  const pins = [original, other];
  const result = patchPositionAssignment(pins, 'one', { assignee: ' After ', assignmentRole: ' Recorded role ', assignmentEquipment: ' Notebook ', notes: ' First line\nSecond line ' });
  assert.deepEqual(result[0], { ...original, assignee: 'After', assignmentRole: 'Recorded role', assignmentEquipment: 'Notebook', notes: 'First line\nSecond line' });
  assert.equal(result[0].custom, original.custom);
  assert.equal(result[1], other);
  assert.equal(original.assignee, 'Before');
  assert.equal(original.notes, 'Existing');
  assert.notEqual(result, pins);
});

test('patches ignore unrelated, inherited and non-string fields', () => {
  const pins = [position('one', { assignee: 'Original', notes: 'Keep me' })];
  const patch = Object.assign(Object.create({ assignmentRole: 'Inherited' }), {
    id: 'changed', layer: 'water', type: 'well', x: 99, y: 99, label: 'Changed',
    assignee: 42, assignmentEquipment: null, notes: ['not text'], extra: 'forbidden',
  });
  assert.equal(patchPositionAssignment(pins, 'one', patch), pins);
  assert.equal(patchPositionAssignment(pins, 'one', null), pins);
  assert.deepEqual(patchPositionAssignment(pins, 'missing', { assignee: 'Nobody' }), pins);
});

test('assignment fields have bounded lengths and explicit whitespace clears a field', () => {
  const pins = [position('one', { assignee: 'Original' })];
  const result = patchPositionAssignment(pins, 'one', { assignee: 'a'.repeat(121), assignmentRole: 'r'.repeat(201), assignmentEquipment: 'e'.repeat(501), notes: 'n'.repeat(3001) });
  assert.deepEqual(['assignee', 'assignmentRole', 'assignmentEquipment', 'notes'].map(field => result[0][field].length), [120, 200, 500, 3000]);
  assert.equal(patchPositionAssignment(pins, 'one', { assignee: '  ' })[0].assignee, '');
});
