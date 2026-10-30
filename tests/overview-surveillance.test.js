import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCameraPhotos, surveillanceIsStale, createOverviewSurveillanceLoader } from '../src/overview-surveillance.js';
import { normalizeSurveillance, getSurveillance } from '../src/surveillance-client.js';

const cameras = [{ id: 'gate', name: 'Gate', status: 'offline', batteryPercent: 0 }, { id: 'woods', name: 'Woods' }, { id: 'cabin', name: 'Cabin' }];
const photo = (id, cameraId, receivedAt) => ({ id, cameraId, receivedAt, capturedAt: '2026-10-29T09:00:00' });
const snapshot = () => ({ reveal: { configured: true, connected: true, cameras, photos: [photo('latest', 'gate', '2026-10-29T14:00:00Z')], checkedAt: '2026-10-29T14:05:00Z' }, eyezon: { configured: true, connected: true, systems: [{ id: 'alarm', name: 'House', status: 'armed_away', partitions: [] }], checkedAt: '2026-10-29T14:05:00Z' } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('overview shows each known camera once and chooses its latest uploaded image independent of feed ordering', () => {
  const reveal = { connected: true, cameras: [...cameras, cameras[0]], photos: [
    photo('gate-old', 'gate', '2026-10-28T14:00:00Z'),
    photo('woods-new', 'woods', '2026-10-29T15:00:00Z'),
    photo('gate-new', 'gate', '2026-10-29T14:00:00Z'),
    photo('woods-old', 'woods', '2026-10-28T14:00:00Z'),
    photo('unknown', 'other-account', '2026-10-29T16:00:00Z'),
  ] };
  const cards = latestCameraPhotos(reveal);
  assert.equal(cards.length, 3);
  assert.equal(cards[0].photo.id, 'gate-new');
  assert.equal(cards[1].photo.id, 'woods-new');
  assert.equal(cards[2].photo, null);
  assert.equal(cards[0].camera.status, 'offline');
  assert.equal(cards[0].camera.batteryPercent, 0);
  assert.equal(cards[1].camera.status, 'unknown');
});

test('per-camera latest metadata takes precedence over the limited global feed, without exposing URLs or credentials', () => {
  const source = snapshot();
  source.reveal.latestPhotos = [
    { ...photo('quiet-camera', 'cabin', '2026-10-20T14:00:00Z'), url: 'https://private.provider/photo?secret=token', accessToken: 'secret' },
    photo('gate-new', 'gate', '2026-10-29T15:00:00Z'),
  ];
  source.reveal.cameras[0] = { ...source.reveal.cameras[0], token: 'secret', photoUrl: 'https://private.provider/preview' };
  const normalized = normalizeSurveillance(source);
  const cards = latestCameraPhotos(normalized.reveal);
  assert.equal(cards[2].photo.id, 'quiet-camera');
  assert.equal(cards[0].photo.id, 'gate-new');
  assert.ok(!/secret|provider|accessToken|photoUrl/.test(JSON.stringify(cards)));
  assert.ok(!/secret|provider|accessToken|photoUrl/.test(JSON.stringify(normalized)));
  assert.deepEqual(latestCameraPhotos({ ...source.reveal, connected: false }), []);
  assert.equal(normalizeSurveillance({ ...source, reveal: { ...source.reveal, connected: false } }).reveal.latestPhotos, undefined);
});

test('missing and invalid times stay unknown, stale and failed alarm states never look current', () => {
  const now = Date.parse('2026-10-29T14:05:00Z');
  assert.equal(surveillanceIsStale({ checkedAt: '2026-10-29T14:04:00Z' }, now), false);
  for (const service of [{}, { checkedAt: 'invalid' }, { checkedAt: '2026-10-29T13:00:00Z' }, { checkedAt: '2026-10-30T14:05:00Z' }, { checkedAt: '2026-10-29T14:05:00Z', error: 'unavailable' }]) assert.equal(surveillanceIsStale(service, now), true);
  const cards = latestCameraPhotos({ connected: true, cameras, photos: [{ id: 'a', cameraId: 'gate', capturedAt: 'invalid' }, { id: 'b', cameraId: 'woods', capturedAt: '2026-10-29T13:00:00' }] });
  assert.equal(cards[0].photo.capturedAt, null);
  assert.equal(cards[0].photo.receivedAt, null);
  assert.equal(cards[1].photo.capturedAt, '2026-10-29T13:00:00');
});

test('overview verifies owner before loading the existing no-store same-origin feed', async t => {
  const calls = [];
  const changes = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return Response.json(snapshot()); });
  const loader = createOverviewSurveillanceLoader({ getOwner: async () => { calls.push({ owner: true }); return { id: 'owner-a' }; }, getFeed: getSurveillance, onChange: state => changes.push(state) });
  await loader.refresh();
  assert.equal(calls[0].owner, true);
  assert.equal(calls[1].url, '/api/surveillance');
  assert.equal(calls[1].options.cache, 'no-store');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(changes.at(-1).ownerId, 'owner-a');
  assert.equal(changes.at(-1).data.eyezon.systems[0].status, 'armed_away');
  loader.destroy();
});

test('anonymous, forbidden and unverified sessions never request or retain private feed data', async () => {
  for (const getOwner of [async () => null, async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); }, async () => { throw new Error('Offline'); }]) {
    let feeds = 0;
    const changes = [];
    const loader = createOverviewSurveillanceLoader({ getOwner, getFeed: async () => { feeds++; return snapshot(); }, onChange: state => changes.push(state) });
    await loader.refresh();
    assert.equal(feeds, 0);
    assert.equal(changes.at(-1).data, null);
    assert.equal(changes.at(-1).ownerId, null);
    loader.destroy();
  }
});

test('sign-out aborts pending reads and late responses cannot restore camera or alarm data', async () => {
  const feed = deferred();
  const requested = deferred();
  const changes = [];
  let signal;
  const loader = createOverviewSurveillanceLoader({ getOwner: async () => ({ id: 'owner' }), getFeed: async options => { signal = options.signal; requested.resolve(); return feed.promise; }, onChange: state => changes.push(state) });
  const running = loader.refresh();
  await requested.promise;
  loader.clear('signed-out');
  assert.equal(signal.aborted, true);
  feed.resolve(snapshot());
  await running;
  assert.equal(changes.at(-1).phase, 'signed-out');
  assert.equal(changes.at(-1).data, null);
  loader.destroy();
});

test('owner changes clear the previous account before a new feed response arrives', async () => {
  let owner = { id: 'owner-a' };
  let feed = async () => snapshot();
  const changes = [];
  const loader = createOverviewSurveillanceLoader({ getOwner: async () => owner, getFeed: options => feed(options), onChange: state => changes.push(state) });
  await loader.refresh();
  owner = { id: 'owner-b' };
  const waiting = deferred();
  const entered = deferred();
  feed = async () => { entered.resolve(); return waiting.promise; };
  const running = loader.refresh();
  await entered.promise;
  assert.equal(changes.at(-1).data, null);
  assert.equal(changes.at(-1).ownerId, null);
  waiting.reject(new Error('Provider unavailable'));
  await running;
  assert.equal(changes.at(-1).data, null);
  loader.destroy();
});

test('network failures preserve only previously verified same-owner information and mark it unavailable', async () => {
  let failed = false;
  const changes = [];
  const loader = createOverviewSurveillanceLoader({ getOwner: async () => ({ id: 'owner' }), getFeed: async () => { if (failed) throw new Error('Connection failed'); return snapshot(); }, onChange: state => changes.push(state) });
  await loader.refresh();
  failed = true;
  await loader.refresh();
  assert.equal(changes.at(-1).phase, 'unavailable');
  assert.equal(changes.at(-1).data.reveal.photos[0].id, 'latest');
  assert.equal(changes.at(-1).error, 'Connection failed');
  loader.offline();
  assert.equal(changes.at(-1).phase, 'offline');
  loader.clear('paused');
  assert.equal(changes.at(-1).data, null);
  loader.destroy();
});

test('unmount aborts requests and cannot publish state after the overview is gone', async () => {
  const owner = deferred();
  const changes = [];
  let signal;
  let feeds = 0;
  const loader = createOverviewSurveillanceLoader({ getOwner: options => { signal = options.signal; return owner.promise; }, getFeed: async () => { feeds++; return snapshot(); }, onChange: state => changes.push(state) });
  const running = loader.refresh();
  loader.destroy();
  const count = changes.length;
  assert.equal(signal.aborted, true);
  owner.resolve({ id: 'owner' });
  await running;
  assert.equal(feeds, 0);
  assert.equal(changes.length, count);
});
