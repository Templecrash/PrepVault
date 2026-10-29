import { WORKSPACE_DATA_KEY, WORKSPACE_OWNER_KEY, readWorkspaceOwner } from './account-workspace.js';
import { recordsEqual, validateSnapshot } from './storage.js';

const failure = (message, code) => Object.assign(new Error(message), { code });
const validRaw = value => value === null || typeof value === 'string';

function assertBaseline(baseline) {
  if (!baseline || !Object.hasOwn(baseline, 'planRaw') || !Object.hasOwn(baseline, 'ownerRaw') || !validRaw(baseline.planRaw) || !validRaw(baseline.ownerRaw)) {
    throw failure('Reconnect to the saved plan before saving changes.', 'WORKSPACE_BASELINE');
  }
}

function readCurrent(storage) {
  try {
    return {
      planRaw: storage.getItem(WORKSPACE_DATA_KEY),
      ownerRaw: storage.getItem(WORKSPACE_OWNER_KEY),
    };
  } catch {
    throw failure('Browser storage is unavailable. Keep this page open and export your changes.', 'WORKSPACE_STORAGE');
  }
}

function planContent(planRaw) {
  if (planRaw === null) return null;
  try {
    const parsed = JSON.parse(planRaw);
    validateSnapshot(parsed);
    const content = { ...parsed };
    // These timestamps record persistence activity, not a household change.
    // Nested timestamps and every other plan/settings field remain significant.
    delete content.savedAt;
    delete content.timestamp;
    return content;
  } catch {
    throw failure('The saved plan could not be read. It has not been replaced.', 'WORKSPACE_INVALID');
  }
}

function compareWorkspace(current, baseline) {
  if (current.ownerRaw !== baseline.ownerRaw) return 'owner-changed';
  const currentContent = planContent(current.planRaw);
  const baselineContent = planContent(baseline.planRaw);
  return currentContent === baselineContent || recordsEqual(currentContent, baselineContent) ? 'same' : 'plan-changed';
}

/** Capture only the active plan and owner marker. Call when the current React
 * state has been loaded from this saved plan, or after an intentional restore
 * or verified account switch. Never rebase a stale tab merely because it gained
 * focus: doing so would make its old React state appear current.
 */
export function captureWorkspaceBaseline(storage) {
  const baseline = readCurrent(storage);
  try {
    readWorkspaceOwner({ getItem: () => baseline.ownerRaw });
    planContent(baseline.planRaw);
  } catch {
    throw failure('The saved plan or its owner could not be read. It has not been replaced.', 'WORKSPACE_INVALID');
  }
  return Object.freeze(baseline);
}

/** Bounded same-account change detection: two active keys only, no account-cache
 * scan or cross-account data merge. Storage/focus handlers can use this to gate
 * edits until the newer saved plan is deliberately loaded.
 */
export function workspaceBaselineStatus(storage, baseline) {
  assertBaseline(baseline);
  return compareWorkspace(readCurrent(storage), baseline);
}

/** Optimistic stale-write guard. Serialize first, then compare both active keys
 * immediately before the synchronous setItem. Top-level savedAt/timestamp-only
 * changes are harmless; every substantive field is compared. Keep the returned baseline in a
 * ref so a later autosave/pagehide may write this tab's own next change.
 *
 * localStorage has no atomic compare-and-swap across processes. This prevents
 * already-stale snapshots from replacing a newer plan; it does not claim a
 * distributed transaction for simultaneous writers. No async work may be
 * inserted between the comparison and write.
 */
export function persistWorkspaceSnapshot(storage, baseline, snapshot) {
  assertBaseline(baseline);
  let planRaw;
  try { planRaw = JSON.stringify(validateSnapshot(snapshot)); }
  catch {
    throw failure('The current plan is incomplete or invalid. The saved copy has not been changed.', 'WORKSPACE_INVALID');
  }
  const current = readCurrent(storage);
  const status = compareWorkspace(current, baseline);
  if (status === 'owner-changed') {
    throw failure('The account changed in another tab. This tab has not saved over the active plan.', 'WORKSPACE_OWNER_CHANGED');
  }
  if (status === 'plan-changed') {
    throw failure('A newer plan was saved in another tab. Reload that saved plan before making more changes here.', 'WORKSPACE_CONFLICT');
  }
  if (recordsEqual(planContent(planRaw), planContent(current.planRaw))) {
    return current.planRaw === baseline.planRaw ? baseline : Object.freeze(current);
  }
  try { storage.setItem(WORKSPACE_DATA_KEY, planRaw); }
  catch (error) {
    throw failure(error?.name === 'QuotaExceededError'
      ? 'Browser storage is full. Your saved plan has not changed; export your changes before closing.'
      : 'The plan could not be saved. Keep this page open and export your changes.', 'WORKSPACE_STORAGE');
  }
  return Object.freeze({ planRaw, ownerRaw: baseline.ownerRaw });
}
