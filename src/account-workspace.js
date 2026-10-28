import { validateSnapshot } from './storage.js';
import { CONVERSATION_NOTES_KEY, captureConversationNotes, conversationLegacyKey, normalizeConversationNotesSetting } from './conversation-notes.js';

export const WORKSPACE_DATA_KEY = 'prepvault-db';
export const WORKSPACE_OWNER_KEY = 'prepvault-workspace-owner';
export const ACCOUNT_WORKSPACE_PREFIX = 'prepvault-account-workspace-';

// Deliberately explicit: a new auth SDK or account cache must never become part
// of a plan backup just because its key starts with "prepvault-".
const WORKSPACE_SETTINGS = new Set([
  CONVERSATION_NOTES_KEY,
  'prepvault-alerts-dismissed-until',
  'prepvault-dismiss-profile-cta',
  'prepvault-dismissed-opps',
  'prepvault-radio-log',
  'prepvault-radio-location',
  'prepvault-location',
  'prepvault-location-watchlist',
  'prepvault-calendar',
  'prepvault-offline-routes',
  'prepvault-radio-volume',
  'prepvault-reference-channels',
  'prepvault-scanner-feed',
  'prepvault-trap-status',
  'prepvault-user-channels',
  'prepvault-workspace-open',
  'pv-weather-cache',
  'pv-news-cache',
]);

export const isWorkspaceSettingKey = key => WORKSPACE_SETTINGS.has(key);

function failure(message, code = 'WORKSPACE_STORAGE') {
  return Object.assign(new Error(message), { code });
}

function assertAccountId(accountId) {
  if (accountId === null) return;
  if (typeof accountId !== 'string' || !accountId || accountId !== accountId.trim() || accountId.length > 256 || [...accountId].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw failure('A verified account ID is required to switch plans.', 'WORKSPACE_ID');
  }
  try { encodeURIComponent(accountId); }
  catch { throw failure('A verified account ID is required to switch plans.', 'WORKSPACE_ID'); }
}

export function accountWorkspaceKey(accountId) {
  assertAccountId(accountId);
  return `${ACCOUNT_WORKSPACE_PREFIX}${accountId === null ? 'guest' : `user-${encodeURIComponent(accountId)}`}`;
}

/** undefined means the existing device plan has never been claimed. */
export function readWorkspaceOwner(storage) {
  const raw = storage.getItem(WORKSPACE_OWNER_KEY);
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Object.hasOwn(value, 'accountId')) throw new Error();
    assertAccountId(value.accountId);
    return value.accountId;
  } catch {
    // Do not interpret a damaged owner marker as permission to claim the plan.
    throw failure('The saved plan owner could not be read. Your plan has not been changed.', 'WORKSPACE_INVALID');
  }
}

export function captureWorkspaceSettings(storage) {
  return Object.fromEntries([...WORKSPACE_SETTINGS].flatMap(key => {
    const value = storage.getItem(key);
    return value === null ? [] : [[key, value]];
  }));
}

function cleanSettings(settings) {
  return Object.fromEntries(Object.entries(settings || {}).filter(([key, value]) => isWorkspaceSettingKey(key) && typeof value === 'string'));
}

function snapshotCopy(value) {
  try {
    const snapshot = validateSnapshot(JSON.parse(JSON.stringify(value)));
    return { ...snapshot, localSettings: cleanSettings(snapshot.localSettings) };
  } catch {
    throw failure('The saved plan could not be read. Your current plan has not been changed.', 'WORKSPACE_INVALID');
  }
}

function readCachedWorkspace(storage, accountId) {
  const raw = storage.getItem(accountWorkspaceKey(accountId));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || value.accountId !== accountId || (value.manualBackup != null && typeof value.manualBackup !== 'string')) throw new Error();
    return { snapshot: snapshotCopy(value.snapshot), manualBackup: value.manualBackup ?? null };
  } catch {
    throw failure('This account’s saved plan could not be read. Your current plan has not been changed.', 'WORKSPACE_INVALID');
  }
}

const cacheValue = (accountId, snapshot, manualBackup) => JSON.stringify({ version: 1, accountId, snapshot, manualBackup });

function commitWrites(storage, writes) {
  const changes = [...writes].map(([key, value]) => ({ key, value, before: storage.getItem(key) })).filter(change => change.value !== change.before);
  if (!changes.length) return;
  let stagingKey = `${ACCOUNT_WORKSPACE_PREFIX}preflight`;
  while (storage.getItem(stagingKey) !== null) stagingKey += '-next';

  // Reserving all new values is conservative but keeps quota failures ahead of
  // any current-plan change. The reserved value is at least as large as every
  // upcoming write combined (including keys), even during temporary overlap.
  try {
    storage.setItem(stagingKey, JSON.stringify(changes.map(({ key, value }) => [key, value])));
    storage.removeItem(stagingKey);
  } catch (error) {
    try { storage.removeItem(stagingKey); } catch { /* Current plan is untouched. */ }
    throw failure(error?.name === 'QuotaExceededError'
      ? 'Not enough browser storage to switch plans. Your current plan has not been changed.'
      : 'Browser storage is unavailable. Your current plan has not been changed.', 'WORKSPACE_PREFLIGHT');
  }

  try {
    for (const { key, value } of changes) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch {
    // Defensive rollback for a storage failure after a successful reservation.
    // Remove replacements first so old values have space to be restored.
    try {
      for (const { key } of changes) storage.removeItem(key);
      for (const { key, before } of changes) if (before !== null) storage.setItem(key, before);
    } catch {
      throw failure('Browser storage stopped responding. Keep this page open and retry before changing plans.', 'WORKSPACE_ROLLBACK_FAILED');
    }
    throw failure('The plan could not be switched. Your current plan has not been changed.', 'WORKSPACE_STORAGE');
  }
}

/**
 * Call only with an ID from a freshly verified server session (or null for a
 * guest). This is device data isolation, not authentication or encryption.
 * Pause autosave, call synchronously, replace all React state with the returned
 * snapshot, then resume autosave. An exception means do not change React state.
 */
export function switchAccountWorkspace(storage, { accountId, currentSnapshot, emptySnapshot }) {
  assertAccountId(accountId);
  const previousOwner = readWorkspaceOwner(storage);
  const empty = snapshotCopy(emptySnapshot);
  const currentSettings = captureWorkspaceSettings(storage);
  if (!Object.hasOwn(currentSettings, CONVERSATION_NOTES_KEY) && storage.getItem(conversationLegacyKey(previousOwner ?? null)) !== null) {
    currentSettings[CONVERSATION_NOTES_KEY] = captureConversationNotes(storage, previousOwner ?? null);
  }
  const current = { ...empty, ...snapshotCopy(currentSnapshot), localSettings: currentSettings };

  // A session check on a new device must not claim the guest plan prematurely.
  if (previousOwner === accountId || (previousOwner === undefined && accountId === null)) {
    return { snapshot: current, accountId, claimedUnbound: false, changed: false };
  }

  const cached = readCachedWorkspace(storage, accountId);
  const claimedUnbound = previousOwner === undefined && accountId !== null && cached === null;
  let snapshot = cached ? { ...empty, ...cached.snapshot } : claimedUnbound ? current : empty;
  // Older account caches predate scoped notes. Read only the destination's
  // legacy key; the active new key still belongs to the departing account.
  if (!claimedUnbound && !Object.hasOwn(snapshot.localSettings, CONVERSATION_NOTES_KEY)) {
    const legacyNotes = storage.getItem(conversationLegacyKey(accountId));
    if (legacyNotes !== null) snapshot = { ...snapshot, localSettings: { ...snapshot.localSettings, [CONVERSATION_NOTES_KEY]: normalizeConversationNotesSetting(legacyNotes) } };
  }
  const currentManualBackup = storage.getItem('pcs-db');
  const manualBackup = cached ? cached.manualBackup : claimedUnbound ? currentManualBackup : null;
  const writes = new Map();

  // Once claimed, an old plan never doubles as the signed-out guest plan.
  if (previousOwner !== undefined) writes.set(accountWorkspaceKey(previousOwner), cacheValue(previousOwner, current, currentManualBackup));
  writes.set(accountWorkspaceKey(accountId), cacheValue(accountId, snapshot, manualBackup));
  for (const key of WORKSPACE_SETTINGS) writes.set(key, snapshot.localSettings[key] ?? null);
  // Preserve the manual backup separately from exportable settings. It may
  // contain an encrypted plan and must be available only in its own workspace.
  writes.set('pcs-db', manualBackup);
  writes.set(WORKSPACE_DATA_KEY, JSON.stringify(snapshot));
  writes.set(WORKSPACE_OWNER_KEY, JSON.stringify({ version: 1, accountId }));
  commitWrites(storage, writes);
  return { snapshot, accountId, claimedUnbound, changed: true };
}
