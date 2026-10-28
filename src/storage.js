import { validateBugOutEntries } from './bug-out.js';

export const SNAPSHOT_ARRAYS = ['items', 'pins', 'properties', 'members', 'contacts', 'callSigns', 'codeWords', 'rallyPoints', 'codes', 'gardenBeds', 'actionLog', 'soilTests', 'compostBins', 'livestock', 'slaughterLog', 'routes', 'bugOutEntries'];

export const MAX_MAP_IMAGE_LENGTH = 2 * 1024 * 1024;

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const PIN_ASSIGNMENT_LIMITS = { assignmentRole: 200, assignmentEquipment: 500 };
const validPinAssignmentFields = pin => Object.entries(PIN_ASSIGNMENT_LIMITS).every(([field, limit]) => pin[field] === undefined || (typeof pin[field] === 'string' && pin[field].length <= limit));

function validMapImage(image) {
  if (!isRecord(image) || typeof image.dataUrl !== 'string' || image.dataUrl.length > MAX_MAP_IMAGE_LENGTH) return false;
  if (![image.width, image.height].every(value => Number.isInteger(value) && value > 0 && value <= 4096)) return false;
  const comma = image.dataUrl.indexOf(',');
  if (!['data:image/png;base64', 'data:image/jpeg;base64', 'data:image/webp;base64'].includes(image.dataUrl.slice(0, comma))) return false;
  const encoded = image.dataUrl.slice(comma + 1);
  return encoded.length > 0 && encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded);
}

function validMapPins(pins) {
  if (!Array.isArray(pins)) return false;
  const ids = new Set();
  return pins.every(pin => {
    if (!isRecord(pin) || !hasText(pin.id) || ids.has(pin.id) || !hasText(pin.layer) || !hasText(pin.type)) return false;
    if (![pin.x, pin.y].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) return false;
    if (['label', 'notes', 'assignee'].some(key => pin[key] !== undefined && typeof pin[key] !== 'string')) return false;
    if (!validPinAssignmentFields(pin)) return false;
    ids.add(pin.id);
    return true;
  });
}

function validateMapPlanning(value) {
  if (value.mapSetups !== undefined) {
    if (!isRecord(value.mapSetups)) throw new Error('Invalid saved maps in backup.');
    for (const [propertyId, map] of Object.entries(value.mapSetups)) {
      if (!hasText(propertyId) || ['__proto__', 'constructor', 'prototype'].includes(propertyId) || !isRecord(map) || !hasText(map.name) || typeof map.address !== 'string' || !validMapImage(map.image) || !validMapPins(map.pins) || !hasText(map.savedAt) || !Number.isFinite(Date.parse(map.savedAt))) throw new Error('Invalid saved map in backup.');
    }
  }
  const routeIds = new Set();
  for (const route of value.routes || []) {
    if (['id', 'propertyId', 'name', 'origin', 'destination'].some(key => !hasText(route[key])) || routeIds.has(route.id) || !['driving', 'walking', 'bicycling', 'transit'].includes(route.travelMode) || (route.notes !== undefined && typeof route.notes !== 'string')) throw new Error('Invalid travel route in backup.');
    routeIds.add(route.id);
  }
}

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
  // Older legacy markers can omit current map fields; only validate the new
  // optional assignment fields here, preserving historical marker metadata.
  if (value.pins?.some(pin => !validPinAssignmentFields(pin))) throw new Error('Invalid assignment fields in backup pins.');
  if (value.contacts?.some(person => person.isDependant !== undefined && typeof person.isDependant !== 'boolean')) throw new Error('Invalid dependant selection in backup.');
  if (value.bugOutEntries !== undefined) validateBugOutEntries(value.bugOutEntries);
  validateMapPlanning(value);
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
