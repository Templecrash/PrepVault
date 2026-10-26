export const SNAPSHOT_ARRAYS = ['items', 'pins', 'properties', 'members', 'contacts', 'callSigns', 'codeWords', 'rallyPoints', 'codes', 'gardenBeds', 'actionLog', 'soilTests', 'compostBins', 'livestock', 'slaughterLog'];

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim().length > 0;

// JSON field order can change across Supabase, backups and older app versions.
// Treat those representations as equal, so an unchanged record can receive a
// remote update or deletion instead of being mistaken for a local edit.
export function recordsEqual(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left).filter(key => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter(key => right[key] !== undefined);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.hasOwn(right, key) && recordsEqual(left[key], right[key]));
}

// Accept original v3 exports as well as complete v4 backups. Validate before
// applying any setter so a malformed backup cannot partially replace a plan.
export function validateSnapshot(value) {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error('This file does not contain a PrepVault inventory.');
  for (const key of SNAPSHOT_ARRAYS) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some(record => !isRecord(record)))) throw new Error(`Invalid ${key} in backup.`);
  }
  if (value.items.some(item => !hasText(item.id) || !hasText(item.category) || !hasText(item.subType) || typeof item.name !== 'string' || !['string', 'number'].includes(typeof item.quantity) || item.quantity === '' || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0 || (item.fields !== undefined && !isRecord(item.fields)))) throw new Error('Invalid supply in backup.');
  if (value.people !== undefined && (!Number.isFinite(value.people) || value.people < 1)) throw new Error('Invalid household size.');
  if (value.properties && (!value.properties.length || value.properties.some(p => !hasText(p.id) || !hasText(p.name)))) throw new Error('Invalid properties.');
  for (const key of ['propertyProfile', 'localSettings']) if (value[key] !== undefined && !isRecord(value[key])) throw new Error(`Invalid ${key} in backup.`);
  for (const key of ['climate', 'propAddress', 'activePropertyId']) if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`Invalid ${key} in backup.`);
  if (value.demoData !== undefined && typeof value.demoData !== 'boolean') throw new Error('Invalid sample data flag.');
  const seen = new Set();
  const items = value.items.map((item, index) => {
    let id = item.id;
    // Early versions shipped duplicate sample IDs. Preserve every record and
    // give duplicates stable identities so filtering/editing targets one item.
    if (seen.has(id)) id = `${id}-${item.category}-${index}`;
    while (seen.has(id)) id += '-copy';
    seen.add(id);
    return { ...item, id, propertyId: item.propertyId || 'prop1', quantity: Number(item.quantity), fields: item.fields || {} };
  });
  return { ...value, items };
}

export function encodeBytes(bytes) {
  // Avoid spreading a large backup into a function call (argument limit).
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

export function mergeRecords(local = [], remote = [], baseline = [], { syncedKeys } = {}) {
  const core = record => record && (syncedKeys ? Object.fromEntries(syncedKeys.filter(key => record[key] !== undefined).map(key => [key, record[key]])) : record);
  const localOnly = record => syncedKeys && record ? Object.fromEntries(Object.entries(record).filter(([key]) => !syncedKeys.includes(key))) : {};
  const old = new Map(baseline.map(item => [item.id, item]));
  const current = new Map(local.map(item => [item.id, item]));
  const cloud = new Map(remote.map(item => [item.id, item]));
  const merged = [];
  for (const id of new Set([...current.keys(), ...cloud.keys()])) {
    const here = current.get(id), there = cloud.get(id), before = old.get(id);
    // Local changes (including deletion) take precedence until pushed. An
    // unchanged local record accepts remote updates and remote deletion.
    // Changes to fields that the cloud cannot store must not block a newer
    // cloud quantity, position, etc. Keep those fields beside a remote update,
    // but never use them to resurrect a remotely deleted record.
    const localChanged = !before ? !!here : !recordsEqual(core(here), core(before));
    const chosen = localChanged ? here : there;
    if (chosen) merged.push(chosen === there && here && syncedKeys ? { ...localOnly(here), ...there } : chosen);
  }
  return merged;
}
