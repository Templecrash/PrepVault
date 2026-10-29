import { accountWorkspaceKey, captureWorkspaceSettings, isWorkspaceSettingKey, readWorkspaceOwner, WORKSPACE_DATA_KEY } from './account-workspace.js';
import { CONVERSATION_NOTES_KEY, captureConversationNotes } from './conversation-notes.js';
import { recordsEqual, SNAPSHOT_ARRAYS, validateSnapshot } from './storage.js';
import { captureWorkspaceBaseline, workspaceBaselineStatus } from './workspace-persistence.js';

const RECOVERY_PREFIX = 'prepvault-plan-reset-recovery-';
const failure = (message, code = 'PLAN_RESET_INVALID') => Object.assign(new Error(message), { code });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanSettings = value => Object.fromEntries(Object.entries(value || {}).filter(([key, setting]) => isWorkspaceSettingKey(key) && typeof setting === 'string'));

function ownerScope(owner) {
  if (owner === undefined) return 'unbound';
  // Reuse account-workspace's ID validation, including guest/account distinction.
  accountWorkspaceKey(owner);
  return owner === null ? 'guest' : `user-${encodeURIComponent(owner)}`;
}

function assertOwner(storage, options) {
  if (!Object.hasOwn(options, 'expectedOwner')) throw failure('Verify the active account before clearing or restoring a plan.', 'PLAN_RESET_OWNER');
  const scope = ownerScope(options.expectedOwner);
  if (readWorkspaceOwner(storage) !== options.expectedOwner) throw failure('The active account changed. Reload its plan before continuing.', 'PLAN_RESET_OWNER');
  return scope;
}

function snapshotCopy(raw) {
  try {
    const snapshot = validateSnapshot(JSON.parse(JSON.stringify(raw)));
    return { ...snapshot, localSettings: cleanSettings(snapshot.localSettings) };
  } catch {
    throw failure('The plan could not be verified. Nothing has been cleared or restored.');
  }
}

function blankValue(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return isRecord(value) && Object.values(value).every(blankValue);
}

function emptyPlan(raw) {
  const template = snapshotCopy(raw);
  if (template.properties?.length !== 1 || SNAPSHOT_ARRAYS.some(key => key !== 'properties' && template[key]?.length)
    || !blankValue(template.propertyProfile) || !blankValue(template.mapSetups) || !blankValue(template.propAddress)
    || template.emergencyPlan != null || Object.keys(template.localSettings).length) {
    throw failure('Use the empty default plan when clearing personal data. Nothing has been changed.');
  }
  const property = template.properties[0];
  if (property.address || property.notes) throw failure('The default property must not contain personal details.');
  return {
    version: 4,
    ...Object.fromEntries(SNAPSHOT_ARRAYS.filter(key => key !== 'properties').map(key => [key, []])),
    properties: [{ id: property.id, name: property.name, ...(property.type ? { type: property.type } : {}), ...(property.icon ? { icon: property.icon } : {}), active: true }],
    activePropertyId: property.id, people: 1, dailyCalTarget: 2000, climate: template.climate || 'cold',
    propAddress: '', mapSetups: {}, propertyProfile: template.propertyProfile || {}, emergencyPlan: null, demoData: false,
    // An explicit empty value prevents same-owner legacy notes resurfacing.
    localSettings: { [CONVERSATION_NOTES_KEY]: '[]' },
  };
}

function resetContent(snapshot) {
  const content = { ...snapshot };
  for (const key of ['savedAt', 'timestamp', 'meta']) delete content[key];
  content.localSettings = Object.fromEntries(Object.entries(snapshot.localSettings).filter(([key, raw]) => {
    // Opening the workspace and mounting empty child views must not consume
    // the useful undo copy on an accidental second reset.
    if (['prepvault-workspace-open', 'prepvault-dismiss-profile-cta'].includes(key)) return false;
    try { return !blankValue(JSON.parse(raw)); } catch { return true; }
  }));
  return content;
}

function assertCurrent(storage, expectedOwner, baseline) {
  if (readWorkspaceOwner(storage) !== expectedOwner) throw failure('The active account changed. Your plan has not been changed.', 'PLAN_RESET_OWNER');
  const status = workspaceBaselineStatus(storage, baseline);
  if (status !== 'same') throw failure('A newer plan was saved in another tab. Reload it before continuing.', status === 'owner-changed' ? 'PLAN_RESET_OWNER' : 'WORKSPACE_CONFLICT');
}

function commit(storage, writes, { expectedOwner, baseline }) {
  const changes = [...writes].map(([key, value]) => ({ key, value, before: storage.getItem(key) })).filter(change => change.value !== change.before);
  if (!changes.length) return;
  let stagingKey = `${RECOVERY_PREFIX}preflight`;
  for (let count = 0; storage.getItem(stagingKey) !== null; count += 1) {
    if (count >= 100) throw failure('A previous storage operation needs attention. Nothing has been changed.', 'PLAN_RESET_PREFLIGHT');
    stagingKey = `${RECOVERY_PREFIX}preflight-${count}`;
  }
  try {
    storage.setItem(stagingKey, JSON.stringify(changes.map(({ key, value }) => [key, value])));
    storage.removeItem(stagingKey);
  } catch (error) {
    try { storage.removeItem(stagingKey); } catch { /* The existing plan remains unchanged. */ }
    throw failure(error?.name === 'QuotaExceededError'
      ? 'There is not enough browser storage to keep a recovery copy. Download a backup and free space before clearing this plan.'
      : 'Browser storage is unavailable. Nothing has been changed.', 'PLAN_RESET_PREFLIGHT');
  }
  // No asynchronous work between the final stale-write check and commit.
  assertCurrent(storage, expectedOwner, baseline);
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
      throw failure('Browser storage stopped responding. Keep this page open and retain your backup.', 'PLAN_RESET_ROLLBACK_FAILED');
    }
    throw failure('The plan could not be changed. Its previous data and recovery copy have been preserved.', 'PLAN_RESET_STORAGE');
  }
}

function planWrites(storage, snapshot, expectedOwner) {
  const writes = new Map();
  const currentSettings = captureWorkspaceSettings(storage);
  for (const key of new Set([...Object.keys(currentSettings), ...Object.keys(snapshot.localSettings)])) writes.set(key, snapshot.localSettings[key] ?? null);
  writes.set(WORKSPACE_DATA_KEY, JSON.stringify(snapshot));
  if (expectedOwner !== undefined) {
    // Updating the same-owner cache stops a later sign-in resurrecting the old
    // plan. The existing manual browser backup remains separate and unchanged.
    const cacheKey = accountWorkspaceKey(expectedOwner);
    const cachedRaw = storage.getItem(cacheKey);
    let manualBackup = storage.getItem('pcs-db');
    if (cachedRaw !== null) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (!isRecord(cached) || cached.version !== 1 || cached.accountId !== expectedOwner || (cached.manualBackup != null && typeof cached.manualBackup !== 'string')) throw new Error();
        if (Object.hasOwn(cached, 'manualBackup')) manualBackup = cached.manualBackup;
      } catch { throw failure('This account’s cache could not be verified. Nothing has been changed.'); }
    }
    writes.set(cacheKey, JSON.stringify({ version: 1, accountId: expectedOwner, snapshot, manualBackup }));
  }
  return writes;
}

/** Read only this active owner's reset recovery, never another account's keys. */
export function readPlanResetRecovery(storage, options = {}) {
  const scope = assertOwner(storage, options);
  const raw = storage.getItem(`${RECOVERY_PREFIX}${scope}`);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || value.scope !== scope || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error();
    return { snapshot: snapshotCopy(value.snapshot), createdAt: value.createdAt };
  } catch {
    throw failure('The previous-plan recovery copy could not be read. It has not been replaced.', 'PLAN_RESET_RECOVERY');
  }
}

/**
 * Call synchronously after the UI's current-plan guard and after invalidating
 * pending autosaves. Pass its baseline so an already-stale tab fails closed.
 * Returns the durable snapshot and baseline for adopting into React state.
 * Browser localStorage has no cross-process transaction; quota preflight and
 * rollback protect failed writes, not simultaneous uncoordinated old clients.
 */
export function resetActivePlan(storage, options = {}) {
  const scope = assertOwner(storage, options);
  const baseline = options.baseline || captureWorkspaceBaseline(storage);
  assertCurrent(storage, options.expectedOwner, baseline);
  const currentSettings = captureWorkspaceSettings(storage);
  currentSettings[CONVERSATION_NOTES_KEY] = captureConversationNotes(storage, options.expectedOwner ?? null);
  const previous = snapshotCopy({ ...options.currentSnapshot, localSettings: currentSettings });
  const createdAt = new Date(options.now || new Date()).toISOString();
  const snapshot = { ...emptyPlan(options.emptySnapshot), savedAt: createdAt, timestamp: createdAt };
  const existingRecovery = recordsEqual(resetContent(previous), resetContent(snapshot)) ? readPlanResetRecovery(storage, options) : null;
  const writes = planWrites(storage, snapshot, options.expectedOwner);
  // Save recovery before replacing active data, so rollback also retains an
  // earlier recovery when quota or storage fails partway through this reset.
  const withRecovery = existingRecovery ? writes : new Map([[`${RECOVERY_PREFIX}${scope}`, JSON.stringify({ version: 1, scope, createdAt, snapshot: previous })], ...writes]);
  commit(storage, withRecovery, { expectedOwner: options.expectedOwner, baseline });
  return { snapshot, baseline: captureWorkspaceBaseline(storage), recoveryCreatedAt: existingRecovery?.createdAt || createdAt };
}

/** Undo the latest reset for the current owner; current manual backups stay put. */
export function restorePreviousPlan(storage, options = {}) {
  const scope = assertOwner(storage, options);
  const baseline = options.baseline || captureWorkspaceBaseline(storage);
  assertCurrent(storage, options.expectedOwner, baseline);
  const recovery = readPlanResetRecovery(storage, options);
  if (!recovery) throw failure('No previous plan is available for this account.', 'PLAN_RESET_MISSING');
  const savedAt = new Date(options.now || new Date()).toISOString();
  const snapshot = { ...recovery.snapshot, savedAt, timestamp: savedAt };
  const writes = planWrites(storage, snapshot, options.expectedOwner);
  writes.set(`${RECOVERY_PREFIX}${scope}`, null);
  commit(storage, writes, { expectedOwner: options.expectedOwner, baseline });
  return { snapshot, baseline: captureWorkspaceBaseline(storage), recoveryCreatedAt: null };
}

// This helper intentionally never writes the workspace owner marker, pcs-db, auth,
// provider connections, tracking keys, theme preferences or another account.
