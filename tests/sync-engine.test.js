import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../src/sync-engine.js';

const USER = 'test-cloud-user';
const KEY = 'prepvault-db';
const BASELINE = `prepvault-sync-baseline-${USER}`;
const supply = (overrides = {}) => ({ id: 'water-1', category: 'water', subType: 'storedWater', name: 'Drinking water', quantity: 2, location: '', fields: { capacity: '5' }, addedDate: '2026-10-26', propertyId: 'prop1', ...overrides });
const property = { id: 'prop1', name: 'Home', type: 'home', icon: '🏠' };
const snapshot = (overrides = {}) => ({ items: [supply()], pins: [], properties: [property], people: 4, climate: 'cold', propAddress: '', activePropertyId: 'prop1', contacts: [{ id: 'c1', name: 'Morgan' }], gardenBeds: [{ id: 'g1', name: 'Kitchen garden' }], demoData: false, ...overrides });
const row = item => ({ id: item.id, user_id: USER, category: item.category, sub_type: item.subType, name: item.name, quantity: item.quantity, location: item.location, fields: item.fields, added_date: item.addedDate, property_id: item.propertyId, deleted_at: null });

function environment(t, initial) {
  const descriptors = Object.fromEntries(['window', 'navigator', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map([[KEY, JSON.stringify(initial)]]);
  const window = new EventTarget();
  const navigator = { onLine: true };
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  for (const [key, value] of Object.entries({ window, navigator, localStorage: storage })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => { for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return { window, navigator, storage, read: key => JSON.parse(storage.getItem(key)), write: (key, value) => storage.setItem(key, JSON.stringify(value)) };
}

function backend({ items = [], pins = [], properties = [property], profile = {}, hook } = {}) {
  const tables = { items: items.map(row), map_pins: pins.map(pin => ({ ...pin, user_id: USER, deleted_at: null })), properties: properties.map(p => ({ ...p, user_id: USER })), profiles: [{ id: USER, people: 4, climate: 'cold', prop_address: '', active_property_id: 'prop1', ...profile }] };
  const calls = [];
  return {
    tables, calls,
    from(table) {
      let action, payload, single = false;
      const filters = [];
      const query = {
        select() { action = 'select'; return query; },
        eq(key, value) { filters.push(record => record[key] === value); return query; },
        is(key, value) { filters.push(record => (record[key] ?? null) === value); return query; },
        in(key, values) { filters.push(record => values.includes(record[key])); return query; },
        maybeSingle() { single = true; return query; },
        upsert(value) { action = 'upsert'; payload = structuredClone(value); return query; },
        update(value) { action = 'update'; payload = structuredClone(value); return query; },
        delete() { action = 'delete'; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(async () => {
            const call = { table, action, payload };
            calls.push(call);
            const failure = await hook?.(call);
            if (failure) return { error: failure, data: null };
            const matches = record => filters.every(filter => filter(record));
            if (action === 'select') { const records = tables[table].filter(matches); return { data: structuredClone(single ? records[0] ?? null : records), error: null }; }
            if (action === 'upsert') for (const record of payload) { const index = tables[table].findIndex(old => old.id === record.id && old.user_id === record.user_id); if (index < 0) tables[table].push(record); else tables[table][index] = { ...tables[table][index], ...record }; }
            if (action === 'update') tables[table] = tables[table].map(record => matches(record) ? { ...record, ...payload } : record);
            if (action === 'delete') tables[table] = tables[table].filter(record => !matches(record));
            return { data: null, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function engineFor(t, db) {
  const engine = new SyncEngine(db);
  t.after(() => engine.destroy());
  return engine;
}

test('local accounts and offline startup never claim cloud sync or access the backend', async t => {
  const env = environment(t, snapshot());
  const db = backend();
  const engine = engineFor(t, db);
  await engine.setUser('local-device-account');
  assert.equal(engine.status, 'local');
  env.navigator.onLine = false;
  await engine.setUser(USER);
  assert.equal(engine.status, 'offline');
  assert.equal(db.calls.length, 0);
});

test('pull merges local and remote additions, preserves zero quantities and on-device fields', async t => {
  const local = snapshot({ items: [supply({ quantity: 0 })], properties: [{ ...property, lat: 0, lng: -79 }] });
  const env = environment(t, local);
  const db = backend({ items: [supply({ id: 'remote-only', quantity: 6 })] });
  const engine = engineFor(t, db);
  let applied;
  engine.setDataCallback(data => { applied = data; });
  await engine.setUser(USER);
  assert.equal(engine.status, 'synced');
  assert.equal(applied.items.length, 2);
  assert.equal(db.tables.items.find(item => item.id === 'water-1').quantity, 0);
  assert.deepEqual(env.read(KEY).contacts, local.contacts);
  assert.deepEqual(env.read(KEY).gardenBeds, local.gardenBeds);
  assert.equal(db.tables.properties[0].lat, 0);
  assert.equal(db.tables.properties[0].lng, -79);
});

test('local deletions become cloud tombstones and do not return after another pull', async t => {
  const local = snapshot({ items: [] });
  const env = environment(t, local);
  env.write(BASELINE, snapshot());
  const db = backend({ items: [supply()] });
  const engine = engineFor(t, db);
  await engine.setUser(USER);
  assert.deepEqual(env.read(KEY).items, []);
  assert.ok(db.tables.items[0].deleted_at);
  await engine.schedule(() => engine.pull());
  assert.deepEqual(env.read(KEY).items, []);
});

test('remote deletion removes an unchanged local record without erasing household data', async t => {
  const env = environment(t, snapshot());
  env.write(BASELINE, snapshot());
  const db = backend({ items: [] });
  const engine = engineFor(t, db);
  await engine.setUser(USER);
  assert.deepEqual(env.read(KEY).items, []);
  assert.equal(env.read(KEY).contacts[0].name, 'Morgan');
  assert.equal(db.tables.items.length, 0, 'deleted remote row must not be recreated');
});

test('cloud settings update unchanged local fields while local profile edits are preserved', async t => {
  const env = environment(t, snapshot({ people: 6 }));
  env.write(BASELINE, snapshot());
  const db = backend({ items: [supply()], profile: { people: 8, prop_address: 'Updated in cloud' } });
  const engine = engineFor(t, db);
  await engine.setUser(USER);
  assert.equal(env.read(KEY).people, 6);
  assert.equal(env.read(KEY).propAddress, 'Updated in cloud');
  assert.equal(env.read(BASELINE).propAddress, 'Updated in cloud');
});

test('snapshot provider protects an edit still waiting for React autosave', async t => {
  const stale = snapshot();
  const env = environment(t, stale);
  env.write(BASELINE, stale);
  const pending = snapshot({ items: [supply({ quantity: 12 })] });
  const db = backend({ items: [supply({ quantity: 5 }), supply({ id: 'cloud-added' })] });
  const engine = engineFor(t, db);
  engine.setSnapshotProvider(() => pending);
  let applied;
  engine.setDataCallback(data => { applied = data; });
  await engine.setUser(USER);
  assert.equal(applied.items.find(item => item.id === 'water-1').quantity, 12);
  assert.equal(db.tables.items.find(item => item.id === 'water-1').quantity, 12);
  assert.ok(db.tables.items.find(item => item.id === 'cloud-added'), 'push must use merged data before React rerenders its provider');
});

test('an unchanged pull does not call React and start an autosave/sync loop', async t => {
  const env = environment(t, snapshot());
  env.write(BASELINE, snapshot());
  const db = backend({ items: [supply()] });
  const engine = engineFor(t, db);
  let callbacks = 0;
  engine.setDataCallback(() => { callbacks += 1; });
  await engine.setUser(USER);
  await engine.schedule(() => engine.pull());
  assert.equal(callbacks, 0);
  assert.equal(engine.status, 'synced');
});

test('sample inventory is not uploaded into a cloud account', async t => {
  const env = environment(t, snapshot({ demoData: true }));
  const db = backend({ items: [supply({ id: 'real-cloud-record' })] });
  const engine = engineFor(t, db);
  await engine.setUser(USER);
  assert.deepEqual(env.read(KEY).items.map(item => item.id), ['real-cloud-record']);
  assert.equal(env.read(KEY).demoData, false);
  assert.equal(db.tables.items.some(item => item.id === 'water-1'), false);
});

test('a failed pin write reports error rather than claiming a successful partial backup', async t => {
  const env = environment(t, snapshot({ pins: [{ id: 'pin1', layer: 'caches', type: 'marker', x: 0, y: 0, label: 'Cache', notes: '', assignee: '' }] }));
  const db = backend({ hook: call => call.table === 'map_pins' && call.action === 'upsert' ? new Error('Rejected pin') : null });
  const engine = engineFor(t, db);
  const statuses = [];
  engine.setStatusCallback(status => statuses.push(status));
  await engine.setUser(USER);
  assert.equal(engine.status, 'error');
  assert.equal(statuses.includes('synced'), false);
  assert.equal(env.read(KEY).pins.length, 1);
});

test('destroying during a pull prevents callback, local replacement and subsequent uploads', async t => {
  const env = environment(t, snapshot());
  const before = env.storage.getItem(KEY);
  let engine;
  const db = backend({ items: [supply({ id: 'remote' })], hook: call => { if (call.action === 'select') engine.destroy(); } });
  engine = engineFor(t, db);
  let callbacks = 0;
  engine.setDataCallback(() => { callbacks += 1; });
  await engine.setUser(USER);
  assert.equal(callbacks, 0);
  assert.equal(env.storage.getItem(KEY), before);
  assert.equal(db.calls.some(call => call.action !== 'select'), false);
});

test('logout during upload stops remaining writes and does not mark a new account synced', async t => {
  environment(t, snapshot());
  let engine;
  const db = backend({ hook: call => { if (call.action === 'upsert') engine.setUser(null); } });
  engine = engineFor(t, db);
  engine.userId = USER;
  await engine.schedule(() => engine.push());
  assert.deepEqual(db.calls.map(call => call.table), ['properties']);
  assert.equal(engine.status, 'local');
});

test('scheduled work is serialized and stale queued work is cancelled on account change', async t => {
  environment(t, snapshot());
  const engine = engineFor(t, backend());
  engine.userId = USER;
  const events = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = engine.schedule(async () => { events.push('first-start'); await gate; events.push('first-end'); });
  const second = engine.schedule(() => { events.push('second'); });
  await Promise.resolve();
  assert.deepEqual(events, ['first-start']);
  engine.setUser(null);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first-start', 'first-end']);
});

test('reconnection fetches remote changes before uploading offline edits', async t => {
  const env = environment(t, snapshot({ items: [supply(), supply({ id: 'offline-added' })] }));
  env.write(BASELINE, snapshot());
  env.navigator.onLine = false;
  const db = backend({ items: [supply({ quantity: 8 })] });
  const engine = engineFor(t, db);
  await engine.setUser(USER);
  assert.equal(db.calls.length, 0);
  env.navigator.onLine = true;
  env.window.dispatchEvent(new Event('online'));
  await new Promise(resolve => setTimeout(resolve, 1250));
  await engine.queue;
  assert.equal(db.calls[0].action, 'select');
  assert.equal(db.tables.items.find(item => item.id === 'water-1').quantity, 8);
  assert.ok(db.tables.items.find(item => item.id === 'offline-added'));
  assert.equal(engine.status, 'synced');
});

test('cloud updates preserve local-only item, pin and property fields across repeated syncs', async t => {
  const pin = { id: 'pin1', layer: 'caches', type: 'marker', x: 0, y: 0, label: 'Old label', notes: 'Old cloud note', assignee: '' };
  const before = snapshot({ items: [supply({ notes: 'Old local note' })], pins: [{ ...pin, photo: 'local-pin-image' }], properties: [{ ...property, description: 'Local property notes' }] });
  const local = { ...before, items: [supply({ notes: 'Edited local note', customData: { retained: true } })] };
  const env = environment(t, local);
  env.write(BASELINE, before);
  const db = backend({ items: [supply({ quantity: 7 })], pins: [{ ...pin, label: 'Cloud label', notes: 'New cloud note' }], properties: [{ ...property, name: 'Cloud home name' }] });
  const engine = engineFor(t, db);
  await engine.setUser(USER);
  await engine.schedule(() => engine.pull());
  const saved = env.read(KEY);
  assert.equal(saved.items[0].quantity, 7, 'local note-only change must not overwrite the cloud quantity');
  assert.equal(saved.items[0].notes, 'Edited local note');
  assert.deepEqual(saved.items[0].customData, { retained: true });
  assert.equal(saved.pins[0].label, 'Cloud label');
  assert.equal(saved.pins[0].notes, 'New cloud note', 'pin notes are a synced field, unlike top-level item notes');
  assert.equal(saved.pins[0].photo, 'local-pin-image');
  assert.equal(saved.properties[0].name, 'Cloud home name');
  assert.equal(saved.properties[0].description, 'Local property notes');
  assert.equal(db.tables.items[0].quantity, 7);
  assert.equal(db.tables.items[0].notes, undefined, 'local-only notes must not be sent to an unsupported cloud column');
});

test('a local-only note edit cannot resurrect a cloud-deleted inventory item', async t => {
  const env = environment(t, snapshot({ items: [supply({ notes: 'Edited locally' })] }));
  env.write(BASELINE, snapshot({ items: [supply({ notes: 'Old local note' })] }));
  const db = backend({ items: [] });
  const engine = engineFor(t, db);
  await engine.setUser(USER);
  assert.deepEqual(env.read(KEY).items, []);
  assert.deepEqual(db.tables.items, []);
});
