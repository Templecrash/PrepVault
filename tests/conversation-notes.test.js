import test from 'node:test';
import assert from 'node:assert/strict';
import { CONVERSATION_NOTES_KEY, captureConversationNotes, conversationLegacyKey, normalizeConversationNotesSetting, readConversationNotes, validateConversationNotes } from '../src/conversation-notes.js';
import { accountWorkspaceKey, captureWorkspaceSettings, isWorkspaceSettingKey, switchAccountWorkspace, WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY } from '../src/account-workspace.js';
import { encryptBackup, decryptBackup } from '../src/crypto-backup.js';

class Storage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); this.reads = []; }
  getItem(key) { this.reads.push(key); return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  dump() { return Object.fromEntries(this.values); }
}
const note = text => ({ id: `note-${text}`, from: 'p1', text, ts: '9:00 AM' });
const empty = { version: 4, items: [], people: 1, properties: [{ id: 'prop1', name: 'Home' }], localSettings: {} };
const change = (storage, accountId) => switchAccountWorkspace(storage, { accountId, currentSnapshot: JSON.parse(storage.getItem(WORKSPACE_DATA_KEY) || JSON.stringify(empty)), emptySnapshot: empty });

test('capture reads only the current user legacy key before migration', () => {
  const storage = new Storage({ 'prepvault-chat-owner-a': JSON.stringify([note('A')]), 'prepvault-chat-owner-b': JSON.stringify([note('B')]), 'prepvault-chat-guest': JSON.stringify([note('Guest')]) });
  assert.deepEqual(JSON.parse(captureConversationNotes(storage, 'owner-a')), [note('A')]);
  assert.deepEqual(storage.reads, [CONVERSATION_NOTES_KEY, 'prepvault-chat-owner-a']);
  assert.deepEqual(readConversationNotes(storage), [note('Guest')]);
  assert.throws(() => conversationLegacyKey('../invalid\u0000id'));
});

test('explicit scoped empty notes suppress legacy resurrection after restore', () => {
  const storage = new Storage({ [CONVERSATION_NOTES_KEY]: '[]', 'prepvault-chat-owner': JSON.stringify([note('Old')]) });
  assert.equal(captureConversationNotes(storage, 'owner'), '[]');
  assert.deepEqual(storage.reads, [CONVERSATION_NOTES_KEY]);
});

test('notes allow only bounded display fields and local raster images', () => {
  const input = { ...note('Remember water'), image: 'data:image/png;base64,iVBORw==', token: 'not-a-note-field', pin: '1234', nested: { password: 'never-export' } };
  assert.deepEqual(validateConversationNotes([input]), [{ ...note('Remember water'), image: input.image }]);
  assert.equal(input.pin, '1234', 'validation does not mutate the source');
  for (const image of ['https://example.test/picture.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,abc', 'data:image/png;base64,!!!!']) assert.throws(() => validateConversationNotes([{ ...note('Image'), image }]));
});

test('malformed, duplicate or oversized notes fail visibly without modifying storage', () => {
  for (const invalid of ['not JSON', '{}', JSON.stringify([{ ...note('bad'), text: 123 }]), JSON.stringify([note('same'), note('same')]), JSON.stringify(Array.from({ length: 101 }, (_, index) => note(String(index)))), JSON.stringify([{ ...note('large'), text: 'x'.repeat(10001) }])]) {
    const storage = new Storage({ [CONVERSATION_NOTES_KEY]: invalid });
    const before = storage.dump();
    assert.throws(() => captureConversationNotes(storage, 'owner'));
    assert.deepEqual(storage.dump(), before);
  }
  assert.throws(() => normalizeConversationNotesSetting('[]'.repeat(5 * 1024 * 1024)));
});

test('scoped notes join workspace backups but PINs and other users legacy keys do not', () => {
  const storage = new Storage({ [CONVERSATION_NOTES_KEY]: JSON.stringify([note('Mine')]), 'prepvault-secure-pin': 'hash', 'prepvault-chat-other': JSON.stringify([note('Theirs')]) });
  assert.equal(isWorkspaceSettingKey(CONVERSATION_NOTES_KEY), true);
  assert.deepEqual(captureWorkspaceSettings(storage), { [CONVERSATION_NOTES_KEY]: JSON.stringify([note('Mine')]) });
});

test('switching accounts migrates only each owner legacy notes and preserves separate guest notes', () => {
  const storage = new Storage({ [WORKSPACE_DATA_KEY]: JSON.stringify(empty), [WORKSPACE_OWNER_KEY]: JSON.stringify({ version: 1, accountId: 'a' }), 'prepvault-chat-a': JSON.stringify([note('A')]), 'prepvault-chat-b': JSON.stringify([note('B')]), 'prepvault-chat-guest': JSON.stringify([note('Guest')]) });
  change(storage, 'b');
  assert.deepEqual(readConversationNotes(storage, 'b'), [note('B')]);
  assert.deepEqual(JSON.parse(JSON.parse(storage.getItem(accountWorkspaceKey('a'))).snapshot.localSettings[CONVERSATION_NOTES_KEY]), [note('A')]);
  storage.setItem(CONVERSATION_NOTES_KEY, JSON.stringify([note('B new')]));
  change(storage, 'a'); assert.deepEqual(readConversationNotes(storage, 'a'), [note('A')]);
  change(storage, null); assert.deepEqual(readConversationNotes(storage), [note('Guest')]);
  change(storage, 'b'); assert.deepEqual(readConversationNotes(storage, 'b'), [note('B new')]);
});

test('invalid destination legacy notes prevent an account switch before any write', () => {
  const storage = new Storage({ [WORKSPACE_DATA_KEY]: JSON.stringify(empty), [WORKSPACE_OWNER_KEY]: JSON.stringify({ version: 1, accountId: 'a' }), [CONVERSATION_NOTES_KEY]: JSON.stringify([note('A')]), 'prepvault-chat-b': 'damaged' });
  const before = storage.dump();
  assert.throws(() => change(storage, 'b'));
  assert.deepEqual(storage.dump(), before);
});

test('encrypted plan backups round-trip manual text and attached images', async () => {
  const notes = [{ ...note('Emergency meeting note'), image: 'data:image/jpeg;base64,/9j/AA==' }];
  const snapshot = { ...empty, localSettings: { [CONVERSATION_NOTES_KEY]: JSON.stringify(notes) } };
  const encrypted = await encryptBackup(snapshot, 'test-only-long-passphrase');
  const restored = await decryptBackup(encrypted, 'test-only-long-passphrase');
  const storage = new Storage(restored.localSettings);
  assert.deepEqual(readConversationNotes(storage), notes);
});
