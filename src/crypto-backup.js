import { encodeBytes } from './storage.js';

function checkPassword(password) {
  if (typeof password !== 'string' || !password.length) throw new Error('Enter the backup passphrase.');
  if (!globalThis.crypto?.subtle) throw new Error('Backup encryption needs a secure browser context (HTTPS or localhost).');
}

async function deriveKey(password, salt) {
  checkPassword(password);
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Keep the original on-disk format: 16-byte salt, 12-byte IV, then ciphertext.
export async function encryptBackup(data, password) {
  checkPassword(password);
  const serialized = JSON.stringify(data);
  if (serialized === undefined) throw new Error('No backup data to encrypt.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(serialized));
  const bytes = new Uint8Array(28 + ciphertext.byteLength);
  bytes.set(salt); bytes.set(iv, 16); bytes.set(new Uint8Array(ciphertext), 28);
  return encodeBytes(bytes);
}

export async function decryptBackup(payload, password) {
  checkPassword(password);
  if (typeof payload !== 'string' || !payload.length || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) throw new Error('Invalid encrypted backup.');
  const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0));
  if (bytes.length < 44) throw new Error('Invalid encrypted backup.');
  const key = await deriveKey(password, bytes.slice(0, 16));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.slice(28));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
