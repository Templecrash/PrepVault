import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPowerPlanning, computePowerCoverage } from '../src/power-planning.js';
import { computeEssentialCoverage } from '../src/essential-coverage.js';

const backup = (subType, runtimeHours, quantity = 1, fields = {}) => ({ category: 'power', subType, quantity, fields: { runtimeHours, ...fields } });
const row = (plan, label) => plan.rows.find(value => value.label === label);

test('battery backups and UPS use the same recorded runtime on Power and Overview', () => {
  for (const subType of ['batteryBackup', 'ups']) {
    const items = [backup(subType, '49.5', 5)];
    const coverage = computeEssentialCoverage(items).power;
    assert.deepEqual(coverage, computePowerCoverage(items));
    assert.equal(coverage.days, 2);
    const plan = buildPowerPlanning(items);
    assert.equal(plan.bigNum, '2');
    assert.equal(plan.bigUnit, 'full days');
    assert.equal(row(plan, 'Longest recorded runtime').value, '49.5 hours');
    assert.equal(row(plan, 'Backup equipment in stock').value, '1 entry');
  }
});

test('legacy and new backup types choose the longest entry without summing or quantity multiplication', () => {
  const items = [backup('generator', 72, 4), backup('powerBank', 48, 6), backup('batteryBackup', 96, 3), backup('ups', 12, 20)];
  const before = structuredClone(items);
  const plan = buildPowerPlanning(items);
  assert.equal(computeEssentialCoverage(items).power.days, 4);
  assert.equal(plan.bigNum, '4');
  assert.equal(row(plan, 'Longest recorded runtime').value, '96 hours');
  assert.equal(row(plan, 'Backup equipment in stock').value, '4 entries');
  assert.equal(row(plan, 'Runtime details').value, 'Recorded for every stocked backup');
  assert.deepEqual(items, before);
});

test('incomplete stocked backups retain known runtime but do not claim complete coverage', () => {
  const items = [backup('generator', 72), backup('batteryBackup', undefined), backup('ups', ''), backup('powerBank', undefined, 0)];
  const plan = buildPowerPlanning(items);
  assert.equal(computeEssentialCoverage(items).power.days, null);
  assert.equal(plan.bigNum, '—');
  assert.equal(row(plan, 'Longest recorded runtime').value, '72 hours');
  assert.equal(row(plan, 'Runtime details').value, '2 entries missing runtime');
  assert.equal(row(plan, 'Recorded backup coverage').value, 'Not available');
  assert.match(plan.summary, /every stocked backup/);
});

test('missing, out-of-stock and explicitly zero runtime remain distinct', () => {
  assert.equal(buildPowerPlanning([]).bigNum, '—');
  assert.equal(computePowerCoverage([backup('batteryBackup', undefined, 0)]).days, 0);
  assert.equal(buildPowerPlanning([backup('batteryBackup', undefined, 0)]).bigNum, '0');
  const zero = buildPowerPlanning([backup('ups', 0)]);
  assert.equal(zero.bigNum, '0');
  assert.equal(row(zero, 'Longest recorded runtime').value, '0 hours');
  assert.equal(row(zero, 'Runtime details').value, 'Recorded for every stocked backup');
  assert.equal(computePowerCoverage([backup('ups', 23.9)]).days, 0);
  assert.equal(computePowerCoverage([backup('batteryBackup', 72), backup('ups', undefined, 0)]).days, 3);
});

test('invalid recorded runtimes never become zero or invented days through coercion', () => {
  for (const runtime of [undefined, null, '', '  ', false, true, [], [72], {}, -1, NaN, Infinity, 'unknown']) {
    const items = [backup('generator', 72), backup('batteryBackup', runtime)];
    assert.equal(computePowerCoverage(items).days, null);
    assert.equal(row(buildPowerPlanning(items), 'Runtime details').value, '1 entry missing runtime');
  }
  for (const quantity of [undefined, null, '', '  ', false, true, [], [1], {}, -1, NaN, Infinity]) {
    assert.equal(computePowerCoverage([{ ...backup('ups', 1000), quantity }, backup('generator', 48)]).days, 2);
  }
});

test('solar ratings are nameplate watts only and never infer energy or backup duration', () => {
  const items = [
    { category: 'power', subType: 'solarPanel', quantity: 2, fields: { watts: 400, runtimeHours: 1000 } },
    { category: 'power', subType: 'solarPanel', quantity: 3, fields: { watts: '100' } },
    { category: 'power', subType: 'solarPanel', quantity: 0, fields: { watts: 99999 } },
    { category: 'fuel', subType: 'gasoline', quantity: 100, fields: { runtimeHours: 1000 } },
    { category: 'batteries', subType: 'aa', quantity: 500, fields: { runtimeHours: 1000 } },
  ];
  const plan = buildPowerPlanning(items);
  assert.equal(plan.bigNum, '—');
  assert.equal(computeEssentialCoverage(items).power.days, null);
  assert.equal(row(plan, 'Recorded solar rating').value, '1,100 W');
  assert.match(row(plan, 'Recorded solar rating').note, /not energy produced or backup runtime/);
  assert.equal(row(plan, 'Backup equipment in stock').value, '0 entries');
  for (const subType of ['generator', 'powerBank', 'batteryBackup', 'ups']) {
    assert.equal(computePowerCoverage([...items, backup(subType, undefined, 1, { watts: 5000, capacityWh: 2000, plannedLoadWatts: 100 })]).days, null);
  }
});

test('solar summaries disclose incomplete ratings instead of displaying them as zero output', () => {
  const missing = { category: 'power', subType: 'solarPanel', quantity: 2, fields: {} };
  const known = { category: 'power', subType: 'solarPanel', quantity: 3, fields: { watts: 200 } };
  const incomplete = row(buildPowerPlanning([known, missing]), 'Recorded solar rating');
  assert.equal(incomplete.value, '600 W');
  assert.match(incomplete.note, /1 entry missing a valid panel rating and excluded/);
  assert.equal(row(buildPowerPlanning([missing]), 'Recorded solar rating').value, 'Not recorded');
  assert.equal(row(buildPowerPlanning([]), 'Recorded solar rating').value, 'None in stock');
  const zero = { ...known, fields: { watts: 0 } };
  assert.equal(row(buildPowerPlanning([zero]), 'Recorded solar rating').value, '0 W');
});
