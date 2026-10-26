import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRationing } from '../src/rationing.js';
import {
  CONVERSIONS, computeResourcePools, buildResourceRows, buildResourceSystems,
  buildStockConversions, computeResourceTradeoff,
} from '../src/resource-planning.js';

const climate = { label: 'Temperate', firewoodMod: 1 };
const item = (category, subType, quantity, fields = {}) => ({ category, subType, quantity, fields });
const byId = (values, id) => values.find(value => value.id === id);

test('resource food and water use the same recorded stock as Rationing', () => {
  const items = [
    item('food', 'rice', 2, { calories: '600', servings: '3' }),
    item('food', 'cannedGoods', 0, { calories: '900', servings: '50' }),
    item('food', 'freezeDried', 10, { calories: '300' }),
    item('water', 'storedWater', 20, { capacity: '55' }),
  ];
  const rationing = computeRationing(items, 4, 2000);
  const pools = computeResourcePools(items, 4, climate);
  const rows = buildResourceRows(items, 4, climate);
  assert.equal(pools.totalCals, 3600);
  assert.equal(pools.totalCals, rationing.totalCalories);
  assert.equal(pools.waterGals, rationing.totalWaterGal);
  assert.equal(byId(rows, 'food').days, 3600 / 8000);
  assert.equal(byId(rows, 'water').days, 5);
});

test('gallons and cords are counted once from their recorded quantity', () => {
  const items = [
    item('fuel', 'gasoline', 25, { gallons: '25' }),
    item('fuel', 'gasoline', 0, { gallons: '50' }),
    item('firewood', 'cordwood', 4, { cords: '4' }),
    item('firewood', 'cordwood', 0, { cords: '10' }),
    item('firewood', 'kindling', 5),
  ];
  const pools = computeResourcePools(items, 4, climate);
  assert.equal(pools.fuelGals, 25);
  assert.equal(pools.firewoodCords, 4);
  assert.equal(byId(buildResourceRows(items, 4, climate), 'gasoline').qty, '25.0');
  assert.equal(byId(buildResourceRows(items, 4, climate), 'firewood').qty, '4.0');
});

test('zero-stock records cannot become reserves or present system components', () => {
  const items = [
    item('food', 'cannedGoods', 0, { calories: '600', servings: '3' }),
    item('fuel', 'gasoline', 0, { gallons: '25' }),
    item('fuel', 'propane', 0), item('water', 'storedWater', 0),
    item('firewood', 'cordwood', 0, { cords: '4' }),
    item('water', 'purificationDevice', 0), item('water', 'purificationTablets', 0),
    item('batteries', 'aa', 0), item('power', 'solarPanel', 0),
    item('electronics', 'cellPhone', 0), item('comms', 'radio', 0),
    item('electronics', 'satPhone', 0), item('farm', 'seedPacket', 0),
    item('fishing', 'rod', 0), item('firearms', 'ammo', 0),
  ];
  const pools = computeResourcePools(items, 4, climate);
  for (const key of ['fuelGals', 'propaneGals', 'waterGals', 'firewoodCords', 'batteries', 'solarPanels', 'totalCals', 'totalKwh']) assert.equal(pools[key], 0, key);
  const systems = buildResourceSystems(items, pools);
  assert.equal(byId(byId(systems, 'water').nodes, 'filtration').status, 'red');
  assert.equal(byId(byId(systems, 'water').nodes, 'purification').val, 0);
  assert.equal(byId(byId(systems, 'power').nodes, 'inverter').val, 'No');
  for (const id of ['primary', 'secondary', 'tertiary']) assert.equal(byId(byId(systems, 'comms').nodes, id).status, 'red');
  for (const id of ['production', 'protein', 'preservation']) assert.equal(byId(byId(systems, 'food').nodes, id).val, 0);
});

test('system map recognizes the actual purification and canned-food schema', () => {
  const items = [item('water', 'purificationDevice', 2), item('food', 'cannedGoods', 3, { calories: 100, servings: 2 })];
  const systems = buildResourceSystems(items, computeResourcePools(items, 4, climate));
  assert.equal(byId(byId(systems, 'water').nodes, 'filtration').val, 2);
  assert.equal(byId(byId(systems, 'water').nodes, 'filtration').status, 'green');
  assert.equal(byId(byId(systems, 'food').nodes, 'preservation').val, 3);
  assert.equal(byId(byId(systems, 'food').nodes, 'preservation').status, 'green');
});

test('propane heat conversion and the reverse trade-off use consistent BTU/kWh units', () => {
  const items = [item('fuel', 'propane', 1)];
  const pools = computeResourcePools(items, 4, climate);
  const thermalKwh = 4.6 * 91452 / 3412;
  assert.ok(Math.abs(pools.propaneKwh - thermalKwh) < 1e-9);
  const result = computeResourceTradeoff(items, pools, 'heat', 'power', 50);
  const generatedKwh = thermalKwh * 0.5 * 0.25;
  assert.ok(Math.abs((result.toNewDays - result.toOrigDays) * 2 - generatedKwh) < 1e-9);
  assert.equal(result.toGain, `+${generatedKwh.toFixed(1)} kWh generated`);
  assert.match(CONVERSIONS.kwh_heat.equiv, /0\.67 hrs/);
  assert.equal(CONVERSIONS.kwh_heat.rate, 0.67);
});

test('thermal propane is excluded from the electric pool until explicitly converted', () => {
  const gasAndBattery = [item('fuel', 'gasoline', 25), item('batteries', 'aa', 20)];
  const baseline = computeResourcePools(gasAndBattery, 4, climate);
  const withPropane = computeResourcePools([...gasAndBattery, item('fuel', 'propane', 3)], 4, climate);
  assert.equal(withPropane.totalKwh, baseline.totalKwh);
  assert.equal(withPropane.totalKwh, withPropane.genKwh + withPropane.batteryKwh);
  assert.ok(withPropane.propaneKwh > 0);

  const propaneOnly = [item('fuel', 'propane', 1)];
  const pools = computeResourcePools(propaneOnly, 4, climate);
  assert.equal(pools.totalKwh, 0);
  const result = computeResourceTradeoff(propaneOnly, pools, 'heat', 'power', 50);
  assert.equal(result.toOrigDays, 0);
  assert.ok(Math.abs(result.toNewDays * 2 - pools.propaneKwh * 0.5 * 0.25) < 1e-9);
});

test('conversion labels describe household days and state illustrative equipment assumptions', () => {
  const items = [item('water', 'storedWater', 20), item('firewood', 'cordwood', 2)];
  const pools = computeResourcePools(items, 4, climate);
  assert.equal(byId(buildStockConversions(pools), 'water').conv, '5.0 household days');
  const rows = buildResourceRows(items, 4, { ...climate, firewoodMod: 2 });
  assert.equal(byId(rows, 'firewood').days, 60);
  assert.match(byId(rows, 'firewood').detail, /not adjusted for climate/);
  assert.match(byId(rows, 'power').detail, /AA cell/);
  assert.match(CONVERSIONS.solar_100w.equiv, /100W panel/);
});
