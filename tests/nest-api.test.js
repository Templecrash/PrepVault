import test from 'node:test';
import assert from 'node:assert/strict';
import { createNestHandler } from '../api/nest.js';
import { createNestSessions, NEST_COOKIES } from '../api/_lib/nest-session.js';
const epoch = 1800000000000;
const owner = { id: 'owner-id' };
const nonce = 'n'.repeat(43);
const env = { SURVEILLANCE_COOKIE_KEY: 'ab'.repeat(32), GOOGLE_NEST_CLIENT_ID: 'client.apps.googleusercontent.com', GOOGLE_NEST_CLIENT_SECRET: 'private-client-secret', GOOGLE_NEST_PROJECT_ID: 'project-id', GOOGLE_NEST_REDIRECT_URI: 'https://prep.example/api/nest?action=callback' };
const offerSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\na=rtpmap:111 opus/48000/2\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';
const device = { id: 'camera-id', name: 'Driveway', room: 'Outside', status: 'online', protocols: ['WEB_RTC'], supportsLiveView: true, supportsEventImages: false };
const response = () => ({ headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k.toLowerCase()] = v; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; }, end(body) { this.body = body; return this; } });
const cookieValue = value => value.split(';')[0];
function setup(options = {}) {
  const calls = []; const jars = createNestSessions({ env: options.env || env, now: options.now || (() => epoch) });
  const provider = {
    authorizationUrl: state => `https://nestservices.google.com/partnerconnections/project-id/auth?state=${state}`,
    async exchange(code) { calls.push(['exchange', code]); return { accessToken: 'private-access', refreshToken: 'private-refresh' }; },
    async refresh(refresh) { calls.push(['refresh', refresh]); return { accessToken: 'private-access' }; },
    async devices(token) { calls.push(['devices', token]); return [device]; },
    async stream(...args) { calls.push(['stream', ...args]); return { answerSdp: 'v=0\r\nanswer', mediaSessionId: 'session-id', expiresAt: new Date(epoch + 300000).toISOString() }; },
    async stop(...args) { calls.push(['stop', ...args]); },
    async revoke(...args) { calls.push(['revoke', ...args]); return true; },
    ...options.provider,
  };
  return { calls, jars, provider, handler: createNestHandler({ env, now: () => epoch, nonce: () => nonce, ...options, sessions: jars, provider }),
    cookie: (kind = 'connection', target = owner) => cookieValue(jars.seal(kind, { owner: target.id, refreshToken: 'private-refresh', nonce })) };
}
async function request(handler, { method = 'GET', body, query = { action: 'devices' }, headers = {} } = {}) {
  const req = { method, body, query, headers: { host: 'prep.example', origin: 'https://prep.example', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers } };
  const res = response(); await handler(req, res); return res;
}
const post = (action, extra = {}) => ({ method: 'POST', query: {}, body: { action, ...extra } });

test('private owner authentication and origin checks run before configuration or provider disclosure', async () => {
  const state = setup({ authenticate: async () => null });
  for (const input of [{}, post('start'), post('finalize'), post('disconnect'), post('stream', { deviceId: device.id, offerSdp })]) {
    const res = await request(state.handler, input);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.missingConfig, undefined);
  }
  let checked = 0;
  const denied = setup({ authenticate: async () => { checked++; return owner; } });
  for (const headers of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { origin: '' }]) assert.equal((await request(denied.handler, { ...post('start'), headers })).statusCode, 403);
  assert.equal(checked, 0);
  assert.deepEqual(state.calls, []);
});
test('owner sees honest configured/disconnected state and missing names only', async () => {
  const state = setup({ authenticate: async () => owner, env: {} });
  const res = await request(state.handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.configured, false);
  assert.equal(res.body.connected, false);
  assert.ok(res.body.missingConfig.includes('GOOGLE_NEST_PROJECT_ID'));
  assert.equal(JSON.stringify(res).includes('private-client-secret'), false);
  assert.match(res.headers['cache-control'], /private, no-store/);
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal((await request(state.handler, post('start'))).statusCode, 503);
});
test('OAuth start creates owner-bound Lax state only on the configured production host', async () => {
  const state = setup({ authenticate: async () => owner });
  const res = await request(state.handler, post('start'));
  assert.equal(res.statusCode, 200);
  const stateCookie = res.headers['set-cookie'][0];
  assert.match(stateCookie, /SameSite=Lax$/);
  assert.equal(state.jars.read('state', { headers: { cookie: cookieValue(stateCookie) } }, owner).nonce, nonce);
  assert.match(res.body.authorizationUrl, /nestservices.google.com/);
  assert.equal((await request(state.handler, { ...post('start'), headers: { host: 'preview.example', origin: 'https://preview.example' } })).statusCode, 409);
  for (let n = 1; n < 5; n++) assert.equal((await request(state.handler, post('start'))).statusCode, 200);
  assert.equal((await request(state.handler, post('start'))).statusCode, 429);
});
test('cross-site callback exchanges code only with matching encrypted state and never exposes credentials', async () => {
  const state = setup({ authenticate: async () => { throw Error('callback must not use strict owner auth'); } });
  const res = await request(state.handler, { query: { action: 'callback', code: 'private-code', state: nonce }, headers: { origin: undefined, 'sec-fetch-site': 'cross-site', cookie: state.cookie('state') } });
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/app?security=nest-connected');
  assert.equal(state.calls[0][0], 'exchange');
  const pending = res.headers['set-cookie'][1];
  assert.match(pending, /SameSite=Lax$/);
  assert.equal(state.jars.read('pending', { headers: { cookie: cookieValue(pending) } }, owner).refreshToken, 'private-refresh');
  for (const secret of ['private-code', 'private-refresh', 'private-access', nonce]) assert.equal(JSON.stringify(res).includes(secret), false);
});
test('missing, tampered, expired or mismatched OAuth states fail closed before exchanging', async () => {
  for (const variant of ['missing', 'tampered', 'expired', 'nonce', 'duplicate-code', 'provider-error', 'wrong-host']) {
    const state = setup({ authenticate: async () => owner, ...(variant === 'expired' ? { now: () => epoch + 601000 } : {}) });
    const original = createNestSessions({ env, now: () => epoch }).seal('state', { owner: owner.id, nonce });
    const cookie = variant === 'missing' ? '' : variant === 'tampered' ? `${cookieValue(original)}x` : cookieValue(original);
    const res = await request(state.handler, { query: { action: 'callback', code: variant === 'duplicate-code' ? ['code', 'code2'] : 'code', state: variant === 'nonce' ? 'x'.repeat(43) : nonce, ...(variant === 'provider-error' ? { error: 'access_denied' } : {}) }, headers: { cookie, 'sec-fetch-site': 'cross-site', ...(variant === 'wrong-host' ? { host: 'evil.example' } : {}) } });
    assert.equal(res.headers.location, '/app?security=nest-error', variant);
    assert.equal(state.calls.length, 0, variant);
  }
});
test('same-origin finalization verifies pending owner, provider access and fresh owner session', async () => {
  const state = setup({ authenticate: async () => owner });
  const res = await request(state.handler, { ...post('finalize'), headers: { cookie: state.cookie('pending') } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { connected: true });
  assert.match(res.headers['set-cookie'][0], /SameSite=Strict$/);
  assert.match(res.headers['set-cookie'][1], /Max-Age=0/);
  assert.deepEqual(state.calls.map(call => call[0]), ['refresh', 'devices']);
  const wrong = await request(state.handler, { ...post('finalize'), headers: { cookie: state.cookie('pending', { id: 'other-owner' }) } });
  assert.equal(wrong.statusCode, 409);
  let auth = 0;
  const revoked = setup({ authenticate: async () => ++auth === 1 ? owner : null });
  const failed = await request(revoked.handler, { ...post('finalize'), headers: { cookie: revoked.cookie('pending') } });
  assert.equal(failed.statusCode, 401);
  assert.equal(failed.headers['set-cookie'], undefined);
});
test('devices and WebRTC commands use only verified connected camera IDs', async () => {
  const state = setup({ authenticate: async () => owner });
  const headers = { cookie: state.cookie() };
  const res = await request(state.handler, { headers });
  assert.deepEqual(res.body.devices, [device]);
  assert.equal(res.body.checkedAt, new Date(epoch).toISOString());
  for (const id of ['other-camera', 'https://evil.example', '../camera-id']) {
    const denied = await request(state.handler, { ...post('stream', { deviceId: id, offerSdp }), headers });
    assert.ok([400, 404].includes(denied.statusCode));
  }
  assert.equal(state.calls.some(call => call[0] === 'stream'), false);
  assert.equal((await request(state.handler, { ...post('stream', { deviceId: device.id, offerSdp }), headers })).statusCode, 200);
  assert.equal((await request(state.handler, { ...post('stop', { deviceId: device.id, mediaSessionId: 'session-id' }), headers })).body.stopped, true);
  assert.equal(JSON.stringify(res).includes('private-access'), false);
});
test('unsupported RTSP camera cannot start a browser stream and logout suppresses private responses', async () => {
  const state = setup({ authenticate: async () => owner, provider: { async devices() { return [{ ...device, protocols: ['RTSP'], supportsLiveView: false }]; } } });
  assert.equal((await request(state.handler, { ...post('stream', { deviceId: device.id, offerSdp }), headers: { cookie: state.cookie() } })).statusCode, 404);
  let auth = 0;
  const revoked = setup({ authenticate: async () => ++auth === 1 ? owner : null });
  const res = await request(revoked.handler, { ...post('stream', { deviceId: device.id, offerSdp }), headers: { cookie: revoked.cookie() } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.answerSdp, undefined);
  assert.ok(revoked.calls.some(call => call[0] === 'stop'));
});
test('malformed actions, oversized bodies, sendrecv offers and injected tokens are rejected', async () => {
  const state = setup({ authenticate: async () => owner });
  for (const input of [post('arm'), post('start', { refreshToken: 'injected' }), post('stream', { deviceId: device.id, offerSdp: offerSdp.replace('a=recvonly', 'a=sendrecv') }), { method: 'POST', query: {}, body: '{bad' }, post('stop', { deviceId: device.id, mediaSessionId: {} })]) assert.equal((await request(state.handler, input)).statusCode, 400);
  assert.equal((await request(state.handler, post('start', { huge: 'x'.repeat(32768) }))).statusCode, 413);
  assert.equal((await request(state.handler, { ...post('start'), headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await request(state.handler, { method: 'DELETE' })).statusCode, 405);
  assert.deepEqual(state.calls, []);
});
test('disconnect clears all three cookies even when provider revocation fails', async () => {
  const state = setup({ authenticate: async () => owner, provider: { async revoke() { throw Error('private provider error'); } } });
  const res = await request(state.handler, { ...post('disconnect'), headers: { cookie: state.cookie() } });
  assert.deepEqual(res.body, { connected: false, revoked: false });
  assert.equal(res.headers['set-cookie'].length, 3);
  for (const name of Object.values(NEST_COOKIES)) assert.ok(res.headers['set-cookie'].some(cookie => cookie.startsWith(`${name}=`) && cookie.includes('Max-Age=0')));
});
test('unexpected provider errors never leak their details or credentials', async () => {
  const state = setup({ authenticate: async () => owner, provider: { async refresh() { throw Error('private-refresh private-client-secret Google stack'); } } });
  const res = await request(state.handler, { headers: { cookie: state.cookie() } });
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.stringify(res).includes('private-refresh'), false);
});
