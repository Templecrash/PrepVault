import test from 'node:test';
import assert from 'node:assert/strict';
import { configureNestPeer, disconnectNest, finalizeNestConnection, getNestDevices, normalizeNestDevices, startNestConnection, startNestStream, stopNestStream, validateNestAuthorizationUrl, waitForNestIce } from '../src/nest-client.js';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const listing = { configured: true, connected: true, checkedAt: '2026-10-29T12:00:00Z', devices: [{ id: 'camera_1', name: 'Front door', room: 'Entrance', status: 'online', protocols: ['WEB_RTC'], supportsLiveView: true }] };
const offerSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\na=rtpmap:111 opus/48000/2\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';

test('device normalization keeps only camera display fields and unknown status stays unknown', () => {
  const result = normalizeNestDevices({ ...listing, accessToken: 'secret', devices: [
    { ...listing.devices[0], status: 'READY', streamUrl: 'https://private.invalid', token: 'secret', protocols: ['WEB_RTC', 'WEB_RTC', 'OTHER'] },
    { ...listing.devices[0], name: 'duplicate' },
    { id: '../invalid', name: 'invalid' },
    { id: 'legacy', protocols: ['RTSP'], supportsLiveView: true },
  ] });
  assert.equal(result.devices.length, 2);
  assert.equal(result.devices[0].status, 'unknown');
  assert.deepEqual(result.devices[0].protocols, ['WEB_RTC']);
  assert.equal(result.devices[1].supportsLiveView, false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('private.invalid'), false);
  assert.deepEqual(normalizeNestDevices({ ...listing, connected: false }).devices, []);
  assert.deepEqual(normalizeNestDevices({ ...listing, configured: false }).devices, []);
  assert.throws(() => normalizeNestDevices({ configured: true }), /could not be checked/);
});

test('authorization URL must be the exact official Google Nest HTTPS endpoint', () => {
  const good = 'https://nestservices.google.com/partnerconnections/project-123/auth?state=123';
  assert.equal(validateNestAuthorizationUrl(good), good);
  for (const url of ['http://nestservices.google.com/partnerconnections/a/auth', 'https://nestservices.google.com.evil.test/partnerconnections/a/auth', 'https://evil.test/partnerconnections/a/auth', 'javascript:alert(1)', 'https://user@nestservices.google.com/partnerconnections/a/auth', 'https://nestservices.google.com:8443/partnerconnections/a/auth', 'https://nestservices.google.com/partnerconnections/a/auth#access_token=x', 'https://nestservices.google.com/redirect']) assert.throws(() => validateNestAuthorizationUrl(url), /could not be opened/);
});

test('requests use private same-origin JSON with no owner or provider credentials in body', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push([url, init]); return reply(init.method === 'GET' ? listing : { connected: true }); });
  const result = await getNestDevices();
  assert.equal(result.devices[0].id, 'camera_1');
  await finalizeNestConnection();
  assert.equal(calls[0][0], '/api/nest?action=devices');
  assert.equal(calls[1][0], '/api/nest');
  for (const [, init] of calls) { assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); }
  assert.deepEqual(JSON.parse(calls[1][1].body), { action: 'finalize' });
});

test('connect validates provider redirect; disconnect returns only safe state', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => reply(JSON.parse(init.body).action === 'start' ? { authorizationUrl: 'https://nestservices.google.com/partnerconnections/proj/auth?state=one', token: 'secret' } : { connected: false, revoked: true, token: 'secret' }));
  assert.match(await startNestConnection(), /^https:\/\/nestservices.google.com\//);
  assert.deepEqual(await disconnectNest(), { connected: false, revoked: true });
});

test('owner authorization failures preserve status and code for the parent gate', async t => {
  t.mock.method(globalThis, 'fetch', async () => reply({ error: 'Sign in to access your private cameras.', code: 'unauthorized' }, 401));
  await assert.rejects(getNestDevices(), error => error.status === 401 && error.code === 'unauthorized');
});

test('aborted requests do not fetch or publish a late response', async t => {
  const before = new AbortController(); before.abort();
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return reply(listing); });
  await assert.rejects(getNestDevices({ signal: before.signal }), { name: 'AbortError' });
  assert.equal(count, 0);
  const during = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { during.abort(); return reply(listing); });
  await assert.rejects(getNestDevices({ signal: during.signal }), { name: 'AbortError' });
});

test('stream exchange is receive-only SDP and rejects malformed or expired answers', async t => {
  let sent;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { sent = JSON.parse(init.body); return reply({ answerSdp: 'v=0\r\n', mediaSessionId: 'session-1', expiresAt: new Date(Date.now() + 300000).toISOString(), accessToken: 'secret' }); });
  const result = await startNestStream('camera_1', offerSdp);
  assert.deepEqual(sent, { action: 'stream', deviceId: 'camera_1', offerSdp });
  assert.deepEqual(Object.keys(result).sort(), ['answerSdp', 'expiresAt', 'mediaSessionId']);
  t.mock.method(globalThis, 'fetch', async () => reply({ answerSdp: 'v=0', mediaSessionId: 's', expiresAt: new Date(Date.now() - 1000).toISOString() }));
  await assert.rejects(startNestStream('camera_1', offerSdp), /could not start/);
  await assert.rejects(startNestStream('../other', offerSdp), /fresh camera/);
});

test('stream stop can survive navigation and carries only the camera and session', async t => {
  let init;
  t.mock.method(globalThis, 'fetch', async (_url, value) => { init = value; return reply({ stopped: true }); });
  await stopNestStream('camera_1', 'session-1', { keepalive: true });
  assert.equal(init.keepalive, true);
  assert.deepEqual(JSON.parse(init.body), { action: 'stop', deviceId: 'camera_1', mediaSessionId: 'session-1' });
});

test('peer setup requests audio/video receive-only in Google order, with Opus and a data channel', () => {
  const calls = [];
  const opus = { mimeType: 'audio/opus', clockRate: 48000 };
  const peer = { addTransceiver(kind, options) { calls.push([kind, options]); return { setCodecPreferences(codecs) { calls.push(['codecs', codecs]); } }; }, createDataChannel(name) { calls.push(['data', name]); } };
  configureNestPeer(peer, { getCapabilities: () => ({ codecs: [{ mimeType: 'audio/PCMU' }, opus] }) });
  assert.deepEqual(calls, [['audio', { direction: 'recvonly' }], ['codecs', [opus]], ['video', { direction: 'recvonly' }], ['data', 'dataSendChannel']]);
});

test('ICE gathering can finish or cancel without leaking listeners', async () => {
  const peer = new EventTarget(); peer.iceGatheringState = 'gathering';
  const controller = new AbortController();
  const promise = waitForNestIce(peer, controller.signal);
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  const complete = waitForNestIce(peer, undefined, 100);
  peer.iceGatheringState = 'complete'; peer.dispatchEvent(new Event('icegatheringstatechange'));
  await complete;
});
