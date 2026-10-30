import test from 'node:test';
import assert from 'node:assert/strict';
import { BUG_OUT_LIMITS, BUG_OUT_STARTERS, MAX_BUG_OUT_ENTRIES, createBugOutEntry, moveBugOutEntry, restoreGrabbedChecks, summarizeBugOut, toggleBugOutEntry, validateBugOutEntries } from '../src/bug-out.js';
import { validateSnapshot } from '../src/storage.js';
import { buildAdvisorContext, sanitizeAdvisorContext } from '../src/advisor-context.js';

const entry = (id, changes = {}) => createBugOutEntry({ name: `Item ${id}`, quantity: '1 bag', location: 'Hall closet', assignee: 'You', notes: 'By the door', ...changes }, id);

test('Bug Out snapshots preserve checklist details independently of inventory changes', () => {
  const inventory = { id: 'water', name: 'Water bag', quantity: 20, location: 'Garage' };
  const saved = createBugOutEntry({ ...inventory, quantity: '2 bottles', inventoryId: inventory.id, unknown: 'not copied' }, 'grab1');
  inventory.name = 'Renamed'; inventory.quantity = 0; inventory.location = 'Cabin';
  assert.deepEqual(saved, { id: 'grab1', name: 'Water bag', quantity: '2 bottles', location: 'Garage', assignee: '', notes: '', grabbed: false, inventoryId: 'water' });
  assert.deepEqual(validateBugOutEntries(JSON.parse(JSON.stringify([saved]))), [saved]);
});

test('checklist validation rejects malformed entries before applying a backup', () => {
  for (const bad of [null, {}, 'items', [null], [{ ...entry('1'), grabbed: 'true' }], [{ ...entry('1'), quantity: 2 }], [{ ...entry('1'), id: '' }], [{ ...entry('1'), name: '  ' }], [entry('1'), entry('1')]]) {
    assert.throws(() => validateBugOutEntries(bad), /Bug Out/);
  }
  for (const [key, maximum] of Object.entries(BUG_OUT_LIMITS)) assert.throws(() => validateBugOutEntries([{ ...entry('1'), [key]: 'x'.repeat(maximum + 1) }]), /Bug Out/);
  assert.throws(() => validateBugOutEntries(Array.from({ length: MAX_BUG_OUT_ENTRIES + 1 }, (_, index) => entry(String(index)))), /Bug Out/);
});

test('entry creation trims text, keeps explicit grabbed state and requires a usable name', () => {
  assert.equal(createBugOutEntry({ name: '  Keys  ', grabbed: true }, 'k').name, 'Keys');
  assert.equal(createBugOutEntry({ name: 'Keys', grabbed: 'true' }, 'k').grabbed, false);
  assert.throws(() => createBugOutEntry({ name: '  ' }, 'k'), /Bug Out/);
  const before = [entry('1')];
  assert.notEqual(validateBugOutEntries(before)[0], before[0]);
});

test('checking items changes progress only and never mutates source entries', () => {
  const original = [entry('1'), entry('2'), entry('3')];
  assert.deepEqual(summarizeBugOut(original), { total: 3, grabbed: 0, remaining: 3, percent: 0 });
  const checked = toggleBugOutEntry(original, '2');
  assert.deepEqual(summarizeBugOut(checked), { total: 3, grabbed: 1, remaining: 2, percent: 33 });
  assert.equal(original[1].grabbed, false);
  assert.equal(checked[1].quantity, '1 bag');
  assert.deepEqual(toggleBugOutEntry(checked, '2'), original);
  assert.deepEqual(toggleBugOutEntry(original, 'missing'), original);
  assert.deepEqual(summarizeBugOut([]), { total: 0, grabbed: 0, remaining: 0, percent: 0 });
});

test('reordering preserves identities and content while respecting the list boundaries', () => {
  const original = [entry('1'), entry('2'), entry('3')];
  const moved = moveBugOutEntry(original, '2', -1);
  assert.deepEqual(moved.map(item => item.id), ['2', '1', '3']);
  assert.deepEqual(original.map(item => item.id), ['1', '2', '3']);
  assert.equal(moved[0], original[1]);
  assert.equal(moveBugOutEntry(original, '1', -1), original);
  assert.equal(moveBugOutEntry(original, '3', 1), original);
  assert.equal(moveBugOutEntry(original, 'missing', 1), original);
  assert.equal(moveBugOutEntry(original, '2', 2), original);
});

test('reset Undo restores prior checks without losing edited, added or removed entries', () => {
  const afterResetAndEdits = [entry('1', { name: 'Updated name' }), entry('3', { grabbed: true }), entry('new')];
  const restored = restoreGrabbedChecks(afterResetAndEdits, ['1', 'removed']);
  assert.equal(restored[0].grabbed, true);
  assert.equal(restored[0].name, 'Updated name');
  assert.equal(restored[1].grabbed, true);
  assert.equal(restored[2].grabbed, false);
  assert.equal(restored.some(item => item.id === 'removed'), false);
  assert.equal(afterResetAndEdits[0].grabbed, false);
});

test('starter suggestions create only unchecked checklist plans without stock claims', () => {
  const entries = BUG_OUT_STARTERS.map((item, index) => createBugOutEntry(item, String(index)));
  assert.equal(entries.length, 8);
  assert.ok(entries.every(item => !item.grabbed && !item.inventoryId && !item.location && !item.assignee));
  assert.equal(summarizeBugOut(entries).remaining, entries.length);
  assert.deepEqual(validateBugOutEntries(entries), entries);
});

test('complete backups round trip the grab order, snapshots and checks while legacy backups remain valid', () => {
  const snapshot = { version: 4, items: [], bugOutEntries: [entry('second', { grabbed: true, inventoryId: 'deleted-supply' }), entry('first')] };
  const before = structuredClone(snapshot);
  const restored = validateSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored, before);
  assert.deepEqual(restored.bugOutEntries.map(item => item.id), ['second', 'first']);
  assert.equal(restored.bugOutEntries[0].grabbed, true);
  assert.equal(restored.bugOutEntries[0].inventoryId, 'deleted-supply', 'the independent grab snapshot survives loss of its source inventory');
  assert.deepEqual(snapshot, before);
  assert.equal(validateSnapshot({ version: 3, items: [] }).bugOutEntries, undefined, 'restore flow can distinguish older backups');
  assert.throws(() => validateSnapshot({ items: [], bugOutEntries: [{ ...entry('bad'), grabbed: 'true' }] }), /Bug Out/);
});

test('advisor includes grab details at both boundaries and excludes credentials and extra fields', () => {
  const grab = { ...entry('one', { inventoryId: 'go-bag', grabbed: true, notes: 'Near the door. password: NOT_FOR_AI' }), token: 'EXTRA_SECRET', unexpected: 'EXTRA_FIELD' };
  const expected = { ...entry('one', { inventoryId: 'go-bag', grabbed: true, notes: 'Near the door. [redacted credential]' }) };
  const built = buildAdvisorContext({ items: [], bugOutEntries: [grab, entry('two')] });
  const sanitized = sanitizeAdvisorContext(built);
  const crafted = sanitizeAdvisorContext({ plans: { bugOutChecklist: [grab, entry('two')], token: 'PLAN_SECRET' } });
  for (const context of [built, sanitized, crafted]) {
    assert.deepEqual(context.plans.bugOutChecklist[0], expected);
    assert.equal(context.plans.bugOutChecklist[1].grabbed, false);
    assert.ok(!JSON.stringify(context).includes('NOT_FOR_AI'));
    assert.ok(!JSON.stringify(context).includes('EXTRA_SECRET'));
    assert.ok(!JSON.stringify(context).includes('EXTRA_FIELD'));
    assert.ok(!JSON.stringify(context).includes('PLAN_SECRET'));
  }
});
