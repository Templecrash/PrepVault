import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { encodeBytes, MAX_MAP_IMAGE_LENGTH, mergeRecords, recordsEqual, SNAPSHOT_ARRAYS, validateSnapshot } from '../src/storage.js';

const supply = (overrides = {}) => ({ id: 'water-1', category: 'water', subType: 'storedWater', name: 'Drinking water', quantity: 2, fields: { capacity: '5' }, ...overrides });
const mapSetup = (overrides = {}) => ({ name: 'Home map', address: 'Ottawa, ON', image: { dataUrl: 'data:image/png;base64,aW1hZ2U=', width: 1600, height: 900 }, pins: [{ id: 'pin1', layer: 'buildings', type: 'house', x: 0, y: 100, label: 'House', notes: '' }], savedAt: '2026-10-26T12:00:00.000Z', ...overrides });
const route = (overrides = {}) => ({ id: 'route1', propertyId: 'prop1', name: 'Home to cabin', origin: 'Ottawa, ON', destination: 'Gatineau, QC', travelMode: 'driving', notes: 'Bring supplies', ...overrides });

test('saved images, per-property markers and routes round trip without changing legacy map data', () => {
  const snapshot = { items: [], pins: [{ id: 'legacy', x: 50, y: 20 }], propAddress: 'Legacy address', mapSetups: { prop1: mapSetup({ futureOption: true }), prop2: mapSetup({ name: 'Cabin map', pins: [] }) }, routes: [route({ futureOption: true })] };
  const before = structuredClone(snapshot);
  assert.deepEqual(validateSnapshot(JSON.parse(JSON.stringify(snapshot))), before);
  assert.deepEqual(snapshot, before);
  assert.equal(validateSnapshot({ items: [] }).mapSetups, undefined, 'legacy snapshot remains identifiable by the restore flow');
});

test('saved map validation accepts supported image formats and maximum dimensions', () => {
  for (const mime of ['png', 'jpeg', 'webp']) {
    const map = mapSetup({ image: { dataUrl: `data:image/${mime};base64,aW1hZ2U=`, width: 4096, height: 1 } });
    assert.deepEqual(validateSnapshot({ items: [], mapSetups: { prop1: map } }).mapSetups.prop1, map);
  }
});

test('saved map validation rejects unsafe, malformed and oversized image sources', () => {
  const invalid = [
    null,
    { dataUrl: 'https://example.com/map.png', width: 100, height: 100 },
    { dataUrl: 'data:image/svg+xml;base64,aW1hZ2U=', width: 100, height: 100 },
    { dataUrl: 'data:image/png;base64,aW1hZ2U', width: 100, height: 100 },
    { dataUrl: 'data:image/png;base64,', width: 100, height: 100 },
    { dataUrl: 'data:image/png;base64,====', width: 100, height: 100 },
    { dataUrl: 'data:image/png;base64,aW1h Z2U', width: 100, height: 100 },
    { dataUrl: 'data:image/png;base64,aW1hZ2U=', width: 0, height: 100 },
    { dataUrl: 'data:image/png;base64,aW1hZ2U=', width: 100, height: 4097 },
    { dataUrl: 'data:image/png;base64,aW1hZ2U=', width: '100', height: 100 },
    { dataUrl: `data:image/png;base64,${'A'.repeat(MAX_MAP_IMAGE_LENGTH)}`, width: 100, height: 100 },
  ];
  for (const image of invalid) assert.throws(() => validateSnapshot({ items: [], mapSetups: { prop1: mapSetup({ image }) } }), /saved map/);
});

test('saved map validation rejects malformed documents and marker coordinates', () => {
  const pin = mapSetup().pins[0];
  const invalid = [null, [], { prop1: null }, { prop1: mapSetup({ name: '' }) }, { prop1: mapSetup({ address: {} }) }, { prop1: mapSetup({ savedAt: 'not a date' }) }, { prop1: mapSetup({ pins: null }) }, { prop1: mapSetup({ pins: [null] }) }, { prop1: mapSetup({ pins: [pin, pin] }) }];
  for (const mapSetups of invalid) assert.throws(() => validateSnapshot({ items: [], mapSetups }), /saved map/);
  for (const change of [{ x: -1 }, { y: 101 }, { x: NaN }, { x: '10' }, { id: '' }, { layer: '' }, { type: '' }, { notes: {} }]) {
    assert.throws(() => validateSnapshot({ items: [], mapSetups: { prop1: mapSetup({ pins: [{ ...pin, ...change }] }) } }), /saved map/);
  }
  assert.throws(() => validateSnapshot(JSON.parse('{"items":[],"mapSetups":{"__proto__":{}}}')), /saved map/);
});

test('travel routes validate supported modes and reject missing endpoints or duplicate identities', () => {
  for (const travelMode of ['driving', 'walking', 'bicycling', 'transit']) {
    assert.deepEqual(validateSnapshot({ items: [], routes: [route({ travelMode })] }).routes, [route({ travelMode })]);
  }
  for (const change of [{ id: '' }, { propertyId: '' }, { name: '' }, { origin: ' ' }, { destination: '' }, { travelMode: 'teleport' }, { notes: {} }]) {
    assert.throws(() => validateSnapshot({ items: [], routes: [route(change)] }), /travel route/);
  }
  assert.throws(() => validateSnapshot({ items: [], routes: [route(), route()] }), /travel route/);
  for (const routes of [null, {}, [null]]) assert.throws(() => validateSnapshot({ items: [], routes }), /routes/);
});

test('legacy backups migrate missing property IDs and numeric quantities without losing custom data', () => {
  const legacy = { version: 3, items: [supply({ quantity: '0', notes: 'Keep sealed' })], people: 4, climate: 'cold' };
  const copy = structuredClone(legacy);
  const migrated = validateSnapshot(legacy);
  assert.equal(migrated.items[0].propertyId, 'prop1');
  assert.equal(migrated.items[0].quantity, 0);
  assert.equal(migrated.items[0].notes, 'Keep sealed');
  assert.deepEqual(legacy, copy, 'validation must not mutate the original backup');
});

test('an empty saved inventory remains valid and retains household records', () => {
  const snapshot = { version: 4, items: [], contacts: [{ id: 'c1', name: 'Morgan' }], gardenBeds: [], propertyProfile: { completedAt: '2026-10-26' }, propAddress: '' };
  assert.deepEqual(validateSnapshot(snapshot), snapshot);
});

test('complete backups retain every collection, settings and extension fields', () => {
  const snapshot = Object.fromEntries(SNAPSHOT_ARRAYS.map(key => [key, []]));
  Object.assign(snapshot, { version: 4, items: [supply()], properties: [{ id: 'prop1', name: 'Home' }], people: 4, climate: 'cold', propAddress: '', activePropertyId: 'prop1', propertyProfile: { heatSource: ['wood'] }, localSettings: { 'prepvault-user-channels': '[]' }, demoData: false, customFutureField: { retained: true } });
  const restored = validateSnapshot(JSON.parse(JSON.stringify(snapshot)));
  for (const key of SNAPSHOT_ARRAYS.filter(key => key !== 'items')) assert.deepEqual(restored[key], snapshot[key], key);
  assert.deepEqual(restored.localSettings, snapshot.localSettings);
  assert.deepEqual(restored.propertyProfile, snapshot.propertyProfile);
  assert.deepEqual(restored.customFutureField, snapshot.customFutureField);
});

test('legacy duplicate IDs receive stable collision-free IDs while preserving all records', () => {
  const snapshot = { items: [supply(), supply(), supply({ id: 'water-1-water-1' }), supply()] };
  const first = validateSnapshot(snapshot);
  assert.equal(first.items.length, 4);
  assert.equal(new Set(first.items.map(item => item.id)).size, 4);
  assert.deepEqual(validateSnapshot(first), first, 'migration must be idempotent');
});

test('malformed backups fail before being applied', () => {
  const invalid = [null, [], {}, { items: null }, { items: [null] }, { items: [supply({ id: '' })] }, { items: [supply({ quantity: -1 })] }, { items: [supply({ quantity: null })] }, { items: [supply({ quantity: false })] }, { items: [supply({ quantity: '' })] }, { items: [supply({ quantity: 'not a number' })] }, { items: [supply({ name: 42 })] }, { items: [supply({ fields: [] })] }, { items: [], contacts: [null] }, { items: [], people: 0 }, { items: [], properties: [] }, { items: [], propertyProfile: 'bad' }, { items: [], localSettings: [] }, { items: [], propAddress: {} }, { items: [], demoData: 'true' }];
  for (const value of invalid) assert.throws(() => validateSnapshot(value), undefined, JSON.stringify(value));
});

test('large binary backups encode without exceeding JavaScript argument limits', () => {
  const bytes = Uint8Array.from({ length: 1_048_579 }, (_, index) => index % 256);
  const encoded = encodeBytes(bytes);
  assert.equal(encoded, Buffer.from(bytes).toString('base64'));
  assert.deepEqual(new Uint8Array(Buffer.from(encoded, 'base64')), bytes);
  assert.equal(encodeBytes(new Uint8Array()), '');
});

test('record equality ignores object key order but preserves array order and values', () => {
  assert.equal(recordsEqual({ id: '1', fields: { a: 1, b: 2 } }, { fields: { b: 2, a: 1 }, id: '1' }), true);
  assert.equal(recordsEqual({ id: '1', optional: undefined }, { id: '1' }), true);
  assert.equal(recordsEqual({ a: [1, 2] }, { a: [2, 1] }), false);
  assert.equal(recordsEqual({ quantity: 0 }, { quantity: 1 }), false);
});

test('unchanged local records accept remote edits even when field order differs', () => {
  const baseline = [supply()];
  const local = [{ fields: { capacity: '5' }, quantity: 2, name: 'Drinking water', subType: 'storedWater', category: 'water', id: 'water-1' }];
  const remote = [supply({ quantity: 7 })];
  assert.deepEqual(mergeRecords(local, remote, baseline), remote);
});

test('local edits and additions survive conflicting remote edits', () => {
  const base = [supply()];
  const local = [supply({ quantity: 0 }), supply({ id: 'new-local' })];
  const remote = [supply({ quantity: 9 }), supply({ id: 'new-cloud' })];
  const result = mergeRecords(local, remote, base);
  assert.equal(result.find(item => item.id === 'water-1').quantity, 0);
  assert.deepEqual(new Set(result.map(item => item.id)), new Set(['water-1', 'new-local', 'new-cloud']));
});

test('local tombstones are not resurrected and remote tombstones remove untouched records', () => {
  const base = [supply()];
  assert.deepEqual(mergeRecords([], base, base), []);
  assert.deepEqual(mergeRecords(base, [], base), []);
  assert.deepEqual(mergeRecords([supply({ quantity: 3 })], [], base), [supply({ quantity: 3 })], 'new local edits still survive remote deletion');
  assert.deepEqual(mergeRecords([], [], base), []);
});

test('local-only notes survive remote updates without preventing core updates or deletions', () => {
  const options = { syncedKeys: ['id', 'quantity'] };
  const before = [{ id: '1', quantity: 2, notes: 'Old note' }];
  const local = [{ id: '1', quantity: 2, notes: 'Fresh note', photo: 'local-image' }];
  assert.deepEqual(mergeRecords(local, [{ id: '1', quantity: 9 }], before, options), [{ id: '1', quantity: 9, notes: 'Fresh note', photo: 'local-image' }]);
  assert.deepEqual(mergeRecords(local, [], before, options), [], 'a note change does not resurrect a remote tombstone');
  assert.deepEqual(mergeRecords([], [{ id: '1', quantity: 9 }], before, options), [], 'local deletions remain authoritative');
});

test('local-only merge does not carry a removed cloud field back into the record', () => {
  const before = [{ id: 'home', name: 'Home', lat: 45, lng: -79, description: 'Our home' }];
  const remote = [{ id: 'home', name: 'Home' }];
  const merged = mergeRecords(before, remote, before, { syncedKeys: ['id', 'name', 'lat', 'lng'] });
  assert.deepEqual(merged, [{ id: 'home', name: 'Home', description: 'Our home' }]);
});
