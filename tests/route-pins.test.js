import test from 'node:test';
import assert from 'node:assert/strict';
import { withMapPin, nextUnplacedPoint, routePointLetter } from '../src/route-pins.js';

test('map pins preserve identity and user labels, use exact coordinates, and clear geocoder precision', () => {
  const pin = withMapPin({ id: 'cottage', name: 'Cottage', matchType: 'street', matchLabel: 'Road' }, { latitude: 45.1234564, longitude: -79.2345674 });
  assert.equal(pin.id, 'cottage'); assert.equal(pin.name, 'Cottage');
  assert.equal(pin.latitude, '45.123456'); assert.equal(pin.longitude, '-79.234567');
  assert.equal(pin.selectionSource, 'map'); assert.equal(pin.matchType, undefined);
  assert.throws(() => withMapPin(pin, { latitude: '', longitude: 0 }));
  assert.throws(() => withMapPin(pin, { latitude: 90, longitude: 0 }));
});
test('unnamed map labels update with the marker and a user rename survives movement', () => {
  const initial = withMapPin({ id: 'a', name: '' }, { latitude: 0, longitude: 0 });
  assert.equal(initial.name, 'Map pin: 0.000000, 0.000000');
  const moved = withMapPin(initial, { latitude: 1, longitude: 2 });
  assert.equal(moved.name, 'Map pin: 1.000000, 2.000000');
  assert.equal(withMapPin({ ...moved, name: 'Meet here' }, { latitude: 3, longitude: 4 }).name, 'Meet here');
});
test('pin placement advances only to unplaced points, keeping the route order and zero coordinates', () => {
  const points = [{ id: 'a', latitude: 0, longitude: 0 }, { id: 'stop', latitude: '', longitude: '' }, { id: 'b', latitude: '', longitude: '' }];
  assert.equal(nextUnplacedPoint(points, 'a'), 'stop');
  assert.equal(nextUnplacedPoint(points, 'stop'), 'b');
  assert.equal(nextUnplacedPoint(points.map(point => ({ ...point, latitude: 1, longitude: 2 })), 'b'), null);
  assert.deepEqual(points.map((point, index) => routePointLetter(index, points.length)), ['A', '1', 'B']);
});
