import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup } from '../src/crypto-backup.js';

test('encrypted backup round trips a large complete household with zero quantities', async () => {
  const data = { version: 4, items: [{ id: 'one', name: 'Water', quantity: 0, notes: 'ø'.repeat(300000) }], contacts: [{ name: 'Test contact' }], localSettings: { 'prepvault-dismissed-opps': '[]' } };
  assert.deepEqual(await decryptBackup(await encryptBackup(data, 'test-only-passphrase'), 'test-only-passphrase'), data);
});
test('wrong passphrase and modified ciphertext are rejected', async () => {
  const payload = await encryptBackup({ items: [] }, 'correct-test-passphrase');
  await assert.rejects(decryptBackup(payload, 'wrong-test-passphrase'));
  const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0));
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(decryptBackup(btoa(String.fromCharCode(...bytes)), 'correct-test-passphrase'));
});
test('each export uses fresh salt and IV and malformed data fails', async () => {
  const first = await encryptBackup({ items: [] }, 'same-test-passphrase');
  const second = await encryptBackup({ items: [] }, 'same-test-passphrase');
  assert.notEqual(first.slice(0, 36), second.slice(0, 36));
  await assert.rejects(decryptBackup('AAAA', 'same-test-passphrase'));
});
