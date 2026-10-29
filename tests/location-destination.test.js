import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCATION_KEY, LOCATION_WATCHLIST_KEY, LOCATION_DESTINATION_KEY,
  normalizeLocationDestination, readLocationDestination, saveLocationDestination,
} from '../src/location.js';
import { captureWorkspaceSettings, isWorkspaceSettingKey, switchAccountWorkspace } from '../src/account-workspace.js';
import { persistRestoredSnapshot, readBackupFile } from '../src/backup-storage.js';
import { resetActivePlan, restorePreviousPlan } from '../src/plan-reset.js';

const toronto = { id: 'home-city', name: 'Toronto', region: 'Ontario', country: 'Canada', countryCode: 'CA', latitude: 43.65, longitude: -79.38, timezone: 'America/Toronto' };
const ottawa = { id: 'destination-city', name: 'Ottawa', region: 'Ontario', country: 'Canada', countryCode: 'CA', latitude: 45.42, longitude: -75.7, timezone: 'America/Toronto' };
const montreal = { id: 'another-city', name: 'Montreal', region: 'Quebec', country: 'Canada', countryCode: 'CA', latitude: 45.5, longitude: -73.57, timezone: 'America/Toronto' };
const empty = () => ({ version: 4, items: [], properties: [{ id: 'prop1', name: 'Home', active: true }], propertyProfile: {}, localSettings: {} });
class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); this.failWrite = false; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failWrite) throw new Error('Storage full'); this.values.set(key, String(value)); }
  removeItem(key) { if (this.failWrite) throw new Error('Storage unavailable'); this.values.delete(key); }
  dump() { return Object.fromEntries(this.values); }
}

test('destination stores only a selected place without changing home or the news watchlist', () => {
  const storage = new MemoryStorage({ [LOCATION_KEY]: JSON.stringify(toronto), [LOCATION_WATCHLIST_KEY]: JSON.stringify([toronto, ottawa]) });
  const before = storage.dump();
  const chosen = { ...ottawa, privateToken: 'secret', coordinates: [[1, 2]], route: { duration: 10 }, directions: ['turn'] };
  assert.deepEqual(saveLocationDestination(storage, chosen), ottawa);
  assert.deepEqual(readLocationDestination(storage), ottawa);
  assert.equal(storage.getItem(LOCATION_KEY), before[LOCATION_KEY]);
  assert.equal(storage.getItem(LOCATION_WATCHLIST_KEY), before[LOCATION_WATCHLIST_KEY]);
  assert.equal(storage.getItem(LOCATION_DESTINATION_KEY), JSON.stringify(ottawa));
  assert.equal(chosen.privateToken, 'secret', 'normalization must not mutate incoming data');
  assert.equal(saveLocationDestination(storage, null), null);
  assert.equal(storage.getItem(LOCATION_DESTINATION_KEY), null);
  assert.equal(readLocationDestination(storage), null);
  assert.deepEqual(storage.dump(), before);
});

test('invalid destination input is rejected before replacing a saved choice', () => {
  const storage = new MemoryStorage(); saveLocationDestination(storage, ottawa); const before = storage.dump();
  for (const value of [undefined, {}, [], { ...ottawa, latitude: 91 }, { ...ottawa, longitude: Infinity }, { ...ottawa, countryCode: 'Canada' }, { ...ottawa, name: '' }, { ...ottawa, country: 42 }]) {
    assert.throws(() => saveLocationDestination(storage, value));
    assert.deepEqual(storage.dump(), before);
  }
  assert.deepEqual(normalizeLocationDestination({ ...ottawa, name: ' Ottawa ' }), ottawa);
  assert.equal(normalizeLocationDestination(null), null);
});

test('damaged destinations and storage failures remain recoverable without implicit overwrites', () => {
  for (const raw of ['broken JSON', '[]', '{}', '42', JSON.stringify({ ...ottawa, latitude: '45' })]) {
    const storage = new MemoryStorage({ [LOCATION_DESTINATION_KEY]: raw }); const before = storage.dump();
    assert.throws(() => readLocationDestination(storage), /saved destination could not be read/);
    assert.deepEqual(storage.dump(), before);
  }
  assert.equal(readLocationDestination(new MemoryStorage({ [LOCATION_DESTINATION_KEY]: 'null' })), null);
  assert.throws(() => readLocationDestination({ getItem() { throw new Error('Denied'); } }), /could not be read/);
  const storage = new MemoryStorage(); saveLocationDestination(storage, ottawa); const before = storage.dump(); storage.failWrite = true;
  assert.throws(() => saveLocationDestination(storage, montreal), /Storage full/);
  assert.throws(() => saveLocationDestination(storage, null), /Storage unavailable/);
  assert.deepEqual(storage.dump(), before);
});

test('destination is included in complete backups and invalid restore fails before any writes', async () => {
  assert.equal(isWorkspaceSettingKey(LOCATION_DESTINATION_KEY), true);
  const storage = new MemoryStorage(); saveLocationDestination(storage, ottawa);
  const snapshot = { ...empty(), localSettings: captureWorkspaceSettings(storage) };
  assert.equal(snapshot.localSettings[LOCATION_DESTINATION_KEY], JSON.stringify(ottawa));
  const restored = new MemoryStorage(); persistRestoredSnapshot(restored, await readBackupFile(JSON.stringify(snapshot)));
  assert.deepEqual(readLocationDestination(restored), ottawa);
  const before = restored.dump();
  for (const raw of ['{}', JSON.stringify({ ...ottawa, longitude: 181 }), 'invalid']) {
    const bad = { ...empty(), localSettings: { [LOCATION_DESTINATION_KEY]: raw } };
    await assert.rejects(readBackupFile(JSON.stringify(bad)), /Invalid saved setting/);
    assert.throws(() => persistRestoredSnapshot(restored, bad), /Invalid saved setting/);
    assert.deepEqual(restored.dump(), before);
  }
  persistRestoredSnapshot(restored, empty());
  assert.equal(readLocationDestination(restored), null, 'restoring a complete plan with no destination clears the previous plan’s selection');
});

test('different accounts and guest plans keep independent destinations', () => {
  const storage = new MemoryStorage(); saveLocationDestination(storage, ottawa);
  const switchTo = accountId => switchAccountWorkspace(storage, { accountId, currentSnapshot: empty(), emptySnapshot: empty() });
  switchTo('person-a'); switchTo('person-b');
  assert.equal(readLocationDestination(storage), null);
  saveLocationDestination(storage, montreal);
  switchTo(null); assert.equal(readLocationDestination(storage), null);
  saveLocationDestination(storage, toronto);
  switchTo('person-a'); assert.deepEqual(readLocationDestination(storage), ottawa);
  switchTo('person-b'); assert.deepEqual(readLocationDestination(storage), montreal);
  switchTo(null); assert.deepEqual(readLocationDestination(storage), toronto);
});

test('clearing the active plan removes its destination and undo restores that same plan’s choice', () => {
  const snapshot = empty();
  const storage = new MemoryStorage({ 'prepvault-db': JSON.stringify(snapshot), [LOCATION_KEY]: JSON.stringify(toronto), [LOCATION_WATCHLIST_KEY]: JSON.stringify([toronto, ottawa]) });
  saveLocationDestination(storage, ottawa);
  resetActivePlan(storage, { expectedOwner: undefined, currentSnapshot: snapshot, emptySnapshot: empty(), now: new Date('2026-10-29T12:00:00Z') });
  assert.equal(readLocationDestination(storage), null);
  assert.equal(storage.getItem(LOCATION_KEY), null);
  restorePreviousPlan(storage, { expectedOwner: undefined, now: new Date('2026-10-29T12:01:00Z') });
  assert.deepEqual(readLocationDestination(storage), ottawa);
  assert.equal(storage.getItem(LOCATION_KEY), JSON.stringify(toronto));
  assert.equal(storage.getItem(LOCATION_WATCHLIST_KEY), JSON.stringify([toronto, ottawa]));
});
