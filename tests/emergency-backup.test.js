import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot } from '../src/storage.js';
import { encryptBackup } from '../src/crypto-backup.js';
import { persistRestoredSnapshot, readBackupFile, readStoredPlan } from '../src/backup-storage.js';
import { accountWorkspaceKey, switchAccountWorkspace } from '../src/account-workspace.js';
import { buildEmergencyCalendarEvents, createEmergencyPlan, emergencyDateKey, toggleEmergencyEvent } from '../src/emergency-plan.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  dump() { return Object.fromEntries(this.values); }
}

const now = new Date('2026-10-28T16:00:00.000Z');
const today = emergencyDateKey(now);
const initialPlan = () => createEmergencyPlan({ propertyId: 'home', scenarioId: 'power', horizonDays: 7, dailyCalTarget: 2200, waterGalPerPerson: 1.5, mealTimes: ['07:30', '12:30', '18:30'], checkInTimes: ['09:30', '20:30'] }, now);
const stock = [{ id: 'water1', category: 'water', subType: 'storedWater', name: 'Stored water', quantity: 4, propertyId: 'home', fields: { capacity: '5' } }];
const snapshot = emergencyPlan => ({ version: 4, items: structuredClone(stock), emergencyPlan, localSettings: {} });

test('legacy backups keep the absence of emergency mode and accept an explicitly inactive null plan', () => {
  assert.deepEqual(validateSnapshot({ version: 3, items: [] }), { version: 3, items: [] });
  assert.deepEqual(validateSnapshot({ version: 4, items: [], emergencyPlan: null }), { version: 4, items: [], emergencyPlan: null });
});

test('emergency settings and completed schedule entries survive encrypted backup and restore without using stock', async () => {
  const active = toggleEmergencyEvent(initialPlan(), `${today}:breakfast`, now);
  const original = snapshot(active);
  const copy = structuredClone(original);
  const encrypted = await encryptBackup(original, 'emergency-backup-test-passphrase');
  const decoded = await readBackupFile(JSON.stringify({ pcs: true, enc: 'AES-256-GCM', kdf: 'PBKDF2-SHA256-310K', payload: encrypted }), 'emergency-backup-test-passphrase');
  const storage = new MemoryStorage();
  const restored = persistRestoredSnapshot(storage, decoded, { savedAt: now.toISOString() });
  assert.deepEqual(restored.emergencyPlan, active);
  assert.deepEqual(restored.items, stock);
  assert.deepEqual(original, copy, 'export and restoration must not mutate the original plan');
  assert.deepEqual(readStoredPlan(storage).snapshot, restored);
  const events = buildEmergencyCalendarEvents({ plan: restored.emergencyPlan, items: restored.items, now });
  assert.equal(events.length, 42);
  assert.equal(events.find(event => event.key === `${today}:breakfast`).done, true);
  assert.equal(events.find(event => event.key === `${today}:breakfast`).time, '07:30');
  assert.equal(events.filter(event => event.done).length, 1);
  assert.deepEqual(restored.items, stock, 'rebuilding the calendar must not deduct inventory');
});

test('malformed emergency settings are rejected before a backup can change any existing data', async () => {
  const invalidPlans = [true, [], {}, { ...initialPlan(), active: 'true' }, { ...initialPlan(), horizonDays: 91 }, { ...initialPlan(), mealTimes: ['25:00', '12:00', '18:00'] }, { ...initialPlan(), completed: { [`${today}:unknown-task`]: now.toISOString() } }];
  const storage = new MemoryStorage({ 'prepvault-db': JSON.stringify(snapshot(initialPlan())), 'prepvault-radio-volume': '0.8' });
  const before = storage.dump();
  for (const emergencyPlan of invalidPlans) {
    const invalid = snapshot(emergencyPlan);
    assert.throws(() => validateSnapshot(invalid), /emergency plan/i);
    await assert.rejects(readBackupFile(JSON.stringify(invalid)), /emergency plan/i);
    assert.throws(() => persistRestoredSnapshot(storage, invalid), /emergency plan/i);
    assert.deepEqual(storage.dump(), before);
  }
});

test('a corrupt saved emergency plan enters recovery without resetting or replacing its bytes', () => {
  const raw = JSON.stringify(snapshot({ ...initialPlan(), horizonDays: -1 }));
  const storage = new MemoryStorage({ 'prepvault-db': raw });
  const result = readStoredPlan(storage);
  assert.equal(result.snapshot, null);
  assert.match(result.error, /not been replaced/);
  assert.equal(storage.getItem('prepvault-db'), raw);
});

test('emergency mode belongs to its account and does not carry across sign-out or another account', () => {
  const active = snapshot(toggleEmergencyEvent(initialPlan(), `${today}:water`, now));
  const empty = { version: 4, items: [], emergencyPlan: null, localSettings: {} };
  const storage = new MemoryStorage({ 'prepvault-workspace-owner': JSON.stringify({ version: 1, accountId: 'owner-a' }), 'prepvault-db': JSON.stringify(active) });
  const guest = switchAccountWorkspace(storage, { accountId: null, currentSnapshot: active, emptySnapshot: empty });
  assert.equal(guest.snapshot.emergencyPlan, null);
  assert.deepEqual(guest.snapshot.items, []);
  assert.deepEqual(JSON.parse(storage.getItem(accountWorkspaceKey('owner-a'))).snapshot.emergencyPlan, active.emergencyPlan);
  const second = switchAccountWorkspace(storage, { accountId: 'owner-b', currentSnapshot: guest.snapshot, emptySnapshot: empty });
  assert.equal(second.snapshot.emergencyPlan, null);
  const first = switchAccountWorkspace(storage, { accountId: 'owner-a', currentSnapshot: second.snapshot, emptySnapshot: empty });
  assert.deepEqual(first.snapshot.emergencyPlan, active.emergencyPlan);
  assert.deepEqual(first.snapshot.items, stock);
});
