import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY } from '../src/account-workspace.js';
import { captureWorkspaceBaseline, persistWorkspaceSnapshot, workspaceBaselineStatus } from '../src/workspace-persistence.js';

const owner = accountId => JSON.stringify({ version: 1, accountId });
const item = (id, quantity = 2) => ({ id, name: id, category: 'food', subType: 'canned', quantity, fields: {}, propertyId: 'prop1' });
const plan = (items = []) => ({ version: 4, items, properties: [{ id: 'prop1', name: 'Home' }], localSettings: {} });
class MemoryStorage {
  constructor(snapshot = plan(), accountId = 'owner-a') {
    this.values = new Map([[WORKSPACE_DATA_KEY, JSON.stringify(snapshot)], [WORKSPACE_OWNER_KEY, owner(accountId)]]);
    this.reads = []; this.writes = []; this.failWrite = false;
  }
  getItem(key) { this.reads.push(key); return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failWrite) throw Object.assign(new Error('Storage full'), { name: 'QuotaExceededError' });
    this.writes.push(key); this.values.set(key, String(value));
  }
  raw() { return this.values.get(WORKSPACE_DATA_KEY); }
}

test('baseline captures only the current plan and owner and normal autosaves advance it', () => {
  const storage = new MemoryStorage();
  const first = captureWorkspaceBaseline(storage);
  assert.deepEqual(storage.reads, [WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY]);
  assert.equal(workspaceBaselineStatus(storage, first), 'same');
  const second = persistWorkspaceSnapshot(storage, first, plan([item('water')]));
  assert.equal(workspaceBaselineStatus(storage, second), 'same');
  assert.equal(JSON.parse(storage.raw()).items.length, 1);
  assert.notEqual(second.planRaw, first.planRaw);
  assert.equal(second.ownerRaw, first.ownerRaw);
  const third = persistWorkspaceSnapshot(storage, second, { ...plan([item('water'), item('food')]), savedAt: '2026-10-28T20:00:00Z' });
  assert.equal(workspaceBaselineStatus(storage, third), 'same');
  assert.equal(JSON.parse(storage.raw()).items.length, 2);
  const writes = storage.writes.length;
  assert.equal(persistWorkspaceSnapshot(storage, third, JSON.parse(third.planRaw)), third);
  assert.equal(storage.writes.length, writes, 'same serialized data is a no-op');
});

test('a stale empty tab cannot overwrite supplies saved by another same-account tab', () => {
  const storage = new MemoryStorage();
  const staleTab = captureWorkspaceBaseline(storage);
  const newerTab = captureWorkspaceBaseline(storage);
  persistWorkspaceSnapshot(storage, newerTab, plan([item('drums'), item('tractor'), item('food')]));
  const saved = storage.raw(); const writes = storage.writes.length;
  assert.equal(workspaceBaselineStatus(storage, staleTab), 'plan-changed');
  for (const snapshot of [plan(), { ...plan(), activePropertyId: 'all' }, { ...plan(), savedAt: '2026-10-28T21:00:00Z' }]) {
    assert.throws(() => persistWorkspaceSnapshot(storage, staleTab, snapshot), { code: 'WORKSPACE_CONFLICT' });
    assert.equal(storage.raw(), saved);
    assert.equal(storage.writes.length, writes);
  }
});

test('stale populated tabs cannot undo newer quantities or deletions', () => {
  const storage = new MemoryStorage(plan([item('food'), item('removed')]));
  const stale = captureWorkspaceBaseline(storage);
  const current = persistWorkspaceSnapshot(storage, stale, plan([item('food', 8)]));
  assert.throws(() => persistWorkspaceSnapshot(storage, stale, plan([item('food'), item('removed')])), { code: 'WORKSPACE_CONFLICT' });
  assert.equal(storage.raw(), current.planRaw);
});

test('owner changes reject writes even when the plan bytes are unchanged', () => {
  const storage = new MemoryStorage(plan([item('food')]));
  const baseline = captureWorkspaceBaseline(storage);
  storage.setItem(WORKSPACE_OWNER_KEY, owner('owner-b'));
  const before = storage.raw(); const writes = storage.writes.length;
  assert.equal(workspaceBaselineStatus(storage, baseline), 'owner-changed');
  assert.throws(() => persistWorkspaceSnapshot(storage, baseline, plan()), { code: 'WORKSPACE_OWNER_CHANGED' });
  assert.equal(storage.raw(), before); assert.equal(storage.writes.length, writes);
});

test('an intentional reload or restore can explicitly rebase without reading other accounts', () => {
  const storage = new MemoryStorage();
  const old = captureWorkspaceBaseline(storage);
  const restored = plan([item('restored')]);
  storage.setItem(WORKSPACE_DATA_KEY, JSON.stringify(restored));
  assert.throws(() => persistWorkspaceSnapshot(storage, old, plan()), { code: 'WORKSPACE_CONFLICT' });
  storage.reads = [];
  const rebased = captureWorkspaceBaseline(storage);
  assert.deepEqual(storage.reads, [WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY]);
  const saved = persistWorkspaceSnapshot(storage, rebased, { ...restored, activePropertyId: 'all' });
  assert.equal(JSON.parse(saved.planRaw).items[0].id, 'restored');
});

test('damaged saved data, malformed baselines and invalid outgoing snapshots fail without writes', () => {
  for (const [key, raw] of [[WORKSPACE_DATA_KEY, '{broken'], [WORKSPACE_OWNER_KEY, '{}'], [WORKSPACE_DATA_KEY, '{"items":null}']]) {
    const storage = new MemoryStorage(); storage.values.set(key, raw);
    assert.throws(() => captureWorkspaceBaseline(storage), { code: 'WORKSPACE_INVALID' });
    assert.equal(storage.writes.length, 0);
  }
  const storage = new MemoryStorage(plan([item('food')]));
  const baseline = captureWorkspaceBaseline(storage); const before = storage.raw();
  assert.throws(() => persistWorkspaceSnapshot(storage, baseline, { items: [item('food', -1)] }), { code: 'WORKSPACE_INVALID' });
  assert.throws(() => persistWorkspaceSnapshot(storage, {}, plan()), { code: 'WORKSPACE_BASELINE' });
  assert.equal(storage.raw(), before); assert.equal(storage.writes.length, 0);
});

test('storage failures preserve the baseline and allow a later deliberate retry', () => {
  const storage = new MemoryStorage(); const baseline = captureWorkspaceBaseline(storage);
  storage.failWrite = true;
  assert.throws(() => persistWorkspaceSnapshot(storage, baseline, plan([item('food')])), { code: 'WORKSPACE_STORAGE' });
  assert.equal(storage.raw(), baseline.planRaw);
  storage.failWrite = false;
  assert.equal(JSON.parse(persistWorkspaceSnapshot(storage, baseline, plan([item('food')])).planRaw).items.length, 1);
  assert.throws(() => captureWorkspaceBaseline({ getItem() { throw new Error('Denied'); } }), { code: 'WORKSPACE_STORAGE' });
});

test('a genuinely new unbound device can save without creating or claiming an owner', () => {
  const storage = new MemoryStorage(); storage.values.clear();
  const baseline = captureWorkspaceBaseline(storage);
  assert.deepEqual(baseline, { planRaw: null, ownerRaw: null });
  const saved = persistWorkspaceSnapshot(storage, baseline, plan([item('food')]));
  assert.equal(saved.ownerRaw, null);
  assert.equal(storage.values.has(WORKSPACE_OWNER_KEY), false);
  assert.deepEqual(storage.writes, [WORKSPACE_DATA_KEY]);
});

test('autosave timestamps alone neither invalidate a tab nor trigger another write', () => {
  const contents = plan([item('food')]);
  const storage = new MemoryStorage({ ...contents, savedAt: '2026-10-28T20:00:00Z' });
  const baseline = captureWorkspaceBaseline(storage);
  storage.setItem(WORKSPACE_DATA_KEY, JSON.stringify({ ...contents, timestamp: '2026-10-28T20:01:00Z', savedAt: '2026-10-28T20:01:00Z' }));
  const current = storage.raw(); const writes = storage.writes.length;
  assert.equal(workspaceBaselineStatus(storage, baseline), 'same');
  const refreshed = persistWorkspaceSnapshot(storage, baseline, { ...contents, savedAt: '2026-10-28T20:02:00Z' });
  assert.equal(refreshed.planRaw, current);
  assert.equal(storage.raw(), current);
  assert.equal(storage.writes.length, writes);
  const noChange = persistWorkspaceSnapshot(storage, refreshed, { localSettings: {}, properties: contents.properties, items: contents.items, version: 4, timestamp: '2026-10-28T20:03:00Z' });
  assert.equal(noChange, refreshed, 'field ordering and a later autosave timestamp do not create a write');
  assert.equal(storage.writes.length, writes);
});

test('only top-level timestamps are ignored; items, settings, versions and nested timestamps remain guarded', () => {
  const contents = plan([item('food')]);
  for (const changed of [
    { ...contents, items: [item('food', 8)] },
    { ...contents, localSettings: { 'prepvault-location-watchlist': '[]' } },
    { ...contents, version: 3 },
    { ...contents, items: [{ ...item('food'), fields: { savedAt: 'changed' } }] },
    { ...contents, propertyProfile: { timestamp: 'changed' } },
  ]) {
    const storage = new MemoryStorage(contents); const baseline = captureWorkspaceBaseline(storage);
    storage.setItem(WORKSPACE_DATA_KEY, JSON.stringify(changed));
    const before = storage.raw(); const writes = storage.writes.length;
    assert.equal(workspaceBaselineStatus(storage, baseline), 'plan-changed');
    assert.throws(() => persistWorkspaceSnapshot(storage, baseline, changed), { code: 'WORKSPACE_CONFLICT' }, 'matching a newer plan does not authorize a stale baseline refresh');
    assert.equal(storage.raw(), before); assert.equal(storage.writes.length, writes);
  }
});

test('new malformed saved data fails closed even when its owner has not changed', () => {
  const storage = new MemoryStorage(plan([item('food')])); const baseline = captureWorkspaceBaseline(storage);
  storage.setItem(WORKSPACE_DATA_KEY, '{broken');
  assert.throws(() => workspaceBaselineStatus(storage, baseline), { code: 'WORKSPACE_INVALID' });
  assert.throws(() => persistWorkspaceSnapshot(storage, baseline, plan()), { code: 'WORKSPACE_INVALID' });
  assert.equal(storage.raw(), '{broken');
});
