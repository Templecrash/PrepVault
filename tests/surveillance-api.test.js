import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createSurveillanceHandler } from '../api/surveillance.js';
import { createSurveillanceSessions } from '../api/_lib/surveillance-session.js';
import { RevealProviderError } from '../api/_lib/reveal-provider.js';
import { EyezonProviderError } from '../api/_lib/eyezon-provider.js';

const epoch = 1_800_000_000_000;
const owner = { id: 'verified-owner' };
const credentials = () => ({ action: 'connect-reveal', email: ' owner@example.test ', password: 'password-private' });
const session = { accountEmail: 'owner@example.test', refreshToken: 'refresh-token-private', accessToken: 'access-token-private', idToken: 'id-token-private', expiresAt: epoch + 3_600_000 };
const eyezonSession = { accountEmail: 'alarm@example.test', sessionCookies: ['PHPSESSID=eyezon-session-private'], expiresAt: epoch + 12 * 3_600_000 };
const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function recorder() {
  return { statusCode: 200, headers: {}, body: undefined,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; },
  };
}

function setup({ authenticate = async () => owner, provider: overrides = {}, eyezonProvider: eyezonOverrides = {}, env = { SURVEILLANCE_COOKIE_KEY: 'a'.repeat(64) }, now = () => epoch } = {}) {
  const calls = [];
  const sessions = createSurveillanceSessions({ env, now });
  const eyezonSessions = createSurveillanceSessions({ env, now, provider: 'eyezon' });
  const provider = {
    async signInReveal(value) { calls.push(['signIn', { ...value }]); return { ...session }; },
    async refreshReveal(value) { calls.push(['refresh', { ...value }]); return { ...session, expiresAt: now() + 3_600_000 }; },
    async loadRevealFeed(value) { calls.push(['feed', value]); return { cameras: [{ id: 'camera-1', name: 'Driveway' }], photos: [{ id: 'photo-1', cameraId: 'camera-1' }], checkedAt: new Date(now()).toISOString() }; },
    async fetchRevealPhoto(value, ids) { calls.push(['photo', value, ids]); return { bytes: image, contentType: 'image/jpeg' }; },
    ...overrides,
  };
  const eyezonProvider = {
    async signInEyezon(value) { calls.push(['eyezonSignIn', { ...value }]); return { ...eyezonSession }; },
    async loadEyezonStatus(value) { calls.push(['eyezonStatus', value]); return { status: 'armed', systems: [{ id: 'alarm-1', name: 'Home', status: 'armed' }], checkedAt: new Date(now()).toISOString() }; },
    ...eyezonOverrides,
  };
  return { calls, sessions, eyezonSessions, provider, handler: createSurveillanceHandler({ authenticate, provider, sessions, eyezonProvider, eyezonSessions, now }),
    cookie: () => sessions.seal(session, owner).split(';')[0], eyezonCookie: () => eyezonSessions.seal(eyezonSession, owner).split(';')[0] };
}

async function request(handler, { method = 'GET', body, headers = {}, query, url } = {}) {
  const req = { method, body, query, url, headers: { host: 'prep.example', origin: 'https://prep.example', 'content-type': 'application/json', ...headers } };
  const res = recorder();
  await handler(req, res);
  return { req, res };
}

test('signed-out requests cannot connect, disconnect, read status or fetch photos', async () => {
  let checked = 0;
  const state = setup({ authenticate: async () => { checked += 1; return null; } });
  for (const options of [
    {}, { query: { action: 'photo', cameraId: 'camera-1', photoId: 'photo-1' } },
    { method: 'POST', body: credentials() }, { method: 'POST', body: { action: 'disconnect-reveal' } },
    { method: 'POST', body: { ...credentials(), action: 'connect-eyezon' } }, { method: 'POST', body: { action: 'disconnect-eyezon' } },
  ]) {
    const { res } = await request(state.handler, { ...options, headers: { cookie: state.cookie(), authorization: 'Bearer forged-token', 'x-owner-id': owner.id } });
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['set-cookie'], undefined);
  }
  assert.equal(checked, 6);
  assert.deepEqual(state.calls, []);
});

test('every response is private and disconnected status never claims the alarm is secure', async () => {
  const state = setup();
  const { res } = await request(state.handler);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.reveal, { configured: true, connected: false, cameras: [], photos: [], checkedAt: null });
  assert.deepEqual(res.body.eyezon, { configured: true, connected: false, status: 'unknown', systems: [], checkedAt: null });
  assert.match(res.headers['cache-control'], /private.*no-store/);
  assert.equal(res.headers.pragma, 'no-cache');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(res.headers.vary, 'Origin, Cookie');
});

test('cross-origin and CSRF requests are rejected before owner authentication or provider access', async () => {
  let checked = false;
  const state = setup({ authenticate: async () => { checked = true; return owner; } });
  for (const headers of [{ origin: 'https://attacker.example' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { origin: 'http://prep.example' }]) {
    assert.equal((await request(state.handler, { method: 'POST', body: credentials(), headers })).res.statusCode, 403);
  }
  assert.equal((await request(state.handler, { query: { action: 'photo', cameraId: 'camera-1', photoId: 'photo-1' }, headers: { origin: 'https://attacker.example' } })).res.statusCode, 403);
  assert.equal(checked, false);
  assert.deepEqual(state.calls, []);
});

test('connect verifies owner again, encrypts refresh cookie and never reflects credentials', async () => {
  let checked = 0;
  const state = setup({ authenticate: async () => { checked += 1; return owner; } });
  const { req, res } = await request(state.handler, { method: 'POST', body: credentials() });
  assert.equal(res.statusCode, 200);
  assert.equal(checked, 2);
  assert.equal(res.body.reveal.connected, true);
  assert.equal(res.body.reveal.accountEmail, 'owner@example.test');
  assert.deepEqual(state.calls[0], ['signIn', { email: 'owner@example.test', password: 'password-private' }]);
  assert.equal(req.body.password, '');
  assert.match(res.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/);
  const output = JSON.stringify({ body: res.body, headers: res.headers });
  for (const secret of ['password-private', session.refreshToken, session.accessToken, session.idToken]) assert.equal(output.includes(secret), false);
});

test('sign-in failure clears password and never reflects upstream errors', async () => {
  const state = setup({ provider: { async signInReveal() { throw Error('password-private access-token-private provider-stack'); } } });
  const { req, res } = await request(state.handler, { method: 'POST', body: credentials() });
  assert.equal(req.body.password, '');
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'unavailable');
  assert.equal(JSON.stringify(res).includes('password-private'), false);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('logout or owner change during connection, feed or photo retrieval discards private output', async () => {
  for (const next of [null, { id: 'another-owner' }]) {
    for (const action of ['connect', 'feed', 'photo']) {
      let checked = 0;
      const state = setup({ authenticate: async () => ++checked === 1 ? owner : next });
      const options = action === 'connect' ? { method: 'POST', body: credentials() } : {
        headers: { cookie: state.cookie() }, ...(action === 'photo' ? { query: { action: 'photo', cameraId: 'camera-1', photoId: 'photo-1' } } : {}),
      };
      const { res } = await request(state.handler, options);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.reveal, undefined);
      assert.equal(Buffer.isBuffer(res.body), false);
      assert.equal(res.headers['set-cookie'], undefined);
    }
  }
});

test('unsupported methods, content types, malformed JSON and unknown operations never call provider', async () => {
  const state = setup();
  for (const [options, status] of [
    [{ method: 'DELETE' }, 405], [{ method: 'POST', body: credentials(), headers: { 'content-type': 'text/plain' } }, 415],
    [{ method: 'POST', body: '{' }, 400], [{ method: 'POST', body: [] }, 400],
    [{ method: 'POST', body: { ...credentials(), ownerId: 'forged' } }, 400],
    [{ method: 'POST', body: { action: 'disconnect-reveal', token: 'forged' } }, 400],
    [{ method: 'POST', body: { action: 'arm' } }, 400], [{ query: { action: 'arm' } }, 400],
    [{ query: { url: 'https://attacker.example/photo' } }, 400],
  ]) assert.equal((await request(state.handler, options)).res.statusCode, status);
  assert.deepEqual(state.calls, []);
});

test('body byte limits apply to object, Buffer, text, length header and streamed input', async () => {
  const state = setup();
  const body = { ...credentials(), padding: 'x'.repeat(8193) };
  for (const options of [
    { body }, { body: JSON.stringify(body) }, { body: Buffer.from(JSON.stringify(body)) },
    { body: credentials(), headers: { 'content-length': '8193' } },
  ]) assert.equal((await request(state.handler, { method: 'POST', ...options })).res.statusCode, 413);
  const res = recorder();
  await state.handler({ method: 'POST', headers: { host: 'prep.example', origin: 'https://prep.example', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield 'x'.repeat(4096); yield 'x'.repeat(4097); },
  }, res);
  assert.equal(res.statusCode, 413);
  assert.deepEqual(state.calls, []);
});

test('credential fields are bounded and client-supplied tokens or URLs are rejected', async () => {
  const state = setup();
  for (const body of [
    { ...credentials(), email: 'invalid' }, { ...credentials(), email: 'a'.repeat(255) }, { ...credentials(), email: {} },
    { ...credentials(), password: '' }, { ...credentials(), password: 'x'.repeat(1025) }, { ...credentials(), password: {} },
    { ...credentials(), accessToken: 'client-token' }, { ...credentials(), url: 'https://attacker.example' },
  ]) assert.equal((await request(state.handler, { method: 'POST', body })).res.statusCode, 400);
  assert.deepEqual(state.calls, []);
});

test('provider session is refreshed from the encrypted cookie and short-term cache is reused', async () => {
  let now = epoch;
  const state = setup({ now: () => now });
  const cookie = state.cookie();
  for (let count = 0; count < 2; count += 1) assert.equal((await request(state.handler, { headers: { cookie } })).res.statusCode, 200);
  assert.equal(state.calls.filter(([kind]) => kind === 'refresh').length, 1);
  const passed = state.calls.find(([kind]) => kind === 'refresh')[1];
  assert.equal(passed.refreshToken, session.refreshToken);
  assert.equal(passed.accessToken, undefined);
  now += 300_001;
  assert.equal((await request(state.handler, { headers: { cookie } })).res.statusCode, 200);
  assert.equal(state.calls.filter(([kind]) => kind === 'refresh').length, 2);
});

test('concurrent photos share one token refresh instead of submitting duplicate provider logins', async () => {
  let refreshCalls = 0;
  let finishRefresh;
  let reportStarted;
  const started = new Promise(resolve => { reportStarted = resolve; });
  const state = setup({ provider: { refreshReveal() {
    refreshCalls += 1;
    reportStarted();
    return new Promise(resolve => { finishRefresh = resolve; });
  } } });
  const options = { headers: { cookie: state.cookie() }, query: { action: 'photo', cameraId: 'camera-1', photoId: 'photo-1' } };
  const pending = [request(state.handler, options), request(state.handler, options)];
  await started;
  finishRefresh({ ...session });
  const results = await Promise.all(pending);
  assert.equal(refreshCalls, 1);
  assert.ok(results.every(({ res }) => res.statusCode === 200));
  assert.equal(state.calls.filter(([kind]) => kind === 'photo').length, 2);
});

test('a rejected refresh is not cached and a later request can recover', async () => {
  let refreshCalls = 0;
  const state = setup({ provider: { async refreshReveal() {
    refreshCalls += 1;
    if (refreshCalls === 1) throw Error('transient provider failure');
    return { ...session };
  } } });
  const headers = { cookie: state.cookie() };
  const failed = (await request(state.handler, { headers })).res;
  assert.equal(failed.statusCode, 200);
  assert.equal(failed.body.reveal.connected, true);
  assert.match(failed.body.reveal.error, /temporarily unavailable/);
  const recovered = (await request(state.handler, { headers })).res;
  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.body.reveal.error, undefined);
  assert.equal(recovered.body.reveal.cameras.length, 1);
  assert.equal(refreshCalls, 2);
});

test('tampered or wrong-owner connection cookies cannot reach the provider', async () => {
  const state = setup();
  const cookie = state.cookie();
  for (const value of [cookie.replace(/=./, '=!'), `${cookie}; ${cookie}`, state.sessions.seal(session, { id: 'another-owner' }).split(';')[0]]) {
    const { res } = await request(state.handler, { headers: { cookie: value } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.reveal.connected, false);
    assert.match(res.body.reveal.error, /expired/);
  }
  assert.deepEqual(state.calls, []);
});

test('photo requires connection and valid IDs before any token refresh', async () => {
  const state = setup();
  assert.equal((await request(state.handler, { query: { action: 'photo', cameraId: 'camera-1', photoId: 'photo-1' } })).res.statusCode, 409);
  for (const query of [
    { action: 'photo' }, { action: 'photo', cameraId: 'camera-1', photoId: '../other' },
    { action: 'photo', cameraId: ['one', 'two'], photoId: 'photo-1' },
    { action: 'photo', cameraId: 'camera-1', photoId: 'https://attacker.example' },
    { action: 'photo', cameraId: 'camera-1', photoId: 'x'.repeat(257) },
  ]) assert.equal((await request(state.handler, { query, headers: { cookie: state.cookie() } })).res.statusCode, 400);
  assert.deepEqual(state.calls, []);
});

test('protected photos support provider IDs and never expose signed source URLs or tokens', async () => {
  const state = setup();
  const { res } = await request(state.handler, { headers: { cookie: state.cookie() }, query: { action: 'photo', cameraId: 'camera:1.test', photoId: 'photo-1' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, image);
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin');
  assert.match(res.headers['cache-control'], /no-store/);
  assert.equal(res.headers.location, undefined);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('photo response requires a permitted image type and bounded nonempty binary bytes', async () => {
  for (const photo of [
    { bytes: image, contentType: 'text/html' }, { bytes: image, contentType: 'image/svg+xml' },
    { bytes: Buffer.alloc(0), contentType: 'image/jpeg' },
    { bytes: Buffer.alloc(4 * 1024 * 1024 + 1), contentType: 'image/jpeg' },
    { bytes: 'é'.repeat(3 * 1024 * 1024), contentType: 'image/jpeg' },
    { bytes: { length: 1 }, contentType: 'image/png' },
  ]) {
    const state = setup({ provider: { async fetchRevealPhoto() { return photo; } } });
    const { res } = await request(state.handler, { headers: { cookie: state.cookie() }, query: { action: 'photo', cameraId: 'camera-1', photoId: 'photo-1' } });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'photo_unavailable');
    assert.equal(res.headers['content-type'], undefined);
  }
});

test('snapshot reports safe provider errors locally while POST preserves recovery status', async () => {
  for (const [error, connected, message] of [
    [Error('refresh-token-private https://s3.example/private?token=private'), true, 'This connection is temporarily unavailable. Please try again.'],
    [new RevealProviderError(409, 'reveal_reconnect_required', 'Connect your account again.'), false, 'Connect your account again.'],
    [new RevealProviderError(429, 'reveal_rate_limited', 'Wait a moment and try again.'), true, 'Wait a moment and try again.'],
  ]) {
    const state = setup({ provider: { async refreshReveal() { throw error; } } });
    const { res } = await request(state.handler, { headers: { cookie: state.cookie() } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.reveal.connected, connected);
    assert.equal(res.body.reveal.error, message);
    assert.equal(JSON.stringify(res).includes('refresh-token-private'), false);
    assert.equal(res.body.eyezon.status, 'unknown');
  }
  const state = setup({ provider: { async signInReveal() { throw new RevealProviderError(429, 'reveal_rate_limited', 'Wait a moment and try again.'); } } });
  const { res } = await request(state.handler, { method: 'POST', body: credentials() });
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, 'reveal_rate_limited');
  assert.equal(res.headers['retry-after'], '60');
});

test('unconfigured encryption is visible to owner but blocks credentials from reaching provider', async () => {
  const state = setup({ env: {} });
  const disconnected = await request(state.handler);
  assert.equal(disconnected.res.body.reveal.configured, false);
  const { res } = await request(state.handler, { method: 'POST', body: credentials() });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'not_configured');
  assert.deepEqual(state.calls, []);
});

test('disconnect clears secured cookie and cached tokens even if the supplied cookie is damaged', async () => {
  const state = setup();
  const cookie = state.cookie();
  await request(state.handler, { headers: { cookie } });
  const { res } = await request(state.handler, { method: 'POST', body: { action: 'disconnect-reveal' }, headers: { cookie: 'broken' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reveal.connected, false);
  assert.match(res.headers['set-cookie'], /Max-Age=0; HttpOnly; Secure; SameSite=Strict/);
  await request(state.handler, { headers: { cookie } });
  assert.equal(state.calls.filter(([kind]) => kind === 'refresh').length, 2);
});

test('connection attempt limit blocks the sixth attempt and resets after a minute', async () => {
  let now = epoch;
  const state = setup({ now: () => now });
  for (let count = 0; count < 5; count += 1) assert.equal((await request(state.handler, { method: 'POST', body: credentials() })).res.statusCode, 200);
  const blocked = await request(state.handler, { method: 'POST', body: credentials() });
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.headers['retry-after'], '60');
  assert.equal(state.calls.filter(([kind]) => kind === 'signIn').length, 5);
  now += 60_001;
  assert.equal((await request(state.handler, { method: 'POST', body: credentials() })).res.statusCode, 200);
});

test('EyezOn connect uses owner-bound encrypted cookie and disconnect preserves healthy REVEAL', async () => {
  const state = setup();
  const { req, res } = await request(state.handler, { method: 'POST', body: { action: 'connect-eyezon', email: ' alarm@example.test ', password: 'alarm-password-private' }, headers: { cookie: state.cookie() } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.eyezon.connected, true);
  assert.equal(res.body.eyezon.status, 'armed');
  assert.equal(res.body.reveal.connected, true);
  assert.equal(req.body.password, '');
  assert.match(res.headers['set-cookie'], /^__Secure-prepvault\.eyezon=/);
  assert.match(res.headers['set-cookie'], /Max-Age=43200; HttpOnly; Secure; SameSite=Strict/);
  assert.deepEqual(state.calls.find(([name]) => name === 'eyezonSignIn')[1], { email: 'alarm@example.test', password: 'alarm-password-private' });
  const output = JSON.stringify({ body: res.body, headers: res.headers });
  for (const secret of ['alarm-password-private', 'eyezon-session-private', session.refreshToken, session.accessToken]) assert.equal(output.includes(secret), false);
  const cookie = `${state.cookie()}; ${res.headers['set-cookie'].split(';')[0]}`;
  const status = (await request(state.handler, { headers: { cookie } })).res;
  assert.equal(status.body.eyezon.status, 'armed');
  assert.equal(state.calls.filter(([name]) => name === 'eyezonSignIn').length, 1);
  const disconnected = (await request(state.handler, { method: 'POST', body: { action: 'disconnect-eyezon' }, headers: { cookie } })).res;
  assert.equal(disconnected.body.eyezon.connected, false);
  assert.equal(disconnected.body.eyezon.status, 'unknown');
  assert.equal(disconnected.body.reveal.connected, true);
  assert.match(disconnected.headers['set-cookie'], /^__Secure-prepvault\.eyezon=;.*Max-Age=0/);
});

test('owner expiry or identity change during EyezOn login or status discards output and cookie', async () => {
  for (const next of [null, { id: 'another-owner' }]) {
    for (const connect of [true, false]) {
      let checks = 0;
      const state = setup({ authenticate: async () => ++checks === 1 ? owner : next });
      const { res } = await request(state.handler, connect
        ? { method: 'POST', body: { ...credentials(), action: 'connect-eyezon' } }
        : { headers: { cookie: state.eyezonCookie() } });
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.eyezon, undefined);
      assert.equal(res.headers['set-cookie'], undefined);
    }
  }
});

test('provider outages are isolated, stale alarm status is never called secure, and unexpected details are redacted', async () => {
  for (const failed of ['reveal', 'eyezon']) {
    const state = setup(failed === 'reveal'
      ? { provider: { async refreshReveal() { throw Error('refresh-token-private internal endpoint'); } } }
      : { eyezonProvider: { async loadEyezonStatus() { throw Error('eyezon-session-private internal endpoint'); } } });
    const { res } = await request(state.handler, { headers: { cookie: `${state.cookie()}; ${state.eyezonCookie()}` } });
    assert.equal(res.statusCode, 200);
    assert.match(res.body[failed].error, /temporarily unavailable/);
    assert.equal(JSON.stringify(res).includes('private internal'), false);
    if (failed === 'reveal') assert.equal(res.body.eyezon.status, 'armed');
    else {
      assert.equal(res.body.eyezon.status, 'unknown');
      assert.deepEqual(res.body.eyezon.systems, []);
      assert.equal(res.body.eyezon.checkedAt, null);
      assert.equal(res.body.reveal.cameras.length, 1);
    }
  }
  const state = setup({ eyezonProvider: { async loadEyezonStatus() { throw new EyezonProviderError(409, 'eyezon_reconnect_required', 'Connect EyezOn again.'); } } });
  const { res } = await request(state.handler, { headers: { cookie: `${state.cookie()}; ${state.eyezonCookie()}` } });
  assert.equal(res.body.eyezon.connected, false);
  assert.equal(res.body.eyezon.error, 'Connect EyezOn again.');
  assert.equal(res.body.reveal.connected, true);
});

test('EyezOn credential failure remains an HTTP error, clears password and does not set a connection cookie', async () => {
  const state = setup({ eyezonProvider: { async signInEyezon() { throw new EyezonProviderError(400, 'eyezon_invalid_credentials', 'EyezOn could not verify your email and password.'); } } });
  const { req, res } = await request(state.handler, { method: 'POST', body: { ...credentials(), action: 'connect-eyezon' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'eyezon_invalid_credentials');
  assert.equal(req.body.password, '');
  assert.equal(res.headers['set-cookie'], undefined);
  assert.equal(JSON.stringify(res).includes('password-private'), false);
});

test('cross-provider, tampered and wrong-owner EyezOn cookies cannot invoke alarm provider', async () => {
  const state = setup();
  const crossProvider = state.cookie().replace('__Secure-prepvault.reveal=', '__Secure-prepvault.eyezon=');
  const own = state.eyezonCookie();
  for (const cookie of [crossProvider, own.replace(/=./, '=!'), `${own}; ${own}`, state.eyezonSessions.seal(eyezonSession, { id: 'another-owner' }).split(';')[0]]) {
    const { res } = await request(state.handler, { headers: { cookie } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.eyezon.connected, false);
    assert.equal(res.body.eyezon.status, 'unknown');
    assert.match(res.body.eyezon.error, /expired/);
  }
  assert.deepEqual(state.calls, []);
});

test('disconnect during token refresh prevents the late refresh from restoring a cached session or returning photos', async () => {
  let resolveRefresh;
  let signalStart;
  const started = new Promise(resolve => { signalStart = resolve; });
  const state = setup({ provider: { refreshReveal() {
    signalStart();
    return new Promise(resolve => { resolveRefresh = resolve; });
  } } });
  const pending = request(state.handler, { headers: { cookie: state.cookie() }, query: { action: 'photo', cameraId: 'camera-1', photoId: 'photo-1' } });
  await started;
  const disconnected = await request(state.handler, { method: 'POST', body: { action: 'disconnect-reveal' } });
  assert.equal(disconnected.res.body.reveal.connected, false);
  resolveRefresh({ ...session });
  const { res } = await pending;
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'reconnect_required');
  assert.equal(state.calls.filter(([name]) => name === 'photo').length, 0);
});
