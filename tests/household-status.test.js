import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPeopleStatus, peopleRecordMatches, buildBugOutStatus, buildFarmStatus, buildSoilStatus, buildCompostStatus, livestockRecordStatus, compostRecordStatus } from '../src/household-status.js';

test('people charts count recorded details and explicit dependants without inferring check-ins or skills', () => {
  const people = [{ phone: '555-1234', role: 'Driver', isDependant: true }, { phone: '  unknown ', role: '', isDependant: 'true', skills: 'Medic', lastCheckIn: 'today' }, { phone: 'Radio channel 2', role: 'Medic', isDependant: false }];
  const before = structuredClone(people);
  assert.deepEqual(buildPeopleStatus(people), { total: 3, contact: 2, missingContact: 1, role: 2, missingRole: 1, dependants: 1, others: 2 });
  assert.equal(people.filter(person => peopleRecordMatches(person, 'no-contact')).length, 1);
  assert.equal(people.filter(person => peopleRecordMatches(person, 'no-role')).length, 1);
  assert.equal(people.filter(person => peopleRecordMatches(person, 'dependants')).length, 1);
  assert.equal(people.filter(person => peopleRecordMatches(person, 'other')).length, 2);
  assert.deepEqual(people, before);
});

test('empty directories and placeholder details never imply completeness', () => {
  assert.equal(buildPeopleStatus([]).total, 0);
  const people = [undefined, null, {}, ...['', ' ', 'None', 'n/a', 'Not recorded', 'TBD', '-'].map(phone => ({ phone, role: phone }))];
  const result = buildPeopleStatus(people);
  assert.equal(result.contact, 0); assert.equal(result.role, 0); assert.equal(result.missingContact, result.total);
});

test('Bug Out counts collection progress independently from detail completeness and source stock', () => {
  const entries = [
    { id: 'one', grabbed: true, quantity: '1 bag', location: 'Hall', assignee: 'Pat', inventoryId: 'water' },
    { id: 'two', grabbed: false, quantity: '2 bottles', location: 'Shelf', assignee: '', inventoryId: 'empty' },
    { id: 'three', grabbed: false, quantity: '1', location: 'Car', assignee: 'Pat', inventoryId: 'unknown' },
    { id: 'four', grabbed: false, inventoryId: 'deleted' },
    { id: 'five', grabbed: 'true', quantity: '1 kit', location: 'TBD', assignee: 'Pat' },
  ];
  const items = [{ id: 'water', quantity: 100 }, { id: 'empty', quantity: 0 }, { id: 'unknown', quantity: '' }];
  const before = structuredClone({ entries, items });
  assert.deepEqual(buildBugOutStatus(entries, items), { total: 5, grabbed: 1, remaining: 4, detailed: 2, missingDetails: 3, inStock: 1, outOfStock: 1, unknownStock: 1, missingLink: 1, custom: 1 });
  assert.deepEqual({ entries, items }, before);
});

test('custom and starter checklist entries are never treated as owned or packed stock', () => {
  const result = buildBugOutStatus([{ name: 'First aid', quantity: 'One kit', grabbed: false }, { name: 'Water', quantity: 'Your supply', grabbed: false }]);
  assert.equal(result.custom, 2); assert.equal(result.inStock, 0); assert.equal(result.grabbed, 0); assert.equal(result.missingDetails, 2);
  for (const quantity of [undefined, null, ' ', false, [], {}, -1, Infinity]) {
    assert.equal(buildBugOutStatus([{ inventoryId: 's' }], [{ id: 's', quantity }]).unknownStock, 1);
  }
});

test('garden layout counts unique valid occupied cells without treating seed quantities as plants', () => {
  const gardenBeds = [{ width: '2', height: 2, cells: [{ x: 0, y: 0, cropId: 'peas' }, { x: 0, y: 0, cropId: 'peas' }, { x: 1, y: 1, cropId: 'unknown-crop' }, { x: 2, y: 1, cropId: 'carrots' }, { x: -1, y: 0, cropId: 'peas' }, { x: 0, y: 1 }] }, { width: '', height: 4, cells: [{ x: 0, y: 0, cropId: 'peas' }] }];
  const items = [{ category: 'farm', subType: 'seedPacket', quantity: 1000 }];
  const before = structuredClone({ gardenBeds, items });
  const result = buildFarmStatus({ gardenBeds, items });
  assert.deepEqual(result.garden, { beds: 2, knownBeds: 1, unknownBeds: 1, totalCells: 4, plantedCells: 2, emptyCells: 2, ignoredCells: 3 });
  assert.deepEqual(result.seeds, { total: 1, stocked: 1, empty: 0, unknown: 0 });
  assert.deepEqual({ gardenBeds, items }, before);
});

test('seed chart separates recorded zero from missing quantity and ignores unrelated farm supplies', () => {
  const items = [
    { category: 'farm', subType: 'seedPacket', quantity: '4' }, { category: 'farm', subType: 'seedling', quantity: 0 },
    { category: 'farm', subType: 'seedPacket', quantity: '' }, { category: 'farm', subType: 'seedling', quantity: true },
    { category: 'farm', subType: 'fertilizer', quantity: 20 }, { category: 'food', subType: 'seedPacket', quantity: 20 },
  ];
  assert.deepEqual(buildFarmStatus({ items }).seeds, { total: 4, stocked: 1, empty: 1, unknown: 2 });
});

test('livestock feed and health flags count groups once and missing records remain unknown', () => {
  const livestock = [
    { count: 10, status: 'healthy', feedStockDays: 30, feedType: 'Pellets', feedLbsPerDay: 0.25 },
    { count: 4, status: 'sick', feedStockDays: 0 },
    { count: '2', status: 'pregnant', feedStockDays: '7' },
    { count: 2, status: 'healthy', feedStockDays: '' },
    { count: 0, status: 'healthy', feedStockDays: 90 },
    { count: 1, status: '', feedStockDays: 90 },
  ];
  assert.deepEqual(buildFarmStatus({ livestock }).animals, { total: 6, attention: 2, recorded: 1, unknown: 3, lowFeed: 2, sick: 1 });
  const empty = buildFarmStatus();
  assert.equal(empty.garden.totalCells, 0); assert.equal(empty.seeds.total, 0); assert.equal(empty.animals.total, 0);
});

test('livestock rows and charts share unknown-versus-zero feed and headcount rules', () => {
  const complete = { count: 2, status: 'healthy', feedType: 'Stored feed', feedLbsPerDay: 0.5, feedStockDays: 30 };
  assert.equal(livestockRecordStatus(complete).totalFeed, 1);
  assert.equal(livestockRecordStatus(complete).state, 'recorded');
  for (const field of ['count', 'feedLbsPerDay', 'feedStockDays']) {
    for (const value of [undefined, null, '', '  ', false, [], {}, -1, Infinity]) {
      const animal = { ...complete, [field]: value };
      const status = livestockRecordStatus(animal);
      assert.equal(status.state, 'unknown', `${field}: ${String(value)}`);
      assert.equal(buildFarmStatus({ livestock: [animal] }).animals.unknown, 1);
      assert.equal(status.lowFeed, false);
      if (field === 'feedStockDays') assert.equal(status.feedDays, null);
      else assert.equal(status.totalFeed, null);
    }
  }
  assert.equal(livestockRecordStatus({ ...complete, count: 0 }).count, 0);
  assert.equal(livestockRecordStatus({ ...complete, count: 0 }).totalFeed, 0);
  assert.equal(livestockRecordStatus({ ...complete, count: 0 }).state, 'unknown');
  assert.equal(livestockRecordStatus({ ...complete, count: 1.5 }).count, null);
  assert.equal(livestockRecordStatus({ ...complete, feedLbsPerDay: 0 }).totalFeed, 0);
  assert.equal(livestockRecordStatus({ ...complete, feedLbsPerDay: 0 }).state, 'recorded');
  assert.equal(livestockRecordStatus({ ...complete, feedStockDays: 0 }).lowFeed, true);
  assert.equal(livestockRecordStatus({ ...complete, feedStockDays: 0 }).state, 'attention');
  assert.equal(livestockRecordStatus({ ...complete, feedType: '' }).state, 'unknown');
  assert.equal(livestockRecordStatus({ ...complete, status: 'unknown' }).state, 'unknown');
});

test('soil completeness and averages exclude absent and invalid readings while retaining measured zero', () => {
  const tests = [{ ph: '6', moisture: '40' }, { ph: '', moisture: null }, { ph: 0, moisture: 0 }, { ph: 15, moisture: 101 }, { ph: true, moisture: [] }];
  assert.deepEqual(buildSoilStatus(tests), { total: 5, phRecorded: 2, moistureRecorded: 2, averagePh: 3, averageMoisture: 20 });
  assert.equal(buildSoilStatus([]).averagePh, null);
  assert.equal(buildSoilStatus([{ ph: '' }]).averageMoisture, null);
});

test('compost turning follows recorded intervals, ignores finished bins and treats invalid or future dates as unknown', () => {
  const bins = [
    { stage: 'active', lastTurned: '2026-10-22', turningFreqDays: 7 },
    { stage: 'fresh', lastTurned: '2026-10-28', turningFreqDays: 7 },
    { stage: 'curing', lastTurned: '2026-10-30', turningFreqDays: 7 },
    { stage: 'active', lastTurned: '', turningFreqDays: 7 },
    { stage: 'active', lastTurned: '2026-02-30', turningFreqDays: 7 },
    { stage: 'finished', lastTurned: '2025-01-01', turningFreqDays: 1 },
    { stage: 'unknown', lastTurned: '2026-10-01', turningFreqDays: 0 },
  ];
  const before = structuredClone(bins);
  assert.deepEqual(buildCompostStatus(bins, new Date('2026-10-29T12:00:00Z')), { total: 7, fresh: 1, active: 3, curing: 1, finished: 1, unknownStage: 1, turningTotal: 6, current: 1, due: 1, unknownTurning: 4 });
  assert.deepEqual(bins, before);
  assert.equal(buildCompostStatus([], new Date('2026-10-29T12:00:00Z')).turningTotal, 0);
});

test('compost rows and chart do not invent a seven-day schedule when an interval is missing', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  for (const interval of [undefined, null, '', false, 0, -1]) {
    const bin = { stage: 'active', lastTurned: '2026-10-01', turningFreqDays: interval };
    const status = compostRecordStatus(bin, now);
    assert.equal(status.turning, 'unknownTurning'); assert.equal(status.interval, null); assert.equal(status.days, 28);
    assert.equal(buildCompostStatus([bin], now).unknownTurning, 1);
    assert.equal(buildCompostStatus([bin], now).due, 0);
  }
});
