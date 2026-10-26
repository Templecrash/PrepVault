import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDependencyChecks } from '../src/dependencies.js';

const byId = checks => Object.fromEntries(checks.map(check => [check.id, check]));

test('keeps all thirteen dependency checks and their expanded guidance with no inventory', () => {
  const checks = buildDependencyChecks();
  assert.deepEqual(checks.map(check => check.id), [
    'garage', 'wellpump', 'fridge', 'furnace', 'stovefan', 'sump', 'phone',
    'internet', 'security', 'medical', 'waterFilter', 'septic', 'co_detector',
  ]);
  assert.equal(checks.filter(check => check.risk === 'critical').length, 4);
  assert.equal(checks.filter(check => check.hidden).length, 11);
  assert.ok(checks.every(check => check.backup === null));
  assert.ok(checks.every(check => check.name && check.depends && check.desc && check.fix));
});

test('uses only the selected property inventory passed to the checklist', () => {
  const inventory = [
    { propertyId: 'home', category: 'fuel', subType: 'gasoline', quantity: 5 },
    { propertyId: 'home', category: 'batteries', quantity: 12 },
    { propertyId: 'cabin', category: 'electronics', subType: 'solarGadget', quantity: 1 },
    { propertyId: 'cabin', category: 'electronics', subType: 'satPhone', quantity: 1 },
  ];
  const before = structuredClone(inventory);
  const home = byId(buildDependencyChecks(inventory.filter(item => item.propertyId === 'home')));
  const cabin = byId(buildDependencyChecks(inventory.filter(item => item.propertyId === 'cabin')));
  assert.equal(home.wellpump.backup, 'Generator');
  assert.equal(home.security.backup, 'Battery backup');
  assert.equal(home.phone.backup, null);
  assert.equal(cabin.wellpump.backup, 'Solar');
  assert.equal(cabin.security.backup, null);
  assert.equal(cabin.phone.backup, 'Satellite Phone');
  assert.equal(cabin.internet.backup, 'Satellite Phone data');
  assert.equal(byId(buildDependencyChecks(inventory)).wellpump.backup, 'Generator');
  assert.deepEqual(inventory, before);
});

test('retains communication, water and heating alternatives and their guidance', () => {
  const checks = byId(buildDependencyChecks([
    { category: 'comms', quantity: 1 },
    { category: 'water', subType: 'purificationTablets', quantity: 20 },
    { category: 'firewood', quantity: 1, fields: { cords: '2.5' } },
  ]));
  assert.equal(checks.phone.backup, 'HAM Radio');
  assert.equal(checks.phone.fix, 'HAM radio is grid-independent.');
  assert.equal(checks.waterFilter.backup, 'Gravity filter');
  assert.equal(checks.furnace.fix, 'Wood stove is grid-independent.');
  assert.equal(checks.furnace.backup, null);
  assert.equal(checks.internet.backup, null);
  assert.equal(checks.septic.backup, null);
});

test('does not report fuel or battery matches when their recorded totals are zero', () => {
  const checks = byId(buildDependencyChecks([
    { category: 'fuel', subType: 'gasoline', quantity: 0 },
    { category: 'batteries', quantity: 0 },
  ]));
  assert.equal(checks.garage.backup, null);
  assert.equal(checks.medical.backup, null);
  assert.equal(checks.co_detector.backup, null);
});
