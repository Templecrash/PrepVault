import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  isVehicleRecord, linkVehicleSupply, prepareVehicleUpdate, recordVehicleService,
  splitVehicleInventory, vehicleServiceStatus, vehicleSupplyQuantity, vehicleTankSummary,
} from '../src/vehicles.js';

const now = new Date('2026-10-28T12:00:00');
const vehicle = { id: 'truck-1', name: 'Truck', category: 'vehicles', subType: 'truck', quantity: 1, propertyId: 'prop1', fields: { mileage: 68000, mileageUnit: 'mi', vMake: 'Ford', nextService: '2026-11-01', privateNote: 'Keep this', lastOilChange: '2026-09-01' } };
const service = { date: '2026-10-28', summary: 'Checked brakes', odometer: 68200, odometerUnit: 'mi', hours: '', nextService: '2027-04-01', nextServiceMileage: 73000, nextServiceHours: '' };

test('fleet separates vehicles, parts and shared fuel without rewriting inventory', () => {
  const items = [vehicle, { ...vehicle, id: 'bike', subType: 'bicycle' }, { ...vehicle, id: 'boat', subType: 'boat' }, ...['spareParts', 'fluids', 'tires', 'sparkPlug', 'engineOil', 'battery', 'toolkit'].map(subType => ({ ...vehicle, id: subType, subType })), { id: 'gas', category: 'fuel', subType: 'gasoline', quantity: 20 }, { id: 'food', category: 'food' }];
  const before = structuredClone(items);
  const result = splitVehicleInventory(items);
  assert.equal(result.vehicles.length, 3);
  assert.equal(result.parts.length, 7);
  assert.equal(result.fuel.length, 1);
  assert.equal(result.vehicles[0], vehicle);
  assert.equal(isVehicleRecord({ category: 'boat', subType: 'outboard' }), false);
  assert.deepEqual(items, before);
});

test('supply quantities use the saved quantity once and retain their recorded unit', () => {
  const categories = { fuel: { subTypes: { gasoline: { unit: 'gal' }, propane: { unit: 'tanks' } } }, vehicles: { subTypes: { engineOil: { unit: 'containers' } } } };
  assert.deepEqual(vehicleSupplyQuantity({ category: 'fuel', subType: 'gasoline', quantity: 40, fields: { gallons: 40 } }, categories), { quantity: 40, unit: 'gal', label: '40 gal' });
  assert.equal(vehicleSupplyQuantity({ category: 'fuel', subType: 'propane', quantity: 2 }, categories).label, '2 tanks');
  assert.equal(vehicleSupplyQuantity({ category: 'vehicles', subType: 'engineOil', quantity: 3, fields: { gallons: 5 } }, categories).label, '3 containers');
  assert.equal(vehicleSupplyQuantity({ quantity: 0 }).label, '0 items');
  assert.equal(vehicleSupplyQuantity({ quantity: ' ' }).label, 'Not recorded');
});

test('service status checks dates without turning invalid or missing records into overdue work', () => {
  assert.equal(vehicleServiceStatus(vehicle, now).status, 'soon');
  assert.equal(vehicleServiceStatus({ fields: { nextService: '2026-10-28' } }, now).status, 'due');
  assert.equal(vehicleServiceStatus({ fields: { nextService: '2026-10-27' } }, now).daysUntil, -1);
  assert.equal(vehicleServiceStatus({ fields: { nextService: '2026-11-27' } }, now).status, 'soon');
  assert.equal(vehicleServiceStatus({ fields: { nextService: '2026-11-28' } }, now).status, 'scheduled');
  for (const nextService of ['2026-02-30', '2026-13-01', '10/28/2026', '', null]) assert.equal(vehicleServiceStatus({ fields: { nextService } }, now).status, 'unrecorded');
});

test('service date thresholds stay on the local calendar date around DST', () => {
  const script = "import { vehicleServiceStatus } from './src/vehicles.js'; console.log(JSON.stringify(vehicleServiceStatus({fields:{nextService:'2026-03-09'}},new Date(2026,2,7,12)).daysUntil));";
  for (const timezone of ['America/Toronto', 'America/Los_Angeles', 'Pacific/Auckland']) {
    assert.equal(JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' })), 2, timezone);
  }
});

test('meter reminders require real readings and a known distance unit', () => {
  assert.equal(vehicleServiceStatus({ fields: { mileage: 2000, mileageUnit: 'km', nextServiceMileage: 2000 } }, now).status, 'due');
  assert.equal(vehicleServiceStatus({ fields: { mileage: 2000, nextServiceMileage: 1000 } }, now).status, 'scheduled');
  assert.match(vehicleServiceStatus({ fields: { mileage: 2000, nextServiceMileage: 1000 } }, now).reasons[0], /distance unit/);
  assert.equal(vehicleServiceStatus({ fields: { hoursOnEngine: 500, nextServiceHours: 500 } }, now).status, 'due');
  for (const invalid of [null, '', ' ', [], {}, true, -1, Infinity]) {
    assert.equal(vehicleServiceStatus({ fields: { hoursOnEngine: invalid, nextServiceHours: 0 } }, now).status, 'scheduled');
    assert.equal(vehicleServiceStatus({ fields: { hoursOnEngine: 300, nextServiceHours: invalid } }, now).status, 'unrecorded');
  }
});

test('tank readings use explicit units and distinguish empty from unknown', () => {
  assert.deepEqual(vehicleTankSummary({ fields: { tankFuel: 0, tankCapacity: 50, fuelUnit: 'L' } }), { current: 0, capacity: 50, unit: 'L', percent: 0 });
  assert.equal(vehicleTankSummary({ fields: { tankFuel: 25, tankCapacity: 50, fuelUnit: 'US gal' } }).percent, 50);
  assert.equal(vehicleTankSummary({ fields: { tankFuel: 25, tankCapacity: 50, fuelUnit: 'Imp gal' } }).percent, 50);
  for (const fields of [{ tankFuel: 25, tankCapacity: 50 }, { tankFuel: 25, tankCapacity: 50, fuelUnit: 'gal' }, { tankFuel: '', tankCapacity: 50, fuelUnit: 'L' }, { tankFuel: ' ', tankCapacity: 50, fuelUnit: 'L' }, { tankFuel: [], tankCapacity: 50, fuelUnit: 'L' }, { tankFuel: 60, tankCapacity: 50, fuelUnit: 'L' }, { tankFuel: 0, tankCapacity: 0, fuelUnit: 'L' }]) assert.equal(vehicleTankSummary({ fields }).percent, null);
});

test('vehicle detail edits retain quantity, compatibility fields and other records without mutating input', () => {
  const before = structuredClone(vehicle);
  const draft = { tankFuel: '20', tankCapacity: '80', fuelUnit: 'L', fuelType: ' Diesel ', empProtection: 'planned', empProtectionNotes: 'Review storage options', emergencyEquipment: ['first-aid', 'paper-map', 'paper-map'], lastServiceDate: '2026-10-01' };
  const updated = prepareVehicleUpdate(vehicle, draft, now);
  assert.equal(updated.quantity, vehicle.quantity);
  assert.equal(updated.fields.privateNote, 'Keep this');
  assert.equal(updated.fields.vMake, 'Ford');
  assert.equal(updated.fields.tankFuel, 20);
  assert.equal(updated.fields.fuelType, 'Diesel');
  assert.deepEqual(updated.fields.emergencyEquipment, ['first-aid', 'paper-map']);
  assert.deepEqual(vehicle, before);
  assert.equal(draft.tankFuel, '20');
});

test('vehicle detail editing rejects invalid dates, negative amounts and impossible tank contents', () => {
  for (const draft of [{ tankFuel: -1 }, { tankFuel: [] }, { tankFuel: ' ' }, { tankFuel: 20, tankCapacity: 10, fuelUnit: 'L' }, { tankFuel: 2, fuelUnit: 'gal' }, { tankFuel: 2 }, { lastServiceDate: '2026-02-30' }, { lastServiceDate: '2026-10-29' }, { nextService: '28/10/2026' }, { mileageUnit: 'meters' }, { empProtection: 'guaranteed' }, { emergencyEquipment: ['unknown'] }, { emergencyEquipment: 'first-aid' }]) assert.throws(() => prepareVehicleUpdate(vehicle, draft, now), undefined, JSON.stringify(draft));
  assert.throws(() => prepareVehicleUpdate({ ...vehicle, subType: 'fluids' }, {}, now), /saved vehicle/);
  const cleared = prepareVehicleUpdate(vehicle, { nextService: '', nextServiceMileage: '' }, now);
  assert.equal(cleared.fields.nextService, '');
  assert.equal(cleared.fields.nextServiceMileage, '');
});

test('completed service appends a record, advances meters and replaces explicit future reminders', () => {
  const before = structuredClone(vehicle);
  const result = recordVehicleService(vehicle, { ...service, oilChanged: true }, { id: 'service-1', now });
  assert.equal(result.fields.lastServiceDate, '2026-10-28');
  assert.equal(result.fields.lastOilChange, '2026-10-28');
  assert.equal(result.fields.mileage, 68200);
  assert.equal(result.fields.nextService, '2027-04-01');
  assert.equal(result.fields.nextServiceMileage, 73000);
  assert.equal(result.fields.vehicleServiceLog.length, 1);
  assert.equal(result.fields.vehicleServiceLog[0].oilChanged, true);
  assert.equal(result.fields.vehicleServiceLog[0].id, 'service-1');
  assert.equal(result.fields.privateNote, 'Keep this');
  assert.equal(result.quantity, 1);
  assert.deepEqual(vehicle, before);
  const cleared = recordVehicleService(result, { ...service, date: '2026-10-28', nextService: '', nextServiceMileage: '', odometer: 68100 }, { id: 'service-2', now });
  assert.equal(cleared.fields.mileage, 68200, 'an older service meter reading must not reduce the current odometer');
  assert.equal(cleared.fields.nextService, '');
});

test('historical service is preserved without replacing the latest service, schedule or meter readings', () => {
  const current = recordVehicleService(vehicle, { ...service, oilChanged: true }, { id: 'new', now });
  const historical = recordVehicleService(current, { ...service, date: '2026-09-15', odometer: 67000, nextService: '2026-10-01', oilChanged: true }, { id: 'old', now });
  assert.equal(historical.fields.vehicleServiceLog.length, 2);
  assert.equal(historical.fields.lastServiceDate, '2026-10-28');
  assert.equal(historical.fields.nextService, '2027-04-01');
  assert.equal(historical.fields.mileage, 68200);
  assert.equal(historical.fields.lastOilChange, '2026-10-28');
  const oilOnly = recordVehicleService({ ...vehicle, fields: { ...vehicle.fields, lastServiceDate: '2026-10-20' } }, { ...service, date: '2026-10-01', oilChanged: true }, { id: 'older-oil', now });
  assert.equal(oilOnly.fields.lastServiceDate, '2026-10-20');
  assert.equal(oilOnly.fields.lastOilChange, '2026-10-01');
});

test('service log rejects missing identity, repeated records, future work and contradictory meters', () => {
  assert.throws(() => recordVehicleService(vehicle, service, { now }), /unique service/);
  for (const patch of [{ date: '' }, { date: '2026-10-29' }, { date: '2026-02-30' }, { summary: ' ' }, { odometer: -1 }, { nextService: '2026-10-01' }, { nextServiceMileage: 100 }, { hours: 50, nextServiceHours: 20 }, { odometerUnit: 'km' }, { odometer: '', odometerUnit: 'km', nextServiceMileage: 80000 }]) assert.throws(() => recordVehicleService(vehicle, { ...service, ...patch }, { id: 'one', now }), undefined, JSON.stringify(patch));
  const saved = recordVehicleService(vehicle, service, { id: 'same', now });
  assert.throws(() => recordVehicleService(saved, service, { id: 'same', now }), /already saved/);
  assert.throws(() => recordVehicleService({ ...vehicle, fields: { vehicleServiceLog: [null] } }, service, { id: 'two', now }), /invalid entry/);
  assert.throws(() => recordVehicleService({ ...vehicle, fields: { vehicleServiceLog: {} } }, service, { id: 'two', now }), /needs repair/);
});

test('linking supplies validates identity and property while preserving quantities and legacy compatibility', () => {
  const item = { id: 'part', category: 'vehicles', subType: 'sparkPlug', quantity: 8, fields: { partFor: 'F-250', partDesc: 'Part ABC' } };
  const linked = linkVehicleSupply(item, vehicle.id, [vehicle]);
  assert.equal(linked.fields.vehicleId, vehicle.id);
  assert.equal(linked.quantity, 8);
  assert.equal(linked.fields.partFor, 'F-250');
  assert.equal(item.fields.vehicleId, undefined);
  assert.equal(linkVehicleSupply(linked, '', [vehicle]).fields.vehicleId, '');
  assert.throws(() => linkVehicleSupply(item, 'missing', [vehicle]), /at this property/);
  assert.throws(() => linkVehicleSupply(item, vehicle.id, [{ ...vehicle, propertyId: 'prop2' }]), /at this property/);
  assert.throws(() => linkVehicleSupply({ ...item, propertyId: 'prop2' }, vehicle.id, [{ ...vehicle, propertyId: undefined }]), /at this property/);
  assert.throws(() => linkVehicleSupply(vehicle, vehicle.id, [vehicle]), /Only fuel/);
  assert.throws(() => linkVehicleSupply({ ...item, category: 'food' }, vehicle.id, [vehicle]), /Only fuel/);
  assert.equal(linkVehicleSupply({ ...item, category: 'fuel', subType: 'gasoline' }, vehicle.id, [vehicle]).fields.vehicleId, vehicle.id);
});


test('unrelated edits preserve legacy readings without forcing a guessed unit', () => {
  const legacy = { ...vehicle, fields: { mileage: '68000', tankFuel: '20', tankCapacity: '60', nextService: '2026-11-01' } };
  const updated = prepareVehicleUpdate(legacy, { mileage: '68000', mileageUnit: '', tankFuel: '20', tankCapacity: '60', fuelUnit: '', empProtection: 'planned' }, now);
  assert.equal(updated.fields.empProtection, 'planned');
  assert.equal(updated.fields.mileageUnit, '');
  assert.equal(vehicleTankSummary(updated).percent, null);
  assert.throws(() => prepareVehicleUpdate(legacy, { mileage: 69000 }, now), /kilometres or miles/);
  assert.throws(() => prepareVehicleUpdate(legacy, { tankFuel: 21 }, now), /litres/);
  assert.throws(() => prepareVehicleUpdate(vehicle, { mileageUnit: '' }, now), /kilometres or miles/);
});
