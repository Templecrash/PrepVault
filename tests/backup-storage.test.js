import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup } from '../src/crypto-backup.js';
import { MAX_BACKUP_FILE_BYTES, persistRestoredSnapshot, readBackupFile, readStoredPlan } from '../src/backup-storage.js';
import { SNAPSHOT_ARRAYS } from '../src/storage.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); this.limit = Infinity; this.failOnceOn = null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failOnceOn === key) { this.failOnceOn = null; throw new Error('Storage unavailable'); }
    const next = new Map(this.values).set(key, String(value));
    if ([...next].reduce((sum, [name, text]) => sum + name.length + text.length, 0) > this.limit) throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
    this.values = next;
  }
  removeItem(key) { this.values.delete(key); }
  dump() { return Object.fromEntries(this.values); }
}

const savedAt = '2026-10-28T12:00:00.000Z';
const plan = (overrides = {}) => ({ version: 4, items: [], people: 2, dailyCalTarget: 1500, localSettings: {}, ...overrides });
const envelope = payload => ({ pcs: true, enc: 'AES-256-GCM', kdf: 'PBKDF2-SHA256-310K', payload });
const initialStorage = () => new MemoryStorage({
  'prepvault-db': JSON.stringify(plan({ people: 4 })),
  'prepvault-radio-log': '[{"text":"Old log"}]',
  'prepvault-radio-volume': '0.8',
  'prepvault-workspace-owner': '{"version":1,"accountId":"owner"}',
  'prepvault-account-workspace-user-owner': 'private account copy',
  'pcs-db': 'manual backup to keep',
});

test('stored plan reads distinguish a new workspace from a damaged copy without changing any bytes', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readStoredPlan(storage), { snapshot: null, error: '' });
  storage.setItem('prepvault-db', JSON.stringify(plan()));
  assert.deepEqual(readStoredPlan(storage), { snapshot: plan(), error: '' });
  for (const value of ['', '{', 'null', '{"items":null}', '{"items":[],"dailyCalTarget":false}']) {
    storage.setItem('prepvault-db', value);
    const before = storage.dump();
    const result = readStoredPlan(storage);
    assert.equal(result.snapshot, null);
    assert.match(result.error, /not been replaced/);
    assert.deepEqual(storage.dump(), before);
  }
  storage.setItem('recovery-copy', JSON.stringify({ version: 3, items: [] }));
  assert.deepEqual(readStoredPlan(storage, 'recovery-copy'), { snapshot: { version: 3, items: [] }, error: '' });
});

test('unavailable browser storage returns a recovery state instead of silently starting a fresh plan', () => {
  const storage = { getItem() { throw new Error('Denied'); } };
  assert.equal(readStoredPlan(storage).snapshot, null);
  assert.match(readStoredPlan(storage).error, /not been replaced/);
});

test('encrypted exports and plain legacy/full backups parse without touching storage', async () => {
  const snapshot = plan({ contacts: [{ id: 'person', name: 'Person', isDependant: true }], codes: [{ id: 'lock', value: 'Secret code' }] });
  const encrypted = JSON.stringify(envelope(await encryptBackup(snapshot, 'test-only-long-passphrase')));
  assert.deepEqual(await readBackupFile(encrypted, 'test-only-long-passphrase'), snapshot);
  assert.deepEqual(await readBackupFile(JSON.stringify(snapshot)), snapshot);
  assert.deepEqual(await readBackupFile('{"version":3,"items":[]}'), { version: 3, items: [] });
  assert.deepEqual(await readBackupFile('{"items":[]}'), { items: [] });
});

test('every saved household collection, image, route and planning setting survives an encrypted file restore', async () => {
  const collections = Object.fromEntries(SNAPSHOT_ARRAYS.map(key => [key, [{ id: `${key}-record`, notes: `Saved ${key}` }]]));
  const snapshot = plan({
    ...collections,
    items: [{ id: 'food1', category: 'food', subType: 'cannedGoods', name: 'Beans', quantity: 0, propertyId: 'prop1', fields: { calories: '200', servings: '2' } }],
    properties: [{ id: 'prop1', name: 'Home' }],
    contacts: [{ id: 'person1', name: 'Person', isDependant: true, allergies: 'Recorded allergy' }],
    codes: [{ id: 'lock1', name: 'Lock', value: 'Protected in the encrypted export' }],
    routes: [{ id: 'route1', propertyId: 'prop1', name: 'Evacuation route', origin: 'Home', destination: 'Rally point', travelMode: 'walking', notes: 'Alternate path' }],
    bugOutEntries: [{ id: 'grab1', name: 'Documents', quantity: '1 pouch', location: 'Hall', assignee: 'Person', notes: 'Emergency copy', grabbed: false }],
    mapSetups: { prop1: { name: 'Home map', address: 'Recorded address', image: { dataUrl: 'data:image/png;base64,aW1hZ2U=', width: 100, height: 100 }, pins: [{ id: 'pin1', layer: 'buildings', type: 'house', x: 1, y: 99, assignee: 'Person' }], savedAt } },
    propertyProfile: { completedAt: savedAt, heatSource: ['wood'], waterSource: ['well'] },
    climate: 'cold', activePropertyId: 'prop1', propAddress: 'Recorded address', demoData: false,
    localSettings: { 'prepvault-radio-log': '[{"text":"Recorded channel log"}]', 'prepvault-user-channels': '[]', 'prepvault-trap-status': '{"obstacle1":false}' },
  });
  const text = JSON.stringify(envelope(await encryptBackup(snapshot, 'complete-test-passphrase')));
  const decoded = await readBackupFile(text, 'complete-test-passphrase');
  const storage = new MemoryStorage();
  const restored = persistRestoredSnapshot(storage, decoded, { savedAt });
  for (const key of SNAPSHOT_ARRAYS) assert.deepEqual(restored[key], snapshot[key], key);
  assert.deepEqual(restored.mapSetups, snapshot.mapSetups);
  assert.deepEqual(restored.propertyProfile, snapshot.propertyProfile);
  assert.equal(restored.dailyCalTarget, 1500);
  assert.deepEqual(restored.localSettings, snapshot.localSettings);
  assert.deepEqual(JSON.parse(storage.getItem('prepvault-db')), restored);
});

test('file parser rejects unsupported wrappers and versions, missing passwords, corruption and malformed snapshots', async () => {
  const payload = await encryptBackup(plan(), 'correct-test-password');
  const wrapped = envelope(payload);
  for (const change of [{ pcs: 'true' }, { enc: 'AES-CBC' }, { kdf: 'PBKDF2-SHA256-1' }, { payload: {} }]) {
    await assert.rejects(readBackupFile(JSON.stringify({ ...wrapped, ...change }), 'correct-test-password'), { code: 'BACKUP_FORMAT' });
  }
  await assert.rejects(readBackupFile(JSON.stringify(wrapped)), { code: 'BACKUP_PASSWORD' });
  await assert.rejects(readBackupFile(JSON.stringify(wrapped), 'wrong-test-password'), { code: 'BACKUP_DECRYPT' });
  await assert.rejects(readBackupFile(JSON.stringify({ ...wrapped, payload: 'AAAA' }), 'correct-test-password'), { code: 'BACKUP_DECRYPT' });
  await assert.rejects(readBackupFile(JSON.stringify(plan({ version: 99 }))), { code: 'BACKUP_VERSION' });
  for (const text of ['{', 'null', '[]', '{}', '{"items":[null]}', '{"items":[],"dailyCalTarget":false}']) await assert.rejects(readBackupFile(text));
  const invalidData = JSON.stringify(envelope(await encryptBackup(null, 'correct-test-password')));
  await assert.rejects(readBackupFile(invalidData, 'correct-test-password'), /inventory/);
});

test('file parser bounds input before JSON parsing or key derivation', async () => {
  await assert.rejects(readBackupFile(' '.repeat(MAX_BACKUP_FILE_BYTES + 1)), { code: 'BACKUP_SIZE' });
  await assert.rejects(readBackupFile('é'.repeat(MAX_BACKUP_FILE_BYTES / 2 + 1)), { code: 'BACKUP_SIZE' });
});

test('full restore replaces settings, clears absent stale values and leaves auth, accounts and manual backup unchanged', () => {
  const storage = initialStorage();
  const before = storage.dump();
  const raw = plan({ localSettings: { 'prepvault-radio-volume': '0.3', 'prepvault-user-channels': '[]', 'prepvault-workspace-owner': 'attacker', 'pcs-db': 'replacement', 'prepvault-active-session': 'auth' } });
  const copy = structuredClone(raw);
  const result = persistRestoredSnapshot(storage, raw, { savedAt });
  assert.equal(storage.getItem('prepvault-radio-log'), null);
  assert.equal(storage.getItem('prepvault-radio-volume'), '0.3');
  assert.equal(storage.getItem('prepvault-user-channels'), '[]');
  assert.deepEqual(result.localSettings, { 'prepvault-radio-volume': '0.3', 'prepvault-user-channels': '[]' });
  for (const key of ['prepvault-workspace-owner', 'prepvault-account-workspace-user-owner', 'pcs-db']) assert.equal(storage.getItem(key), before[key]);
  assert.equal(storage.getItem('prepvault-active-session'), null);
  assert.deepEqual(JSON.parse(storage.getItem('prepvault-db')), result);
  assert.deepEqual(raw, copy);
  assert.equal(result.savedAt, savedAt);
  assert.equal([...storage.values.keys()].some(key => key.startsWith('prepvault-restore-preflight')), false);
});

test('core refresh keeps current settings and missing legacy settings clear on full restore', () => {
  const storage = initialStorage();
  const result = persistRestoredSnapshot(storage, { items: [], localSettings: { 'prepvault-radio-volume': '0.1' } }, { includeSettings: false, savedAt });
  assert.equal(result.localSettings['prepvault-radio-volume'], '0.8');
  assert.equal(storage.getItem('prepvault-radio-volume'), '0.8');
  assert.equal(storage.getItem('prepvault-radio-log'), '[{"text":"Old log"}]');
  persistRestoredSnapshot(storage, { version: 3, items: [] }, { savedAt });
  assert.equal(storage.getItem('prepvault-radio-log'), null);
  assert.equal(storage.getItem('prepvault-radio-volume'), null);
});

test('malformed input and quota preflight cannot change existing data', () => {
  const storage = initialStorage();
  const before = storage.dump();
  assert.throws(() => persistRestoredSnapshot(storage, { items: null }), /inventory/);
  assert.deepEqual(storage.dump(), before);
  storage.limit = [...storage.values].reduce((sum, [key, value]) => sum + key.length + value.length, 0) + 10;
  assert.throws(() => persistRestoredSnapshot(storage, plan(), { savedAt }), { code: 'BACKUP_PREFLIGHT' });
  assert.deepEqual(storage.dump(), before);
});

test('a write failure after preflight rolls back both the plan and all settings', () => {
  const storage = initialStorage();
  const before = storage.dump();
  storage.failOnceOn = 'prepvault-db';
  assert.throws(() => persistRestoredSnapshot(storage, plan({ localSettings: { 'prepvault-radio-volume': '0.1' } }), { savedAt }), { code: 'BACKUP_STORAGE' });
  assert.deepEqual(storage.dump(), before);
});
