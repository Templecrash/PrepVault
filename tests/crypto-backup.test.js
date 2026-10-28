import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { Buffer } from 'node:buffer';
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
  const firstBytes = Buffer.from(first, 'base64');
  const secondBytes = Buffer.from(second, 'base64');
  assert.notDeepEqual(firstBytes.subarray(0, 16), secondBytes.subarray(0, 16), 'salt is fresh');
  assert.notDeepEqual(firstBytes.subarray(16, 28), secondBytes.subarray(16, 28), 'IV is fresh');
  await assert.rejects(decryptBackup('AAAA', 'same-test-passphrase'));
});

test('export format independently decrypts with AES-256-GCM and exactly 310,000 PBKDF2-SHA256 iterations', async () => {
  const data = { version: 4, items: [], notes: 'Private plan with Unicode: 日本語' };
  const password = 'independent-test-passphrase';
  const bytes = Buffer.from(await encryptBackup(data, password), 'base64');
  const salt = bytes.subarray(0, 16);
  const iv = bytes.subarray(16, 28);
  const key = pbkdf2Sync(password, salt, 310000, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  const plaintext = Buffer.concat([decipher.update(bytes.subarray(28, bytes.length - 16)), decipher.final()]);
  assert.deepEqual(JSON.parse(plaintext.toString('utf8')), data);
});

test('legacy six-character passphrases still decrypt while empty credentials and malformed payloads fail', async () => {
  const old = await encryptBackup({ version: 3, items: [] }, 'old123');
  assert.deepEqual(await decryptBackup(old, 'old123'), { version: 3, items: [] });
  for (const password of ['', null, undefined, 1234]) {
    await assert.rejects(encryptBackup({ items: [] }, password), /passphrase/);
    await assert.rejects(decryptBackup(old, password), /passphrase/);
  }
  for (const payload of [null, {}, 123, '', 'AA A', '====', 'abc', 'data:application/json;base64,AAAA']) {
    await assert.rejects(decryptBackup(payload, 'test-passphrase'), /Invalid encrypted backup/);
  }
  await assert.rejects(encryptBackup(undefined, 'test-passphrase'), /No backup data/);
});

test('salt and IV tampering both fail authentication without returning partial contents', async () => {
  const payload = await encryptBackup({ items: [], privateNote: 'Do not disclose' }, 'test-only-passphrase');
  const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0));
  for (const offset of [0, 16]) {
    const changed = bytes.slice(); changed[offset] ^= 1;
    await assert.rejects(decryptBackup(btoa(String.fromCharCode(...changed)), 'test-only-passphrase'));
  }
});
