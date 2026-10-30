import test from 'node:test';
import assert from 'node:assert/strict';
import { accountWorkspaceKey, captureWorkspaceSettings, readWorkspaceOwner, WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY, switchAccountWorkspace } from '../src/account-workspace.js';
import { CONVERSATION_NOTES_KEY, conversationLegacyKey, readConversationNotes } from '../src/conversation-notes.js';
import { captureWorkspaceBaseline } from '../src/workspace-persistence.js';
import { resetActivePlan, readPlanResetRecovery, restorePreviousPlan } from '../src/plan-reset.js';

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.reads = []; this.limit = Infinity; this.failOnceOn = null; this.failRemoveOnceOn = null; this.onSet = null; }
  getItem(key) { this.reads.push(key); return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failOnceOn) { this.failOnceOn = null; throw new Error('Storage unavailable'); }
    const next = new Map(this.values).set(key, String(value));
    if ([...next].reduce((total, [name, text]) => total + name.length + text.length, 0) > this.limit) throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
    this.values = next;
    this.onSet?.(key);
  }
  removeItem(key) {
    if (key === this.failRemoveOnceOn) { this.failRemoveOnceOn = null; throw new Error('Storage unavailable'); }
    this.values.delete(key);
  }
  dump() { return Object.fromEntries(this.values); }
}

const now = new Date('2026-10-29T16:00:00Z');
const empty = () => ({ version: 4, items: [], people: 1, climate: 'cold', properties: [{ id: 'prop1', name: 'Primary Residence', type: 'home', active: true }], propertyProfile: { heatSource: [], completedAt: null }, localSettings: {} });
const personal = () => ({
  ...empty(), people: 3, dailyCalTarget: 2500, climate: 'temperate', propAddress: 'Recorded address', activePropertyId: 'cabin', demoData: false,
  properties: [{ id: 'prop1', name: 'Home' }, { id: 'cabin', name: 'Cabin' }],
  items: [{ id: 'water', name: 'Water storage', category: 'water', subType: 'storedWater', quantity: 220, propertyId: 'prop1', fields: { custom: { nested: ['keep'] } } }],
  contacts: [{ id: 'person', name: 'Recorded person', isDependant: true }], members: [{ id: 'member', role: 'Recorded role' }],
  pins: [{ id: 'pin', label: 'Recorded marker' }], codes: [{ id: 'code', code: 'private' }], callSigns: [{ id: 'call' }], codeWords: [{ id: 'word' }], rallyPoints: [{ id: 'rally' }],
  gardenBeds: [{ id: 'bed' }], soilTests: [{ id: 'soil' }], compostBins: [{ id: 'compost' }], livestock: [{ id: 'animal' }], slaughterLog: [{ id: 'harvest' }], actionLog: [{ id: 'action' }],
  bugOutEntries: [{ id: 'grab', name: 'Grab bag', quantity: '1', location: 'Door', assignee: '', notes: '', grabbed: true }],
  routes: [{ id: 'route', propertyId: 'prop1', name: 'Route', origin: 'A', destination: 'B', travelMode: 'walking' }],
  mapSetups: {}, propertyProfile: { heatSource: ['wood'], specialNeeds: ['recorded'] }, customFuturePlan: { important: ['keep for undo'] },
});
const owner = 'owner-a';
const recoveryKey = `prepvault-plan-reset-recovery-user-${owner}`;
const privateKeys = {
  'pcs-db': 'existing encrypted manual snapshot',
  'prepvault-theme': 'dark',
  'auth-session': 'signed in',
  'prepvault-surveillance-session': 'provider-session',
  'prepvault-eyezon-connection': 'alarm-connection',
  'prepvault-tracking-session': 'tracking-session',
  [accountWorkspaceKey('owner-b')]: 'other private cache',
  'prepvault-plan-reset-recovery-user-owner-b': 'other private recovery',
};
const createStorage = () => new MemoryStorage({
  ...privateKeys,
  [WORKSPACE_OWNER_KEY]: JSON.stringify({ version: 1, accountId: owner }),
  [WORKSPACE_DATA_KEY]: JSON.stringify(personal()),
  [accountWorkspaceKey(owner)]: JSON.stringify({ version: 1, accountId: owner, snapshot: personal(), manualBackup: 'separate cached manual snapshot' }),
  'prepvault-calendar': JSON.stringify({ events: [{ id: 'task', title: 'Stored task', date: '2026-10-29', notes: '', done: false }], reviewed: [] }),
  'prepvault-radio-log': '[{"text":"Recorded weather note"}]',
  'prepvault-dismissed-opps': '["recorded-opportunity"]',
  'prepvault-workspace-open': '1',
  [conversationLegacyKey(owner)]: JSON.stringify([{ id: 'note', text: 'Own legacy planning note' }]),
});
const reset = (storage, overrides = {}) => resetActivePlan(storage, { emptySnapshot: empty(), currentSnapshot: personal(), expectedOwner: owner, baseline: captureWorkspaceBaseline(storage), now, ...overrides });

test('reset clears all planning collections and same-owner cache while preserving sign-in, services and manual snapshots', () => {
  const storage = createStorage();
  const before = storage.dump();
  const result = reset(storage);
  const plan = result.snapshot;
  for (const key of ['items', 'pins', 'members', 'contacts', 'codes', 'callSigns', 'codeWords', 'rallyPoints', 'gardenBeds', 'soilTests', 'compostBins', 'livestock', 'slaughterLog', 'actionLog', 'bugOutEntries', 'routes']) assert.deepEqual(plan[key], [], key);
  assert.deepEqual(plan.properties, empty().properties);
  assert.deepEqual(plan.propertyProfile, empty().propertyProfile);
  assert.deepEqual(plan.mapSetups, {});
  assert.equal(plan.propAddress, '');
  assert.equal(plan.people, 1);
  assert.equal(plan.dailyCalTarget, 2000);
  assert.equal(plan.climate, 'cold');
  assert.equal(plan.emergencyPlan, null);
  assert.equal(plan.demoData, false);
  assert.equal(plan.customFuturePlan, undefined);
  assert.deepEqual(captureWorkspaceSettings(storage), { [CONVERSATION_NOTES_KEY]: '[]' });
  assert.deepEqual(readConversationNotes(storage, owner), []);
  assert.equal(storage.getItem(conversationLegacyKey(owner)), before[conversationLegacyKey(owner)], 'legacy data is retained for safety but cannot resurface');
  const cached = JSON.parse(storage.getItem(accountWorkspaceKey(owner)));
  assert.deepEqual(cached.snapshot, plan);
  assert.equal(cached.manualBackup, 'separate cached manual snapshot');
  for (const [key, value] of Object.entries(privateKeys)) assert.equal(storage.getItem(key), value, key);
  assert.equal(storage.getItem(WORKSPACE_OWNER_KEY), before[WORKSPACE_OWNER_KEY]);
  assert.deepEqual(JSON.parse(storage.getItem(WORKSPACE_DATA_KEY)), plan);
  assert.deepEqual(result.baseline, captureWorkspaceBaseline(storage));
  assert.equal(result.recoveryCreatedAt, now.toISOString());
});

test('undo captures unsaved working data and restores settings, without reverting service sessions or manual backups', () => {
  const storage = createStorage();
  const working = personal(); working.items[0].quantity = 321;
  const before = structuredClone(working);
  reset(storage, { currentSnapshot: working });
  const recovery = readPlanResetRecovery(storage, { expectedOwner: owner });
  assert.equal(recovery.snapshot.items[0].quantity, 321);
  assert.equal(recovery.snapshot.localSettings[CONVERSATION_NOTES_KEY], storage.getItem(conversationLegacyKey(owner)));
  assert.equal(recovery.snapshot.customFuturePlan.important[0], 'keep for undo');
  storage.setItem('pcs-db', 'newer manual backup');
  storage.setItem('prepvault-eyezon-connection', 'renewed provider connection');
  storage.setItem('prepvault-radio-volume', '0.8');
  const restored = restorePreviousPlan(storage, { expectedOwner: owner, baseline: captureWorkspaceBaseline(storage), now });
  assert.deepEqual(restored.snapshot.items, working.items);
  assert.deepEqual(restored.snapshot.contacts, working.contacts);
  assert.equal(restored.snapshot.climate, 'temperate');
  assert.equal(storage.getItem('prepvault-calendar'), recovery.snapshot.localSettings['prepvault-calendar']);
  assert.equal(storage.getItem('prepvault-radio-volume'), null);
  assert.equal(storage.getItem('pcs-db'), 'newer manual backup');
  assert.equal(storage.getItem('prepvault-eyezon-connection'), 'renewed provider connection');
  assert.equal(readPlanResetRecovery(storage, { expectedOwner: owner }), null);
  assert.deepEqual(working, before);
  assert.equal(JSON.parse(storage.getItem(accountWorkspaceKey(owner))).snapshot.items[0].quantity, 321);
});

test('repeating an empty reset preserves the useful previous plan despite autosave metadata and empty view settings', () => {
  const storage = createStorage();
  const first = reset(storage);
  const originalRecovery = storage.getItem(recoveryKey);
  storage.setItem('prepvault-workspace-open', '1');
  storage.setItem('prepvault-dismissed-opps', '[]');
  storage.setItem('prepvault-calendar', '{"events":[],"reviewed":[]}');
  const current = { ...first.snapshot, timestamp: '2026-10-29T16:15:00Z', meta: { categories: 26, properties: 1 } };
  const repeated = reset(storage, { currentSnapshot: current, now: new Date('2026-10-29T16:20:00Z') });
  assert.equal(storage.getItem(recoveryKey), originalRecovery);
  assert.equal(repeated.recoveryCreatedAt, first.recoveryCreatedAt);
  const restored = restorePreviousPlan(storage, { expectedOwner: owner, now });
  assert.deepEqual(restored.snapshot.items, personal().items);
  assert.deepEqual(restored.snapshot.contacts, personal().contacts);
});

test('a new planning record after reset still becomes the next undo copy', () => {
  const storage = createStorage();
  const first = reset(storage);
  const current = structuredClone(first.snapshot);
  current.contacts = [{ id: 'new-person', name: 'New household', isDependant: true }];
  reset(storage, { currentSnapshot: current, now: new Date('2026-10-29T16:20:00Z') });
  const recovery = readPlanResetRecovery(storage, { expectedOwner: owner });
  assert.deepEqual(recovery.snapshot.contacts, current.contacts);
  assert.deepEqual(recovery.snapshot.items, []);
  assert.equal(recovery.createdAt, '2026-10-29T16:20:00.000Z');
});

test('recovery stays outside exports and is inaccessible through a different active account', () => {
  const storage = createStorage(); reset(storage);
  assert.equal(Object.hasOwn(captureWorkspaceSettings(storage), recoveryKey), false);
  storage.setItem(WORKSPACE_OWNER_KEY, JSON.stringify({ version: 1, accountId: 'owner-b' }));
  storage.reads = [];
  assert.throws(() => readPlanResetRecovery(storage, { expectedOwner: owner }), { code: 'PLAN_RESET_OWNER' });
  assert.equal(storage.reads.includes(recoveryKey), false);
  const before = storage.dump();
  assert.throws(() => restorePreviousPlan(storage, { expectedOwner: owner }), { code: 'PLAN_RESET_OWNER' });
  assert.deepEqual(storage.dump(), before);
});

test('reset cache prevents an old plan resurfacing after a normal account round trip', () => {
  const storage = createStorage();
  storage.values.delete(accountWorkspaceKey('owner-b'));
  const result = reset(storage);
  switchAccountWorkspace(storage, { accountId: 'owner-b', currentSnapshot: result.snapshot, emptySnapshot: empty() });
  const returned = switchAccountWorkspace(storage, { accountId: owner, currentSnapshot: empty(), emptySnapshot: empty() });
  assert.deepEqual(returned.snapshot.items, []);
  assert.deepEqual(returned.snapshot.contacts, []);
  assert.equal(readPlanResetRecovery(storage, { expectedOwner: owner }).snapshot.items.length, 1);
});

test('unbound and guest resets remain separate and never create or claim an owner', () => {
  const storage = new MemoryStorage({ [WORKSPACE_DATA_KEY]: JSON.stringify(personal()), 'pcs-db': 'manual' });
  const result = reset(storage, { expectedOwner: undefined });
  assert.equal(readWorkspaceOwner(storage), undefined);
  assert.equal(storage.getItem(accountWorkspaceKey(null)), null);
  assert.equal(readPlanResetRecovery(storage, { expectedOwner: undefined }).snapshot.items.length, 1);
  assert.equal(storage.getItem('pcs-db'), 'manual');
  storage.setItem(WORKSPACE_OWNER_KEY, JSON.stringify({ version: 1, accountId: null }));
  assert.equal(readPlanResetRecovery(storage, { expectedOwner: null }), null);
  reset(storage, { expectedOwner: null, currentSnapshot: result.snapshot });
  assert.equal(readWorkspaceOwner(storage), null);
  assert.equal(readPlanResetRecovery(storage, { expectedOwner: null }).snapshot.items.length, 0);
  assert.ok(storage.getItem('prepvault-plan-reset-recovery-unbound'));
});

test('stale baselines, invalid owners and nonempty reset templates fail before changes', () => {
  const storage = createStorage();
  const stale = captureWorkspaceBaseline(storage);
  const newer = personal(); newer.items[0].quantity = 999;
  storage.setItem(WORKSPACE_DATA_KEY, JSON.stringify(newer));
  const before = storage.dump();
  assert.throws(() => reset(storage, { baseline: stale }), { code: 'WORKSPACE_CONFLICT' });
  assert.throws(() => reset(storage, { expectedOwner: 'someone-else' }), { code: 'PLAN_RESET_OWNER' });
  assert.throws(() => resetActivePlan(storage, { emptySnapshot: empty(), currentSnapshot: personal() }), { code: 'PLAN_RESET_OWNER' });
  assert.throws(() => reset(storage, { emptySnapshot: personal() }), { code: 'PLAN_RESET_INVALID' });
  assert.throws(() => reset(storage, { currentSnapshot: { items: null } }), { code: 'PLAN_RESET_INVALID' });
  assert.deepEqual(storage.dump(), before);
});

test('quota preflight and commit failures retain every byte, including an older recovery', () => {
  for (const failureMode of ['quota', 'commit']) {
    const storage = createStorage();
    storage.setItem(recoveryKey, 'older recovery bytes');
    const before = storage.dump();
    if (failureMode === 'quota') storage.limit = [...storage.values].reduce((sum, [key, value]) => sum + key.length + value.length, 0) + 5;
    else storage.failOnceOn = WORKSPACE_DATA_KEY;
    assert.throws(() => reset(storage), { code: failureMode === 'quota' ? 'PLAN_RESET_PREFLIGHT' : 'PLAN_RESET_STORAGE' });
    assert.deepEqual(storage.dump(), before);
  }
});

test('failed undo keeps the cleared plan and its valid recovery available to retry', () => {
  const storage = createStorage(); reset(storage);
  const before = storage.dump();
  storage.failRemoveOnceOn = recoveryKey;
  assert.throws(() => restorePreviousPlan(storage, { expectedOwner: owner, now }), { code: 'PLAN_RESET_STORAGE' });
  assert.deepEqual(storage.dump(), before);
  assert.equal(readPlanResetRecovery(storage, { expectedOwner: owner }).snapshot.items.length, 1);
});

test('a plan or account change during quota preflight is never overwritten', () => {
  for (const kind of ['plan', 'owner']) {
    const storage = createStorage();
    const newer = personal(); newer.items[0].quantity = 888;
    storage.onSet = key => {
      if (!key.includes('preflight')) return;
      storage.onSet = null;
      storage.values.set(kind === 'plan' ? WORKSPACE_DATA_KEY : WORKSPACE_OWNER_KEY, JSON.stringify(kind === 'plan' ? newer : { version: 1, accountId: 'owner-b' }));
    };
    assert.throws(() => reset(storage), { code: kind === 'plan' ? 'WORKSPACE_CONFLICT' : 'PLAN_RESET_OWNER' });
    assert.equal(storage.getItem(recoveryKey), null);
    if (kind === 'plan') assert.equal(JSON.parse(storage.getItem(WORKSPACE_DATA_KEY)).items[0].quantity, 888);
    else assert.equal(readWorkspaceOwner(storage), 'owner-b');
    assert.equal(storage.getItem('prepvault-radio-log'), '[{"text":"Recorded weather note"}]');
  }
});

test('corrupt own recovery/cache or owner markers fail closed without scanning other accounts', () => {
  for (const kind of ['recovery', 'cache', 'owner']) {
    const storage = createStorage();
    const key = kind === 'recovery' ? recoveryKey : kind === 'cache' ? accountWorkspaceKey(owner) : WORKSPACE_OWNER_KEY;
    storage.setItem(key, '{');
    const before = storage.dump();
    storage.reads = [];
    assert.throws(() => kind === 'recovery' ? restorePreviousPlan(storage, { expectedOwner: owner }) : reset(storage));
    assert.deepEqual(storage.dump(), before);
    assert.equal(storage.reads.includes(accountWorkspaceKey('owner-b')), false);
    assert.equal(storage.reads.includes('prepvault-plan-reset-recovery-user-owner-b'), false);
  }
});
