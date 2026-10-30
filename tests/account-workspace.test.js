import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_WORKSPACE_PREFIX, WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY,
  accountWorkspaceKey, captureWorkspaceSettings, isWorkspaceSettingKey,
  readWorkspaceOwner, switchAccountWorkspace,
} from '../src/account-workspace.js';

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.limit = Infinity; this.failOnceOn = null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failOnceOn === key) { this.failOnceOn = null; throw new Error('Storage unavailable'); }
    const next = new Map(this.values).set(key, String(value));
    if ([...next].reduce((total, [name, text]) => total + name.length + text.length, 0) > this.limit) {
      throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
    }
    this.values = next;
  }
  removeItem(key) { this.values.delete(key); }
  dump() { return Object.fromEntries(this.values); }
}

const empty = {
  version: 4, items: [], people: 1, climate: 'cold', properties: [{ id: 'prop1', name: 'Home' }],
  contacts: [], routes: [], mapSetups: {}, bugOutEntries: [], propertyProfile: {}, demoData: false, localSettings: {},
};
const plan = (name = 'Owner plan') => ({
  ...structuredClone(empty),
  items: [{ id: 'food1', category: 'food', subType: 'canned', name, quantity: 2, fields: {} }],
  contacts: [{ id: 'person1', name: 'Household person', isDependant: true }],
  propertyProfile: { heatSource: ['wood'] },
  customFutureData: { retained: [1, 2] },
});
const readPlan = storage => JSON.parse(storage.getItem(WORKSPACE_DATA_KEY));
const switchTo = (storage, accountId, currentSnapshot = readPlan(storage)) => switchAccountWorkspace(storage, { accountId, currentSnapshot, emptySnapshot: empty });
const initialStorage = () => new MemoryStorage({ [WORKSPACE_DATA_KEY]: JSON.stringify(plan()) });

test('first verified account claims the existing unbound plan and feature settings', () => {
  const storage = initialStorage();
  const original = plan();
  storage.setItem('prepvault-radio-log', '[{"text":"Weather warning"}]');
  storage.setItem('prepvault-trap-status', '{"trap1":"checked"}');
  storage.setItem('prepvault-active-session', '{"legacy":"auth"}');
  storage.setItem('pcs-db', '{"enc":true,"payload":"encrypted-existing-backup"}');
  assert.equal(readWorkspaceOwner(storage), undefined);
  const result = switchTo(storage, 'neon-owner', original);
  assert.equal(result.claimedUnbound, true);
  assert.equal(result.changed, true);
  assert.equal(readWorkspaceOwner(storage), 'neon-owner');
  assert.equal(result.snapshot.items[0].name, 'Owner plan');
  assert.deepEqual(result.snapshot.contacts, original.contacts);
  assert.deepEqual(result.snapshot.propertyProfile, original.propertyProfile);
  assert.deepEqual(result.snapshot.customFutureData, original.customFutureData);
  assert.equal(result.snapshot.localSettings['prepvault-radio-log'], '[{"text":"Weather warning"}]');
  assert.equal(result.snapshot.localSettings['prepvault-active-session'], undefined);
  assert.equal(result.snapshot.localSettings['pcs-db'], undefined);
  assert.equal(storage.getItem('pcs-db'), '{"enc":true,"payload":"encrypted-existing-backup"}');
  assert.equal(JSON.parse(storage.getItem(accountWorkspaceKey('neon-owner'))).manualBackup, storage.getItem('pcs-db'));
  assert.equal(storage.getItem(accountWorkspaceKey(null)), null, 'claimed plan must not remain available to guests');
  assert.deepEqual(original, plan(), 'input is not mutated');
});

test('an initial signed-out session check preserves the unbound plan for first sign-in', () => {
  const storage = initialStorage();
  const before = storage.dump();
  const result = switchTo(storage, null);
  assert.equal(result.changed, false);
  assert.equal(readWorkspaceOwner(storage), undefined);
  assert.deepEqual(storage.dump(), before);
  assert.equal(switchTo(storage, 'first-owner').claimedUnbound, true);
});

test('new accounts start empty and returning accounts restore their latest full plan and settings', () => {
  const storage = initialStorage();
  switchTo(storage, 'account-a');
  storage.setItem('prepvault-radio-log', '[{"text":"A private log"}]');
  storage.setItem('prepvault-user-channels', '[{"id":"station-a"}]');
  storage.setItem('pv-weather-cache', '{"location":"A property"}');
  const a = plan('Unsaved latest A changes');
  a.bugOutEntries = [{ id: 'bug1', name: 'Grab bag', quantity: '1', location: 'Hall', assignee: '', notes: '', grabbed: true }];
  const bResult = switchTo(storage, 'account-b', a);
  assert.deepEqual(bResult.snapshot, empty);
  assert.deepEqual(readPlan(storage), empty);
  assert.equal(storage.getItem('prepvault-radio-log'), null);
  assert.equal(storage.getItem('prepvault-user-channels'), null);
  assert.equal(storage.getItem('pv-weather-cache'), null);
  storage.setItem('prepvault-radio-log', '[{"text":"B private log"}]');
  const b = plan('B food');
  const restoredA = switchTo(storage, 'account-a', b).snapshot;
  assert.equal(restoredA.items[0].name, 'Unsaved latest A changes');
  assert.deepEqual(restoredA.bugOutEntries, a.bugOutEntries);
  assert.equal(storage.getItem('prepvault-radio-log'), '[{"text":"A private log"}]');
  assert.equal(storage.getItem('pv-weather-cache'), '{"location":"A property"}');
  const restoredB = switchTo(storage, 'account-b').snapshot;
  assert.equal(restoredB.items[0].name, 'B food');
  assert.equal(storage.getItem('prepvault-radio-log'), '[{"text":"B private log"}]');
  assert.equal(storage.getItem('prepvault-user-channels'), null);
});

test('sign-out uses a separate guest workspace and never exposes the signed-out plan', () => {
  const storage = initialStorage();
  switchTo(storage, 'owner');
  storage.setItem('pcs-db', JSON.stringify({ payload: plan('Old manual cloud backup') }));
  storage.setItem('prepvault-dismissed-opps', '["owner-opportunity"]');
  const result = switchTo(storage, null);
  assert.equal(readWorkspaceOwner(storage), null);
  assert.deepEqual(result.snapshot, empty);
  assert.equal(storage.getItem('pcs-db'), null);
  assert.equal(storage.getItem('prepvault-dismissed-opps'), null);
  const guest = plan('Guest food');
  storage.setItem('prepvault-dismissed-opps', '["guest-opportunity"]');
  const owner = switchTo(storage, 'owner', guest).snapshot;
  assert.equal(owner.items[0].name, 'Owner plan');
  assert.equal(storage.getItem('prepvault-dismissed-opps'), '["owner-opportunity"]');
  assert.equal(storage.getItem('pcs-db'), JSON.stringify({ payload: plan('Old manual cloud backup') }));
  const restoredGuest = switchTo(storage, null).snapshot;
  assert.equal(restoredGuest.items[0].name, 'Guest food');
  assert.equal(storage.getItem('prepvault-dismissed-opps'), '["guest-opportunity"]');
  assert.equal(storage.getItem('pcs-db'), null);
  assert.equal(switchTo(storage, 'another-owner').snapshot.items.length, 0, 'later accounts do not claim the guest plan');
});

test('manual backups remain private per account and guest without becoming part of exported snapshots', () => {
  const storage = initialStorage();
  const aBackup = '{"enc":true,"payload":"A encrypted backup"}';
  const bBackup = '{"enc":false,"payload":{"items":[]}}';
  const guestBackup = '{"enc":true,"payload":"Guest encrypted backup"}';
  storage.setItem('pcs-db', aBackup);
  switchTo(storage, 'account-a');
  switchTo(storage, 'account-b');
  assert.equal(storage.getItem('pcs-db'), null);
  storage.setItem('pcs-db', bBackup);
  switchTo(storage, null);
  assert.equal(storage.getItem('pcs-db'), null);
  storage.setItem('pcs-db', guestBackup);
  const a = switchTo(storage, 'account-a');
  assert.equal(storage.getItem('pcs-db'), aBackup);
  assert.equal(a.snapshot.manualBackup, undefined);
  assert.equal(a.snapshot.localSettings['pcs-db'], undefined);
  switchTo(storage, 'account-b');
  assert.equal(storage.getItem('pcs-db'), bBackup);
  switchTo(storage, null);
  assert.equal(storage.getItem('pcs-db'), guestBackup);
  assert.deepEqual(captureWorkspaceSettings(storage), {});
});

test('a repeated session check retains current unsaved state and does not restore an older cache', () => {
  const storage = initialStorage();
  switchTo(storage, 'owner');
  const before = storage.dump();
  const result = switchTo(storage, 'owner', plan('Latest state'));
  assert.equal(result.changed, false);
  assert.equal(result.snapshot.items[0].name, 'Latest state');
  assert.deepEqual(storage.dump(), before);
});

test('settings use an explicit allowlist and cannot import identity, auth, chats or other account snapshots', () => {
  const storage = initialStorage();
  const excluded = [
    WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY, accountWorkspaceKey('other'), 'prepvault-active-session',
    'prepvault-local-accounts', 'prepvault-sync-baseline-owner', 'prepvault-secure-pin',
    'prepvault-chat-other', 'prepvault-chat-community-other', 'prepvault-new-auth-token',
    'sb-project-auth-token', 'pcs-db',
  ];
  for (const key of excluded) assert.equal(isWorkspaceSettingKey(key), false, key);
  for (const key of excluded.filter(key => ![WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY].includes(key))) storage.setItem(key, 'private');
  storage.setItem('prepvault-radio-volume', '0.3');
  assert.deepEqual(captureWorkspaceSettings(storage), { 'prepvault-radio-volume': '0.3' });
  const poisoned = { ...plan('Known account'), localSettings: Object.fromEntries(excluded.map(key => [key, 'poison'])) };
  poisoned.localSettings['prepvault-radio-log'] = '["Restored log"]';
  poisoned.localSettings['prepvault-radio-volume'] = 10;
  storage.setItem(accountWorkspaceKey('returning'), JSON.stringify({ version: 1, accountId: 'returning', snapshot: poisoned }));
  const result = switchTo(storage, 'returning');
  assert.deepEqual(result.snapshot.localSettings, { 'prepvault-radio-log': '["Restored log"]' });
  assert.equal(storage.getItem('prepvault-active-session'), 'private');
  assert.equal(storage.getItem(accountWorkspaceKey('other')), 'private');
  assert.equal(readWorkspaceOwner(storage), 'returning');
});

test('existing account cache wins over an unbound plan and missing newer fields get empty defaults', () => {
  const storage = initialStorage();
  storage.setItem(accountWorkspaceKey('owner'), JSON.stringify({ version: 1, accountId: 'owner', snapshot: { items: [], people: 3 } }));
  const result = switchTo(storage, 'owner');
  assert.equal(result.claimedUnbound, false);
  assert.equal(result.snapshot.people, 3);
  assert.deepEqual(result.snapshot.bugOutEntries, []);
  assert.deepEqual(result.snapshot.contacts, []);
});

test('corrupt identities or account caches fail closed without replacing any plan', () => {
  for (const marker of ['', 'not json', '{}', '{"version":1}', '{"version":1,"accountId":""}', '{"version":2,"accountId":null}']) {
    const storage = initialStorage();
    storage.setItem(WORKSPACE_OWNER_KEY, marker);
    const before = storage.dump();
    assert.throws(() => switchTo(storage, 'owner'), { code: 'WORKSPACE_INVALID' });
    assert.deepEqual(storage.dump(), before);
  }
  for (const cache of ['not json', '{}', JSON.stringify({ version: 1, accountId: 'wrong', snapshot: empty }), JSON.stringify({ version: 1, accountId: 'owner', snapshot: { items: null } })]) {
    const storage = initialStorage();
    storage.setItem(accountWorkspaceKey('owner'), cache);
    const before = storage.dump();
    assert.throws(() => switchTo(storage, 'owner'), { code: 'WORKSPACE_INVALID' });
    assert.deepEqual(storage.dump(), before);
  }
});

test('invalid IDs and malformed snapshots reject before storage changes', () => {
  const storage = initialStorage();
  const before = storage.dump();
  for (const accountId of [undefined, {}, 10, '', ' ', ' owner', 'a\n', 'x'.repeat(257), '\uD800']) {
    assert.throws(() => switchTo(storage, accountId), { code: 'WORKSPACE_ID' });
  }
  assert.throws(() => switchTo(storage, 'owner', { items: null }), { code: 'WORKSPACE_INVALID' });
  assert.deepEqual(storage.dump(), before);
  assert.notEqual(accountWorkspaceKey(null), accountWorkspaceKey('guest'));
  assert.notEqual(accountWorkspaceKey('a/b'), accountWorkspaceKey('a%2Fb'));
});

test('quota preflight leaves root data, owner, settings and caches byte-for-byte unchanged', () => {
  const storage = initialStorage();
  switchTo(storage, 'owner');
  storage.setItem('prepvault-radio-log', '["Keep this"]');
  const before = storage.dump();
  storage.limit = [...storage.values].reduce((total, [key, value]) => total + key.length + value.length, 0) + 5;
  assert.throws(() => switchTo(storage, 'other'), { code: 'WORKSPACE_PREFLIGHT' });
  assert.deepEqual(storage.dump(), before);
  assert.equal([...storage.values.keys()].some(key => key.startsWith(`${ACCOUNT_WORKSPACE_PREFIX}preflight`)), false);
});

test('an unexpected commit failure rolls back completed writes including cache and setting changes', () => {
  const storage = initialStorage();
  switchTo(storage, 'owner');
  storage.setItem('prepvault-radio-log', '["Keep this"]');
  storage.setItem('pcs-db', 'old backup');
  const before = storage.dump();
  storage.failOnceOn = WORKSPACE_OWNER_KEY;
  assert.throws(() => switchTo(storage, 'other'), { code: 'WORKSPACE_STORAGE' });
  assert.deepEqual(storage.dump(), before);
});
