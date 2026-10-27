import test from 'node:test';
import assert from 'node:assert/strict';
import { connectEyezon, connectReveal, disconnectEyezon, disconnectReveal, fetchSurveillancePhoto, getSurveillance, normalizeSurveillance } from '../src/surveillance-client.js';

const snapshot = () => ({ reveal: { configured: true, connected: true, accountEmail: 'camera@example.com', cameras: [{ id: 'cam:1', name: 'Gate', batteryPercent: 0 }], photos: [{ id: 'photo.1', cameraId: 'cam:1', capturedAt: '2026-10-26T09:20:00', receivedAt: '2026-10-26T13:25:00Z' }], checkedAt: '2026-10-26T13:30:00Z', hasMore: true, limit: 100 }, eyezon: { connected: false, status: 'unknown' }, fetchedAt: '2026-10-26T13:30:00Z' });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('all connection requests use the protected same-origin endpoint without browser tokens or cache', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push({ url, options }); return response(snapshot()); });
  await getSurveillance();
  await connectReveal(' camera@example.com ', 'test password');
  await disconnectReveal();
  await connectEyezon(' alarm@example.com ', 'test alarm password');
  await disconnectEyezon();
  for (const { url, options } of requests) {
    assert.equal(url, '/api/surveillance');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, undefined);
  }
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.body, undefined);
  assert.deepEqual(JSON.parse(requests[1].options.body), { action: 'connect-reveal', email: 'camera@example.com', password: 'test password' });
  assert.deepEqual(JSON.parse(requests[2].options.body), { action: 'disconnect-reveal' });
  assert.deepEqual(JSON.parse(requests[3].options.body), { action: 'connect-eyezon', email: 'alarm@example.com', password: 'test alarm password' });
  assert.deepEqual(JSON.parse(requests[4].options.body), { action: 'disconnect-eyezon' });
});

test('missing camera metrics stay unknown while a real zero and camera-local capture time are retained', () => {
  const source = snapshot();
  source.reveal.cameras[0].signalPercent = '80';
  source.reveal.cameras[0].imageUrl = 'https://provider.invalid/photo?token=secret';
  source.reveal.cameras[0].token = 'must not reach UI';
  source.reveal.photos[0].url = 'https://provider.invalid/photo';
  const result = normalizeSurveillance(source);
  assert.equal(result.reveal.cameras[0].batteryPercent, 0);
  assert.equal(result.reveal.cameras[0].signalPercent, null);
  assert.equal(result.reveal.cameras[0].status, 'unknown');
  assert.equal(result.reveal.photos[0].capturedAt, '2026-10-26T09:20:00');
  assert.equal(result.reveal.photos[0].receivedAt, '2026-10-26T13:25:00Z');
  assert.equal(result.reveal.configured, true);
  assert.equal(result.reveal.hasMore, true);
  assert.equal(result.reveal.limit, 100);
  assert.equal(result.reveal.cameras[0].imageUrl, undefined);
  assert.equal(result.reveal.cameras[0].token, undefined);
  assert.equal(result.reveal.photos[0].url, undefined);
});

test('disconnected snapshots clear photos, cameras and alarm systems', () => {
  const source = snapshot();
  source.reveal.connected = false;
  source.eyezon = { configured: true, connected: false, systems: [{ id: 'system1', status: 'armed_away', partitions: [{ id: '1', status: 'disarmed' }] }] };
  const result = normalizeSurveillance(source);
  assert.equal(normalizeSurveillance({ reveal: { configured: false, connected: false } }).reveal.configured, false);
  assert.equal(normalizeSurveillance({ reveal: { connected: false } }).reveal.configured, false);
  assert.deepEqual(result.reveal.cameras, []);
  assert.deepEqual(result.reveal.photos, []);
  assert.equal(result.eyezon.connected, false);
  assert.deepEqual(result.eyezon.systems, []);
  assert.throws(() => normalizeSurveillance({ reveal: { connected: 'true' } }), /could not be checked/);
});

test('Eyezon preserves reported system and partition states without inferring security or parsing provider timestamps', () => {
  const source = snapshot();
  source.eyezon = { configured: true, connected: true, accountEmail: 'alarm@example.com', checkedAt: '2026-10-26T13:30:00Z', systems: [
    { id: 'a12b34c56d78', name: 'Home', model: 'EnvisaLink', connection: 'Online', status: 'mixed', reportedAt: 'Oct 26 2026, 9:30 AM',
      partitions: [{ id: '1', label: 'Main house', status: 'armed_stay', reportedStatus: 'Armed Stay' }, { id: '2', status: 'ready' }, { id: '3', status: 'unexpected' }, { id: '4', status: 'entry_delay' }, { id: '5', status: 'exit_delay' }],
      zones: [{ state: 'closed' }], password: 'not-for-ui', sessionCookie: 'private' },
    { id: 'system2', name: 'Cabin', status: 'unexpected', connection: '', partitions: [] },
  ] };
  const result = normalizeSurveillance(source).eyezon;
  assert.equal(result.connected, true);
  assert.equal(result.accountEmail, 'alarm@example.com');
  assert.equal(result.systems[0].reportedAt, 'Oct 26 2026, 9:30 AM');
  assert.equal(result.systems[0].status, 'mixed');
  assert.equal(result.systems[0].partitions[0].status, 'armed_stay');
  assert.equal(result.systems[0].partitions[0].reportedStatus, 'Armed Stay');
  assert.equal(result.systems[0].partitions[1].status, 'ready');
  assert.equal(result.systems[0].partitions[1].label, 'Partition 2');
  assert.equal(result.systems[0].partitions[2].status, 'unknown');
  assert.equal(result.systems[0].partitions[3].status, 'entry_delay');
  assert.equal(result.systems[0].partitions[4].status, 'exit_delay');
  assert.equal(result.systems[1].status, 'unknown');
  assert.equal(result.systems[1].connection, '');
  assert.equal(result.systems[0].zones, undefined);
  assert.equal(result.systems[0].password, undefined);
  assert.equal(result.systems[0].sessionCookie, undefined);
});

test('an EyezOn service failure stays separate from REVEAL data and creates no healthy alarm state', () => {
  const source = snapshot();
  source.eyezon = { configured: true, connected: true, systems: [], error: 'EyezOn could not be reached.', checkedAt: null };
  const result = normalizeSurveillance(source);
  assert.equal(result.reveal.cameras.length, 1);
  assert.equal(result.reveal.error, '');
  assert.equal(result.eyezon.error, 'EyezOn could not be reached.');
  assert.equal(result.eyezon.checkedAt, null);
  assert.deepEqual(result.eyezon.systems, []);
});

test('photo requests encode observed IDs in a same-origin route and reject paths and arbitrary URLs', async t => {
  let requested;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    requested = { url, options };
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
  });
  const blob = await fetchSurveillancePhoto('cam:1', 'photo.1');
  assert.equal(blob.type, 'image/jpeg');
  assert.equal(blob.size, 3);
  assert.equal(requested.url, '/api/surveillance?action=photo&cameraId=cam%3A1&photoId=photo.1');
  assert.equal(requested.options.credentials, 'same-origin');
  assert.equal(requested.options.cache, 'no-store');
  assert.equal(requested.options.redirect, 'error');
  await assert.rejects(fetchSurveillancePhoto('https://elsewhere.invalid', 'photo.1'), /could not be found/);
  await assert.rejects(fetchSurveillancePhoto('cam:1', '../private'), /could not be found/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('photo response checks reject HTML, SVG and files above the delivery limit', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(fetchSurveillancePhoto('cam1', 'p1'), /could not be displayed/);
  fetch.mock.mockImplementation(async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }));
  await assert.rejects(fetchSurveillancePhoto('cam1', 'p1'), /could not be displayed/);
  fetch.mock.mockImplementation(async () => new Response('x', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(5 * 1024 * 1024) } }));
  await assert.rejects(fetchSurveillancePhoto('cam1', 'p1'), /Open it in REVEAL/);
  fetch.mock.mockImplementation(async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } }));
  await assert.rejects(fetchSurveillancePhoto('cam1', 'p1'), /too large/);
});

test('owner authorization errors from metadata and image requests remain available to the session gate', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ error: 'Owner sign-in required.', code: 'unauthorized' }, 401));
  await assert.rejects(getSurveillance(), error => error.status === 401 && error.code === 'unauthorized');
  fetch.mock.mockImplementation(async () => response({ error: 'Owner access only.', code: 'forbidden' }, 403));
  await assert.rejects(fetchSurveillancePhoto('cam1', 'p1'), error => error.status === 403);
  fetch.mock.mockImplementation(async () => response({ error: 'REVEAL is unavailable.', code: 'provider_unavailable' }, 502));
  await assert.rejects(getSurveillance(), error => error.status === 502 && error.message === 'REVEAL is unavailable.');
});

test('pre-cancelled requests never submit credentials or fetch photos', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw Error('Should not fetch'); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(connectReveal('camera@example.com', 'test password', { signal: controller.signal }), error => error.name === 'AbortError');
  await assert.rejects(connectEyezon('alarm@example.com', 'test password', { signal: controller.signal }), error => error.name === 'AbortError');
  await assert.rejects(fetchSurveillancePhoto('cam1', 'p1', { signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(fetch.mock.callCount(), 0);
});

test('a late metadata response after sign-out is discarded even if transport ignores cancellation', async t => {
  let release;
  t.mock.method(globalThis, 'fetch', async () => new Promise(resolve => { release = resolve; }));
  const controller = new AbortController();
  const pending = getSurveillance({ signal: controller.signal });
  controller.abort(); release(response(snapshot()));
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('a photo completed after cancellation is never returned for an object URL', async t => {
  let release;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, headers: new Headers({ 'Content-Type': 'image/jpeg' }), blob: () => new Promise(resolve => { release = resolve; }) }));
  const controller = new AbortController();
  const pending = fetchSurveillancePhoto('cam1', 'p1', { signal: controller.signal });
  await Promise.resolve();
  controller.abort(); release(new Blob(['photo'], { type: 'image/jpeg' }));
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('timeouts and network failures do not masquerade as an expired owner session', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }); }));
  const pending = getSurveillance(); t.mock.timers.tick(65_000);
  await assert.rejects(pending, error => /timed out/.test(error.message) && error.status === undefined);
  fetch.mock.mockImplementation(async () => { throw new TypeError('Network problem'); });
  await assert.rejects(getSurveillance(), error => /Check your connection/.test(error.message) && error.status === undefined);
});
