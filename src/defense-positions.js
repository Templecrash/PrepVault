const ASSIGNMENT_LIMITS = Object.freeze({
  assignee: 120,
  assignmentRole: 200,
  assignmentEquipment: 500,
  notes: 3000,
});

// Keep the property beside the marker rather than modifying saved marker data.
// An explicitly empty saved map must not revive the legacy primary markers.
export function getDefensePositions({ properties = [], mapSetups = {}, legacyPins = [], activePropertyId } = {}) {
  const primaryId = properties.find(property => property.id === 'prop1')?.id || properties[0]?.id;
  const selectedId = activePropertyId || primaryId;
  return properties.filter(property => selectedId === 'all' || property.id === selectedId).flatMap(property => {
    const map = Object.hasOwn(mapSetups, property.id) ? mapSetups[property.id] : undefined;
    const pins = Array.isArray(map?.pins) ? map.pins : property.id === primaryId ? legacyPins : [];
    return pins.filter(pin => pin?.layer === 'defense' && !['alarm_trip', 'obstacle'].includes(pin.type)).map(pin => ({
      key: JSON.stringify([property.id, pin.id]),
      propertyId: property.id,
      propertyName: property.name,
      pin,
    }));
  });
}

// Names are recorded text, not identity links. Only outer whitespace is
// normalized; similar names or differently cased names remain separate.
export function groupPositionAssignments(records = []) {
  const groups = new Map();
  for (const record of records) {
    const name = typeof record.pin?.assignee === 'string' ? record.pin.assignee.trim() : '';
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, { key: JSON.stringify([name]), name, positions: [] });
    groups.get(name).positions.push(record);
  }
  return [...groups.values()];
}

// The caller selects the property's pin collection. This patch cannot change
// a marker's identity, type, placement, or any unrelated saved metadata.
export function patchPositionAssignment(pins, pinId, patch) {
  if (!patch || typeof patch !== 'object') return pins;
  const changes = {};
  for (const [field, limit] of Object.entries(ASSIGNMENT_LIMITS)) {
    if (Object.hasOwn(patch, field) && typeof patch[field] === 'string') changes[field] = patch[field].trim().slice(0, limit);
  }
  if (!Object.keys(changes).length) return pins;
  return pins.map(pin => pin.id === pinId ? { ...pin, ...changes } : pin);
}
