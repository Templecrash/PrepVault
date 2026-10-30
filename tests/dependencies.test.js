import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDependencyChecks, summarizeDependencies } from '../src/dependencies.js';

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
    { propertyId: 'home', category: 'power', subType: 'generator', quantity: 1 },
    { propertyId: 'home', category: 'power', subType: 'batteryBackup', quantity: 1 },
    { propertyId: 'home', category: 'batteries', subType: 'aa', quantity: 12 },
    { propertyId: 'cabin', category: 'electronics', subType: 'solarGadget', quantity: 1 },
    { propertyId: 'cabin', category: 'electronics', subType: 'satPhone', quantity: 1 },
  ];
  const before = structuredClone(inventory);
  const home = byId(buildDependencyChecks(inventory.filter(item => item.propertyId === 'home')));
  const cabin = byId(buildDependencyChecks(inventory.filter(item => item.propertyId === 'cabin')));
  assert.equal(home.wellpump.backup, 'Generator');
  assert.equal(home.security.backup, 'Battery backup / power station');
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
  assert.equal(checks.waterFilter.backup, 'Purification tablets');
  assert.match(checks.waterFilter.fix, /label, expiry and treatment limits/);
  assert.equal(checks.furnace.fix, 'Wood stove is grid-independent.');
  assert.equal(checks.furnace.backup, null);
  assert.equal(checks.internet.backup, null);
  assert.equal(checks.septic.backup, null);
});

test('requires an actual generator record rather than fuel, its name or another power device', () => {
  const fuelOnly = byId(buildDependencyChecks([
    { category: 'fuel', subType: 'gasoline', name: 'Generator fuel', quantity: 25 },
    { category: 'power', subType: 'powerBank', quantity: 1 },
    { category: 'equipment', subType: 'generator', quantity: 1 },
  ]));
  for (const id of ['garage', 'wellpump', 'fridge', 'furnace', 'sump', 'medical']) assert.equal(fuelOnly[id].backup, null, id);
  const generator = byId(buildDependencyChecks([{ category: 'power', subType: 'generator', quantity: '1' }]));
  for (const id of ['garage', 'wellpump', 'fridge', 'furnace', 'sump', 'medical']) assert.equal(generator[id].backup, 'Generator', id);
  assert.match(generator.wellpump.fix, /recorded.*Check.*before relying/);
});

test('recognizes current solar records and preserves both electronics solar aliases', () => {
  for (const [category, subType] of [['power', 'solarPanel'], ['electronics', 'solarDevice'], ['electronics', 'solarGadget']]) {
    const checks = byId(buildDependencyChecks([{ category, subType, quantity: 1 }]));
    assert.equal(checks.wellpump.backup, 'Solar', `${category}/${subType}`);
    assert.match(checks.wellpump.fix, /recorded.*Check.*before relying/);
    assert.equal(checks.garage.backup, null);
  }
  for (const [category, subType] of [['electronics', 'solarPanel'], ['power', 'solarDevice'], ['batteries', 'solarCharger']]) {
    assert.equal(byId(buildDependencyChecks([{ category, subType, quantity: 1 }])).wellpump.backup, null, `${category}/${subType}`);
  }
});

test('power stations and UPS records suggest device backups without becoming spare cells or pump capacity', () => {
  for (const [subType, expected] of [['batteryBackup', 'Battery backup / power station'], ['ups', 'UPS']]) {
    const checks = byId(buildDependencyChecks([{ category: 'power', subType, quantity: 1 }]));
    for (const id of ['internet', 'security', 'medical']) assert.equal(checks[id].backup, expected, id);
    for (const id of ['wellpump', 'garage', 'sump', 'co_detector', 'stovefan']) assert.equal(checks[id].backup, null, id);
    assert.match(checks.medical.fix, /does not confirm compatibility/);
    assert.match(checks.internet.fix, /does not confirm.*internet provider/);
  }
});

test('loose cells remain replacement-battery records and chargers are not stored energy', () => {
  const cells = byId(buildDependencyChecks([{ category: 'batteries', subType: 'aa', quantity: 12 }]));
  assert.equal(cells.co_detector.backup, 'Replacement batteries');
  assert.equal(cells.stovefan.backup, 'Batteries');
  assert.equal(cells.security.backup, null);
  assert.equal(cells.medical.backup, null);
  const chargers = byId(buildDependencyChecks([
    { category: 'batteries', subType: 'battCharger', quantity: 1 },
    { category: 'batteries', subType: 'solarCharger', quantity: 1 },
  ]));
  assert.equal(chargers.co_detector.backup, null);
  assert.equal(chargers.stovefan.backup, null);
  assert.equal(chargers.security.backup, null);
});

test('zero, missing and invalid quantities never indicate a recorded backup', () => {
  const types = [
    ['power', 'generator'], ['power', 'solarPanel'], ['power', 'batteryBackup'], ['power', 'ups'],
    ['electronics', 'solarGadget'], ['electronics', 'solarDevice'], ['electronics', 'satPhone'],
    ['comms', 'radio'], ['batteries', 'aa'], ['water', 'purificationTablets'],
  ];
  for (const quantity of [0, '0', '', ' ', undefined, null, -1, '-2', NaN, Infinity, 'unknown', true]) {
    const checks = buildDependencyChecks(types.map(([category, subType]) => ({ category, subType, quantity })));
    assert.ok(checks.every(check => check.backup === null), String(quantity));
  }
});


test('dependency summary distinguishes unmatched checks from possible backups by priority', () => {
  const empty = summarizeDependencies(buildDependencyChecks([]));
  assert.equal(empty.total, 13);
  assert.equal(empty.missing, 13);
  assert.equal(empty.criticalMissing, 4);
  assert.equal(empty.possible, 0);
  const checks = buildDependencyChecks([{ category: 'power', subType: 'generator', quantity: 20 }]);
  const before = structuredClone(checks);
  const result = summarizeDependencies(checks);
  assert.equal(result.total, 13);
  assert.equal(result.possible, 6);
  assert.equal(result.missing, 7);
  assert.equal(result.criticalMissing, 1);
  assert.deepEqual(result.priorities[0], { id: 'critical', total: 4, missing: 1 });
  assert.equal(result.hiddenMissing, 6);
  assert.deepEqual(checks, before);
  assert.equal(summarizeDependencies(buildDependencyChecks([{ category: 'power', subType: 'generator', quantity: 0 }])).possible, 0);
});


test('purification devices and tablets retain their actual type without promising a gravity backup', () => {
  for (const subType of ['purificationDevice', 'filter']) {
    const device = byId(buildDependencyChecks([{ category: 'water', subType, quantity: 1 }])).waterFilter;
    assert.equal(device.backup, 'Purification device · check type');
    assert.match(device.fix, /does not confirm a non-electric backup/);
    assert.doesNotMatch(device.backup, /Gravity/);
  }
  const tablets = byId(buildDependencyChecks([{ category: 'water', subType: 'purificationTablets', quantity: 10 }])).waterFilter;
  assert.equal(tablets.backup, 'Purification tablets');
  assert.doesNotMatch(tablets.fix, /Gravity/);
  assert.equal(byId(buildDependencyChecks([{ category: 'water', subType: 'purificationDevice', quantity: 0 }])).waterFilter.backup, null);
});
