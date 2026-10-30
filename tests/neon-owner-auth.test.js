import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOwnerAuth } from '../api/_lib/neon-owner-auth.js';

const env = {
  NEON_AUTH_BASE_URL: 'https://auth.example/neondb/auth',
  NEON_AUTH_COOKIE_SECRET: 's'.repeat(40),
  TRACKING_OWNER_EMAIL: 'owner@example.com',
};
const timestamp = Date.parse('2026-10-26T12:00:00Z');
const user = { id: 'owner-id', email: env.TRACKING_OWNER_EMAIL, name: 'Owner', emailVerified: true };
const session = { id: 'session-id', userId: user.id, expiresAt: '2026-10-27T12:00:00Z', token: 'never-to-browser' };
const cookie = '__Secure-neon-auth.session_token=opaque-secret';

function setup({ config = env, data = { user, session }, status = 200, responseHeaders = {}, proxyError } = {}) {
  const calls = [];
  const auth = createNeonOwnerAuth({
    env: config, now: () => timestamp,
    proxy: async options => {
      calls.push({ ...options, body: await options.request.clone().text() });
      if (proxyError) throw proxyError;
      return Response.json(data, { status, headers: responseHeaders });
    },
  });
  return { auth, calls };
}

function req(path = 'get-session', { method = 'GET', headers = {}, body } = {}) {
  return { query: { path }, method, body, url: `/api/auth/${path}`, headers: {
    host: 'prep.example', origin: 'https://prep.example', cookie, 'content-type': 'application/json', ...headers,
  } };
}

async function run(auth, path, options) {
  const res = { statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  await auth.handle(req(path, options), res);
  return res;
}

test('owner authentication validates provider session and ignores all client identity claims', async () => {
  const { auth, calls } = setup();
  const result = await auth.authenticate(req('get-session', { headers: {
    cookie: `${cookie}; __Secure-neon-auth.local.session_data=forged; other=private`,
    authorization: 'Bearer client-invented-identity',
  }, body: { ownerId: 'attacker' } }));
  assert.deepEqual(result, { id: user.id, email: user.email, user_metadata: { display_name: 'Owner' } });
  assert.equal(calls[0].path, 'get-session');
  assert.equal(calls[0].request.url, 'https://prep.example/api/auth/get-session?disableCookieCache=true');
  assert.equal(calls[0].request.headers.get('cookie'), cookie);
  assert.equal(calls[0].request.headers.get('authorization'), null);
  assert.equal(calls[0].request.method, 'GET');
  assert.equal(calls[0].sameSite, 'strict');
});

test('every owner request revalidates upstream and revocation is immediately honored', async () => {
  let count = 0;
  const auth = createNeonOwnerAuth({ env, now: () => timestamp, proxy: async () => {
    count += 1;
    return Response.json(count === 1 ? { user, session } : null);
  } });
  assert.equal((await auth.authenticate(req())).id, user.id);
  assert.equal(await auth.authenticate(req()), null);
  assert.equal(count, 2);
});

test('unverified, other, banned, expired, mismatched and pinned identities fail closed', async () => {
  for (const data of [
    null, {}, { user, session: null }, { user: { ...user, emailVerified: false }, session },
    { user: { ...user, email: 'stranger@example.com' }, session },
    { user: { ...user, banned: true }, session },
    { user, session: { ...session, userId: 'stranger' } },
    { user, session: { ...session, expiresAt: '2026-10-26T11:59:59Z' } },
    { user, session: { ...session, expiresAt: 'invalid' } },
  ]) {
    const { auth } = setup({ data });
    assert.equal(await auth.authenticate(req()), null);
  }
  const { auth } = setup({ config: { ...env, TRACKING_OWNER_ID: 'different-owner' } });
  assert.equal(await auth.authenticate(req()), null);
});

test('missing, duplicate or oversized cookies cannot authenticate and never call upstream', async () => {
  for (const value of ['', `${cookie}; ${cookie}`, 'x'.repeat(17000), '__Secure-neon-auth.local.session_data=forged']) {
    const { auth, calls } = setup();
    assert.equal(await auth.authenticate(req('get-session', { headers: { cookie: value } })), null);
    assert.equal(calls.length, 0);
  }
});

test('session endpoint only returns sanitized owner profile and expiry', async () => {
  const { auth } = setup({ data: { user: { ...user, secret: 'private' }, session } });
  const res = await run(auth, 'get-session');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, user.id);
  assert.equal(res.body.user.secret, undefined);
  assert.equal(res.body.session.token, undefined);
  assert.match(res.headers['cache-control'], /no-store/);
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal((await run(auth, 'get-session', { headers: { cookie: '' } })).statusCode, 401);
});

test('OTP is sent only to configured owner and extraneous fields never reach Neon', async () => {
  const { auth, calls } = setup({ data: { success: true } });
  const res = await run(auth, 'email-otp/send-verification-otp', { method: 'POST', body: {
    email: ' OWNER@example.com ', type: 'sign-in', callbackURL: 'https://attacker.example', ownerId: 'stranger',
  } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(calls[0].body), { email: env.TRACKING_OWNER_EMAIL, type: 'sign-in' });
  for (const body of [{ email: 'stranger@example.com', type: 'sign-in' }, { email: user.email, type: 'email-verification' }]) {
    const result = await run(auth, 'email-otp/send-verification-otp', { method: 'POST', body });
    assert.ok([400, 403].includes(result.statusCode));
  }
  assert.equal(calls.length, 1);
});

test('OTP sign-in requires verified owner response and hides returned session tokens', async () => {
  const { auth, calls } = setup({ data: { user, token: 'private-token' }, responseHeaders: {
    'set-cookie': '__Secure-neon-auth.session_token=new-cookie; Secure; HttpOnly; SameSite=Strict; Path=/',
  } });
  const res = await run(auth, 'sign-in/email-otp', { method: 'POST', body: { email: user.email, otp: '123456', name: 'Impersonated' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(calls[0].body), { email: user.email, otp: '123456' });
  assert.deepEqual(res.body, { user });
  assert.equal(res.headers['set-cookie'].length, 1);
  const denied = setup({ data: { user: { ...user, emailVerified: false } } });
  const failure = await run(denied.auth, 'sign-in/email-otp', { method: 'POST', body: { email: user.email, otp: '123456' } });
  assert.equal(failure.statusCode, 403);
  assert.equal(failure.headers['set-cookie'], undefined);
});

test('sign-out forwards only current session, empty body and preserves separate cookies', async () => {
  const { auth, calls } = setup({ data: { success: true }, responseHeaders: [
    ['set-cookie', '__Secure-neon-auth.session_token=; Max-Age=0; Secure; HttpOnly; Path=/'],
    ['set-cookie', '__Secure-neon-auth.local.session_data=; Max-Age=0; Secure; HttpOnly; Path=/'],
  ] });
  const res = await run(auth, 'sign-out', { method: 'POST', body: { token: 'other-user-token' } });
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0].body, '{}');
  assert.equal(res.headers['set-cookie'].length, 2);
});

test('auth rejects cross-origin, missing POST origin, disallowed routes, methods and bodies before upstream', async () => {
  const { auth, calls } = setup();
  const cases = [
    ['get-session', { headers: { origin: 'https://attacker.example' } }, 403],
    ['get-session', { headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    ['sign-out', { method: 'POST', body: {}, headers: { origin: '' } }, 403],
    ['admin/create-user', { method: 'POST', body: {} }, 404],
    ['../admin/create-user', { method: 'POST', body: {} }, 404],
    ['update-user', { method: 'POST', body: {} }, 404],
    ['sign-up/email', { method: 'POST', body: {} }, 404],
    ['get-session', { method: 'POST', body: {} }, 405],
    ['sign-out', { method: 'POST', body: {}, headers: { 'content-type': 'text/plain' } }, 415],
    ['sign-out', { method: 'POST', body: [] }, 400],
    ['sign-out', { method: 'POST', body: '{' }, 400],
    ['sign-out', { method: 'POST', body: { huge: 'x'.repeat(5000) } }, 413],
    ['sign-in/email-otp', { method: 'POST', body: { email: user.email, otp: '12a456' } }, 400],
  ];
  for (const [path, options, status] of cases) assert.equal((await run(auth, path, options)).statusCode, status, path);
  assert.equal(calls.length, 0);
});

test('missing configuration fails closed without contacting upstream', async () => {
  for (const config of [{}, { ...env, TRACKING_OWNER_EMAIL: '' }, { ...env, NEON_AUTH_COOKIE_SECRET: 'short' },
    { ...env, NEON_AUTH_BASE_URL: 'http://auth.example/auth' }, { ...env, NEON_AUTH_BASE_URL: 'https://user:pass@auth.example/auth' }]) {
    const { auth, calls } = setup({ config });
    assert.equal((await run(auth, 'get-session')).statusCode, 503);
    assert.equal(calls.length, 0);
  }
});

test('upstream failures are safe and rate limiting is propagated', async () => {
  for (const status of [429, 500, 401]) {
    const { auth } = setup({ status, data: { message: 'sensitive upstream details' } });
    const res = await run(auth, 'email-otp/send-verification-otp', { method: 'POST', body: { email: user.email, type: 'sign-in' } });
    assert.equal(res.statusCode, status === 429 ? 429 : status === 500 ? 503 : 400);
    assert.ok(!JSON.stringify(res.body).includes('sensitive'));
    if (status === 429) assert.equal(res.headers['retry-after'], '60');
  }
  const { auth } = setup({ proxyError: Error('secret internal data') });
  const res = await run(auth, 'get-session');
  assert.equal(res.statusCode, 503);
  assert.ok(!JSON.stringify(res.body).includes('secret'));
});

test('installed Neon toolkit forwards fresh session lookup and OTP flow with secure first-party cookies', async t => {
  // Exercise the actual package, mocking only HTTP at the provider boundary.
  const calls = [];
  const completeUser = { ...user, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const completeSession = { ...session, createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' };
  let revoked = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const headers = new Headers(options?.headers);
    calls.push({ url: String(url), method: options?.method || 'GET', headers, body: options?.body });
    const path = new URL(url).pathname;
    if (path.endsWith('/email-otp/send-verification-otp')) return Response.json({ success: true });
    if (path.endsWith('/sign-in/email-otp')) return Response.json({ user: completeUser, token: 'provider-secret' }, { headers: {
      'set-cookie': '__Secure-neon-auth.session_token=provider-secret; Path=/; HttpOnly; Secure; SameSite=None; Partitioned',
    } });
    if (path.endsWith('/get-session')) return Response.json(revoked ? null : { user: completeUser, session: completeSession });
    if (path.endsWith('/sign-out')) {
      revoked = true;
      return Response.json({ success: true }, { headers: {
        'set-cookie': '__Secure-neon-auth.session_token=; Path=/; HttpOnly; Secure; Max-Age=0; SameSite=None; Partitioned',
      } });
    }
    throw Error(`Unexpected mocked provider path: ${path}`);
  });
  const auth = createNeonOwnerAuth({ env, now: () => timestamp });
  const send = await run(auth, 'email-otp/send-verification-otp', { method: 'POST', body: { email: user.email, type: 'sign-in' } });
  assert.equal(send.statusCode, 200);
  assert.equal(calls[0].url, 'https://auth.example/neondb/auth/email-otp/send-verification-otp');
  assert.deepEqual(JSON.parse(calls[0].body), { email: user.email, type: 'sign-in' });
  assert.equal(calls[0].headers.get('origin'), 'https://prep.example');
  const signedIn = await run(auth, 'sign-in/email-otp', { method: 'POST', body: { email: user.email, otp: '123456' } });
  assert.equal(signedIn.statusCode, 200);
  assert.equal(signedIn.body.token, undefined);
  assert.ok(signedIn.headers['set-cookie'].some(value => value.startsWith('__Secure-neon-auth.session_token=')));
  for (const value of signedIn.headers['set-cookie']) {
    assert.match(value, /HttpOnly/);
    assert.match(value, /Secure/);
    assert.match(value, /SameSite=Strict/);
    assert.ok(!/Partitioned|Domain=/.test(value));
  }
  const before = calls.length;
  assert.equal((await auth.authenticate(req())).id, user.id);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).url, 'https://auth.example/neondb/auth/get-session?disableCookieCache=true');
  assert.equal(calls.at(-1).headers.get('cookie'), cookie);
  const signedOut = await run(auth, 'sign-out', { method: 'POST', body: {} });
  assert.equal(signedOut.statusCode, 200);
  assert.equal(signedOut.headers['set-cookie'].length, 2);
  assert.ok(signedOut.headers['set-cookie'].every(value => value.includes('Max-Age=0')));
  assert.equal(await auth.authenticate(req()), null);
});
