export const MAX_BUG_OUT_ENTRIES = 1000;
export const BUG_OUT_LIMITS = { id: 200, name: 160, quantity: 80, location: 300, assignee: 160, notes: 1200, inventoryId: 200 };

const record = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateBugOutEntries(value) {
  if (!Array.isArray(value) || value.length > MAX_BUG_OUT_ENTRIES) throw new Error('Invalid Bug Out checklist.');
  const ids = new Set();
  return value.map(entry => {
    if (!record(entry) || typeof entry.grabbed !== 'boolean') throw new Error('Invalid Bug Out checklist entry.');
    for (const [key, limit] of Object.entries(BUG_OUT_LIMITS)) {
      if (key === 'inventoryId' && entry[key] === undefined) continue;
      if (typeof entry[key] !== 'string' || entry[key].length > limit) throw new Error(`Invalid Bug Out ${key}.`);
    }
    if (!entry.id.trim() || !entry.name.trim() || ids.has(entry.id)) throw new Error('Invalid or duplicate Bug Out item.');
    ids.add(entry.id);
    return { ...entry };
  });
}

export function createBugOutEntry(draft, id) {
  const entry = Object.fromEntries(['name', 'quantity', 'location', 'assignee', 'notes'].map(key => [key, String(draft?.[key] ?? '').trim()]));
  entry.id = id;
  entry.grabbed = draft?.grabbed === true;
  if (typeof draft?.inventoryId === 'string' && draft.inventoryId) entry.inventoryId = draft.inventoryId;
  return validateBugOutEntries([entry])[0];
}

export function summarizeBugOut(entries = []) {
  const grabbed = entries.filter(entry => entry.grabbed === true).length;
  return { total: entries.length, grabbed, remaining: entries.length - grabbed, percent: entries.length ? Math.round(grabbed / entries.length * 100) : 0 };
}

export function toggleBugOutEntry(entries, id) {
  return entries.map(entry => entry.id === id ? { ...entry, grabbed: !entry.grabbed } : entry);
}

export function moveBugOutEntry(entries, id, direction) {
  const index = entries.findIndex(entry => entry.id === id);
  const nextIndex = index + direction;
  if (![-1, 1].includes(direction) || index < 0 || nextIndex < 0 || nextIndex >= entries.length) return entries;
  const next = [...entries];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

// Restore only records reset by this action without replacing the whole list.
// The UI clears this undo action when a later checklist mutation occurs.
export function restoreGrabbedChecks(entries, previouslyGrabbedIds) {
  const ids = new Set(previouslyGrabbedIds);
  return entries.map(entry => ids.has(entry.id) && !entry.grabbed ? { ...entry, grabbed: true } : entry);
}

export const BUG_OUT_STARTERS = [
  { name: 'Prepared go bags', quantity: 'One per person', notes: 'Confirm each bag is ready and reachable.' },
  { name: 'Essential medicines', quantity: 'Your planned supply', notes: 'Use your personal medication list and storage instructions.' },
  { name: 'Identification and important documents', quantity: 'Your document pouch' },
  { name: 'Phones, chargers and power banks', quantity: 'Your planned set' },
  { name: 'Water and ready-to-eat food', quantity: 'Your planned supply' },
  { name: 'Keys and wallet', quantity: 'Your planned set' },
  { name: 'Weather-appropriate clothing', quantity: 'One set per person' },
  { name: 'First-aid kit and flashlight', quantity: 'Your planned set' },
];
