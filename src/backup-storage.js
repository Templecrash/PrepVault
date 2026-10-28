import { validateSnapshot } from './storage.js';
import { decryptBackup } from './crypto-backup.js';
import { captureWorkspaceSettings, isWorkspaceSettingKey, WORKSPACE_DATA_KEY } from './account-workspace.js';

export const MAX_BACKUP_FILE_BYTES = 64 * 1024 * 1024;

const failure = (message, code) => Object.assign(new Error(message), { code });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanSettings = value => Object.fromEntries(Object.entries(value || {}).filter(([key, setting]) => isWorkspaceSettingKey(key) && typeof setting === 'string'));

/** A damaged or unavailable working copy must never be mistaken for a new plan. */
export function readStoredPlan(storage, key = WORKSPACE_DATA_KEY) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { snapshot: null, error: '' };
    return { snapshot: validateSnapshot(JSON.parse(raw)), error: '' };
  } catch {
    return { snapshot: null, error: 'The saved plan could not be read. It has not been replaced. Restore a backup or download the saved data for recovery.' };
  }
}

/** Parse and validate completely before offering to replace any working data. */
export async function readBackupFile(text, password = '') {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_FILE_BYTES || new TextEncoder().encode(text).byteLength > MAX_BACKUP_FILE_BYTES) {
    throw failure('Choose a PrepVault backup smaller than 64 MB.', 'BACKUP_SIZE');
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw failure('This file is not valid backup JSON.', 'BACKUP_FORMAT'); }
  if (!record(parsed)) throw failure('This file does not contain a PrepVault backup.', 'BACKUP_FORMAT');
  let snapshot = parsed;
  if ('payload' in parsed || 'pcs' in parsed || 'enc' in parsed) {
    if (parsed.pcs !== true || parsed.enc !== 'AES-256-GCM' || parsed.kdf !== 'PBKDF2-SHA256-310K' || typeof parsed.payload !== 'string') {
      throw failure('This encrypted backup format is not supported.', 'BACKUP_FORMAT');
    }
    if (typeof password !== 'string' || !password.length) throw failure('Enter the passphrase used to encrypt this backup.', 'BACKUP_PASSWORD');
    try { snapshot = await decryptBackup(parsed.payload, password); }
    catch { throw failure('The passphrase did not match or the encrypted backup is damaged.', 'BACKUP_DECRYPT'); }
  }
  const validated = validateSnapshot(snapshot);
  if (validated.version !== undefined && ![3, 4].includes(validated.version)) throw failure('This backup version is not supported by this copy of PrepVault.', 'BACKUP_VERSION');
  return validated;
}

/**
 * Synchronous storage commit with quota preflight and rollback. Call after all
 * app-specific validation/defaults, BEFORE updating React state. No auth keys,
 * other account snapshots or the separate manual backup are replaced.
 */
export function persistRestoredSnapshot(storage, raw, { includeSettings = true, savedAt = new Date().toISOString() } = {}) {
  const data = validateSnapshot(raw);
  const currentSettings = captureWorkspaceSettings(storage);
  const localSettings = includeSettings ? cleanSettings(data.localSettings) : currentSettings;
  const snapshot = { ...data, localSettings, savedAt };
  const writes = new Map();
  if (includeSettings) {
    for (const key of new Set([...Object.keys(currentSettings), ...Object.keys(localSettings)])) writes.set(key, localSettings[key] ?? null);
  }
  writes.set(WORKSPACE_DATA_KEY, JSON.stringify(snapshot));
  const changes = [...writes].map(([key, value]) => ({ key, value, before: storage.getItem(key) })).filter(change => change.value !== change.before);
  if (!changes.length) return snapshot;
  let stagingKey = 'prepvault-restore-preflight';
  while (storage.getItem(stagingKey) !== null) stagingKey += '-next';
  try {
    storage.setItem(stagingKey, JSON.stringify(changes.map(({ key, value }) => [key, value])));
    storage.removeItem(stagingKey);
  } catch (error) {
    try { storage.removeItem(stagingKey); } catch { /* Existing plan is untouched. */ }
    throw failure(error?.name === 'QuotaExceededError'
      ? 'Not enough browser storage to restore this backup. Your current plan has not been changed.'
      : 'Browser storage is unavailable. Your current plan has not been changed.', 'BACKUP_PREFLIGHT');
  }
  try {
    for (const { key, value } of changes) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch {
    try {
      for (const { key } of changes) storage.removeItem(key);
      for (const { key, before } of changes) if (before !== null) storage.setItem(key, before);
    } catch {
      throw failure('Browser storage stopped responding during restore. Keep this page and your downloaded backup open.', 'BACKUP_ROLLBACK_FAILED');
    }
    throw failure('The backup could not be restored. Your current plan has not been changed.', 'BACKUP_STORAGE');
  }
  return snapshot;
}
