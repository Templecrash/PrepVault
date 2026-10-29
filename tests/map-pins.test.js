import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPointCoordinates, normalizeMapPick, routeMapPoints, routePointLabel } from '../src/map-pins.js';

test('draft coordinates accept real zeroes and numeric strings without turning blanks into zero', () => {
  assert.deepEqual(mapPointCoordinates({ latitude: '0', longitude: '0' }), { latitude: 0, longitude: 0 });
  assert.deepEqual(mapPointCoordinates({ latitude: ' 45.123 ', longitude: '-79.1' }), { latitude: 45.123, longitude: -79.1 });
  for (const value of ['', ' ', null, undefined, false, '0x10', 'bad', Infinity]) assert.equal(mapPointCoordinates({ latitude: value, longitude: 0 }), null);
  assert.equal(mapPointCoordinates({ latitude: 86, longitude: 0 }), null);
  assert.equal(mapPointCoordinates({ latitude: 45, longitude: 181 }), null);
});

test('map clicks normalize the antimeridian and stay within the planner Mercator limits', () => {
  assert.deepEqual(normalizeMapPick({ lat: 45, lng: 181 }), { latitude: 45, longitude: -179 });
  assert.deepEqual(normalizeMapPick({ lat: -20, lng: -541 }), { latitude: -20, longitude: 179 });
  assert.deepEqual(normalizeMapPick({ lat: 85.05112878, lng: 540 }), { latitude: 85, longitude: -180 });
  assert.deepEqual(normalizeMapPick({ lat: -90, lng: 0 }), { latitude: -85, longitude: 0 });
  assert.deepEqual(normalizeMapPick({ latitude: '0', longitude: '360' }), { latitude: 0, longitude: 0 });
  assert.equal(normalizeMapPick({ lat: '', lng: 0 }), null);
  assert.equal(normalizeMapPick({ lat: 0, lng: Infinity }), null);
});

test('pin labels preserve unplaced point indices instead of relabelling the destination', () => {
  const points = [{ id: 'start', latitude: '', longitude: '' }, { id: 'via1', latitude: '0', longitude: '0' }, { id: 'via2', latitude: '', longitude: '' }, { id: 'end', latitude: '45', longitude: '-80' }];
  const markers = routeMapPoints(points);
  assert.deepEqual(markers.map(point => [point.id, point.label]), [['via1', '1'], ['end', 'B']]);
  assert.equal(routePointLabel(0, 2), 'A'); assert.equal(routePointLabel(1, 2), 'B');
  assert.equal(routePointLabel(2, 4), '2');
  assert.deepEqual(routeMapPoints(null), []);
});
