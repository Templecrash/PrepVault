import { recordsEqual } from './storage.js';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim().length > 0;

function validateItem(item) {
  if (!isRecord(item) || !['id', 'category', 'subType'].every(key => hasText(item[key])) || typeof item.name !== 'string'
    || !['string', 'number'].includes(typeof item.quantity) || (typeof item.quantity === 'string' && !item.quantity.trim())
    || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0
    || (item.fields !== undefined && !isRecord(item.fields))
    || (item.propertyId != null && item.propertyId !== '' && !hasText(item.propertyId))) {
    throw new Error('The supplies file contains an invalid inventory entry. Nothing has been imported.');
  }
}

function copy(value) {
  try { return structuredClone(value); }
  catch { throw new Error('The supplies could not be read. Nothing has been imported.'); }
}

const comparable = item => ({ ...item, quantity: Number(item.quantity), fields: item.fields || {}, propertyId: item.propertyId || 'prop1' });

/**
 * Prepare an additive, supplies-only import without touching storage or other
 * plan collections. Existing IDs always win, including their current quantities.
 * Root backup parsing validates the category/type registry separately.
 * Unknown or missing source properties need an explicit valid destination for
 * new supplies. Known source properties are preserved even with a destination.
 */
export function prepareInventoryImport(currentItems, incomingItems, properties, targetPropertyId) {
  if (!Array.isArray(currentItems) || !Array.isArray(incomingItems)) throw new Error('Choose a valid supplies inventory. Nothing has been imported.');
  if (!Array.isArray(properties) || !properties.length || properties.some(property => !isRecord(property) || !hasText(property.id))) {
    throw new Error('Add a property before importing supplies. Nothing has been imported.');
  }
  const propertyIds = new Set(properties.map(property => property.id));
  if (propertyIds.size !== properties.length) throw new Error('Property identities must be unique before importing supplies.');
  if (targetPropertyId !== undefined && !propertyIds.has(targetPropertyId)) throw new Error('Choose an existing property for supplies whose location is unavailable.');
  currentItems.forEach(validateItem);
  incomingItems.forEach(validateItem);
  if (new Set(currentItems.map(item => item.id)).size !== currentItems.length) throw new Error('Existing supply identities must be unique before importing. Your current supplies have not been changed.');

  const items = copy(currentItems);
  const byId = new Map(items.map(item => [item.id, comparable(item)]));
  const result = { items, addedCount: 0, duplicateCount: 0, conflictCount: 0, unavailablePropertyCount: 0, remappedCount: 0 };
  for (const source of incomingItems) {
    const unavailable = !propertyIds.has(source.propertyId);
    const destination = unavailable ? targetPropertyId : source.propertyId;
    const candidate = comparable(copy({ ...source, ...(destination !== undefined ? { propertyId: destination } : {}) }));
    const existing = byId.get(candidate.id);
    if (existing) {
      if (recordsEqual(existing, candidate)) result.duplicateCount += 1;
      else result.conflictCount += 1;
      continue;
    }
    if (destination === undefined) throw new Error('Some supplies belong to a missing property. Choose a destination before importing; nothing has been imported.');
    items.push(candidate);
    byId.set(candidate.id, candidate);
    result.addedCount += 1;
    if (unavailable) { result.unavailablePropertyCount += 1; result.remappedCount += 1; }
  }
  return result;
}
