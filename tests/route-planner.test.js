import test from 'node:test';
import assert from 'node:assert/strict';
import { googleDirectionsUrl, googleRouteEmbedUrl, routesForProperty, savedRoutePlaces, upsertRoute, validateRoute } from '../src/route-planner.js';

const draft = { origin: 'CN Tower, Toronto', destination: 'Toronto Pearson Airport', travelMode: 'driving', name: 'Airport route', notes: 'Bring water.' };

test('requires two distinct named locations, without guessing coordinates', () => {
  assert.throws(() => validateRoute({ ...draft, destination: ' ' }), /starting point and a destination/);
  assert.throws(() => validateRoute({ ...draft, destination: ' cn tower,  TORONTO ' }), /different locations/);
  assert.throws(() => validateRoute({ ...draft, travelMode: 'flying' }), /supported travel mode/);
});

test('trims user values and gives an unnamed route an informative name', () => {
  const route = validateRoute({ ...draft, name: ' ', origin: ` ${draft.origin} `, notes: '  Bring water. ' });
  assert.equal(route.origin, draft.origin);
  assert.equal(route.name, `${draft.origin} → ${draft.destination}`);
  assert.equal(route.notes, draft.notes);
});

test('universal directions URL safely encodes locations and specifies mode', () => {
  const url = new URL(googleDirectionsUrl({ ...draft, origin: 'A & B? #1', travelMode: 'walking' }));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('origin'), 'A & B? #1');
  assert.equal(url.searchParams.get('destination'), draft.destination);
  assert.equal(url.searchParams.get('travelmode'), 'walking');
  assert.equal(url.hash, '');
});

test('embed maps all travel modes and escapes query delimiters', () => {
  for (const [travelMode, flag] of [['driving', 'd'], ['walking', 'w'], ['bicycling', 'b'], ['transit', 'r']]) {
    const url = new URL(googleRouteEmbedUrl({ ...draft, travelMode, destination: 'B&output=redirect#x' }));
    assert.equal(url.searchParams.get('dirflg'), flag);
    assert.equal(url.searchParams.get('daddr'), 'B&output=redirect#x');
    assert.equal(url.searchParams.get('output'), 'embed');
  }
});

test('location choices prefer the individual map setup and keep primary fallback local', () => {
  const places = savedRoutePlaces([{ id: 'prop1', name: 'Home' }, { id: 'p2', name: 'Cabin' }, { id: 'p3', name: 'Cache', address: 'Cache address' }], { p2: { address: ' Cabin address ' } }, 'Home address');
  assert.deepEqual(places.map(place => place.address), ['Home address', 'Cabin address', 'Cache address']);
  assert.equal(savedRoutePlaces([{ id: 'p4', name: 'New' }], {}, 'Home address')[0].address, '');
});

test('filters routes by property while preserving legacy primary routes', () => {
  const routes = [{ id: 'r1' }, { id: 'r2', propertyId: 'p2' }];
  assert.deepEqual(routesForProperty(routes, 'prop1').map(route => route.id), ['r1']);
  assert.deepEqual(routesForProperty(routes, 'p2').map(route => route.id), ['r2']);
  assert.deepEqual(routesForProperty(undefined, 'prop1'), []);
});

test('saving and editing preserve route identity, creation date and other properties', () => {
  const original = [{ id: 'other', propertyId: 'p2', ...draft }];
  const saved = upsertRoute(original, draft, { id: 'new', propertyId: 'prop1', now: '2026-10-26T12:00:00Z' });
  const edited = upsertRoute(saved, { ...draft, destination: 'New place' }, { id: 'new', propertyId: 'prop1', now: '2026-10-26T13:00:00Z' });
  assert.equal(original.length, 1);
  assert.equal(edited.length, 2);
  assert.equal(edited[0], original[0]);
  assert.equal(edited[1].createdAt, '2026-10-26T12:00:00Z');
  assert.equal(edited[1].updatedAt, '2026-10-26T13:00:00Z');
  assert.equal(edited[1].destination, 'New place');
});

test('a route belonging to another property cannot be overwritten', () => {
  assert.throws(() => upsertRoute([{ id: 'r1', propertyId: 'p2', ...draft }], draft, { id: 'r1', propertyId: 'prop1', now: 'now' }), /another property/);
});

test('rejects oversized inputs instead of silently truncating endpoints', () => {
  assert.throws(() => validateRoute({ ...draft, origin: 'x'.repeat(301) }), /300 characters/);
  assert.throws(() => validateRoute({ ...draft, notes: 'x'.repeat(2001) }), /2,000/);
  assert.throws(() => googleDirectionsUrl({ ...draft, origin: '界'.repeat(299), destination: '別'.repeat(299) }), /too long/);
});
