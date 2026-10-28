import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATION_KEY, LOCATION_WATCHLIST_KEY, MAX_WATCHED_LOCATIONS, locationWatchKey, normalizeLocationWatchlist, readLocationWatchlist, saveLocationWatchlist } from '../src/location.js';
import { captureWorkspaceSettings, switchAccountWorkspace } from '../src/account-workspace.js';
import { persistRestoredSnapshot, readBackupFile } from '../src/backup-storage.js';

const toronto = { id: '6167865', name: 'Toronto', region: 'Ontario', country: 'Canada', countryCode: 'CA', latitude: 43.65, longitude: -79.38, timezone: 'America/Toronto' };
const tokyo = { id: '1850147', name: 'Tokyo', region: 'Tokyo', country: 'Japan', countryCode: 'JP', latitude: 35.68, longitude: 139.69, timezone: 'Asia/Tokyo' };
class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); this.failWrite = false; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failWrite) throw Object.assign(new Error('Storage full'), { name: 'QuotaExceededError' }); this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  dump() { return Object.fromEntries(this.values); }
}
const empty = () => ({ version: 4, items: [], localSettings: {} });

test('legacy primary location becomes a watchlist without a write, while a saved empty list stays empty', () => {
  const storage = new MemoryStorage({ [LOCATION_KEY]: JSON.stringify(toronto) });
  const before = storage.dump();
  assert.deepEqual(readLocationWatchlist(storage), [toronto]);
  assert.deepEqual(storage.dump(), before);
  assert.deepEqual(saveLocationWatchlist(storage, []), []);
  assert.deepEqual(readLocationWatchlist(storage), []);
  assert.equal(storage.getItem(LOCATION_KEY), JSON.stringify(toronto));
  assert.deepEqual(readLocationWatchlist(new MemoryStorage()), []);
});

test('watchlist stores only planning fields and never changes the primary location', () => {
  const storage = new MemoryStorage({ [LOCATION_KEY]: JSON.stringify(toronto) });
  assert.deepEqual(saveLocationWatchlist(storage, [toronto, { ...tokyo, token: 'private-secret', homeAddress: 'private-address' }]), [toronto, tokyo]);
  assert.deepEqual(readLocationWatchlist(storage), [toronto, tokyo]);
  assert.ok(!storage.getItem(LOCATION_WATCHLIST_KEY).includes('private-'));
  assert.equal(storage.getItem(LOCATION_KEY), JSON.stringify(toronto));
});

test('validation rejects duplicate places, malformed cities and more than eight before any write', () => {
  const storage = new MemoryStorage(); saveLocationWatchlist(storage, [toronto]); const before = storage.dump();
  assert.equal(locationWatchKey(toronto), locationWatchKey({ ...toronto, id: 'another-provider-id', name: 'Toronto city' }));
  const eight = Array.from({ length: MAX_WATCHED_LOCATIONS }, (_, index) => ({ ...toronto, id: String(index), latitude: 43 + index / 10 }));
  assert.equal(normalizeLocationWatchlist(eight).length, 8);
  for (const invalid of [null, {}, [toronto, { ...toronto, id: 'other' }], [toronto, { ...tokyo, latitude: 91 }], [...eight, tokyo]]) {
    assert.throws(() => saveLocationWatchlist(storage, invalid));
    assert.deepEqual(storage.dump(), before);
  }
});

test('damaged watchlists and unavailable storage report an error without replacing data', () => {
  for (const raw of ['{broken', 'null', '[{}]', JSON.stringify([toronto, toronto])]) {
    const storage = new MemoryStorage({ [LOCATION_KEY]: JSON.stringify(toronto), [LOCATION_WATCHLIST_KEY]: raw }); const before = storage.dump();
    assert.throws(() => readLocationWatchlist(storage), /saved city watchlist could not be read/);
    assert.deepEqual(storage.dump(), before);
  }
  assert.throws(() => readLocationWatchlist({ getItem() { throw new Error('Denied'); } }), /could not be read/);
  const storage = new MemoryStorage(); saveLocationWatchlist(storage, [toronto]); const before = storage.dump(); storage.failWrite = true;
  assert.throws(() => saveLocationWatchlist(storage, [tokyo]), /Storage full/);
  assert.deepEqual(storage.dump(), before);
});

test('watchlists round-trip through complete backups and malformed imports fail before changing the plan', async () => {
  const storage = new MemoryStorage(); saveLocationWatchlist(storage, [toronto, tokyo]);
  const snapshot = { ...empty(), localSettings: captureWorkspaceSettings(storage) };
  assert.equal(snapshot.localSettings[LOCATION_WATCHLIST_KEY], JSON.stringify([toronto, tokyo]));
  const restored = new MemoryStorage(); persistRestoredSnapshot(restored, await readBackupFile(JSON.stringify(snapshot)));
  assert.deepEqual(readLocationWatchlist(restored), [toronto, tokyo]);
  const before = restored.dump();
  for (const raw of ['null', JSON.stringify([tokyo, tokyo]), JSON.stringify([{ ...tokyo, countryCode: 'invalid' }])]) {
    const bad = { ...empty(), localSettings: { [LOCATION_WATCHLIST_KEY]: raw } };
    await assert.rejects(readBackupFile(JSON.stringify(bad)), /Invalid saved setting/);
    assert.throws(() => persistRestoredSnapshot(restored, bad), /Invalid saved setting/);
    assert.deepEqual(restored.dump(), before);
  }
});

test('watchlists are isolated across owner accounts and guests and restored on return', () => {
  const storage = new MemoryStorage(); saveLocationWatchlist(storage, [toronto]);
  const switchTo = accountId => switchAccountWorkspace(storage, { accountId, currentSnapshot: empty(), emptySnapshot: empty() });
  switchTo('owner-a');
  switchTo('owner-b');
  assert.equal(storage.getItem(LOCATION_WATCHLIST_KEY), null);
  assert.deepEqual(readLocationWatchlist(storage), []);
  saveLocationWatchlist(storage, [tokyo]);
  switchTo(null);
  assert.deepEqual(readLocationWatchlist(storage), []);
  switchTo('owner-a');
  assert.deepEqual(readLocationWatchlist(storage), [toronto]);
  switchTo('owner-b');
  assert.deepEqual(readLocationWatchlist(storage), [tokyo]);
});
