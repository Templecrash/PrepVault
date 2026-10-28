import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountAuth } from '../api/_lib/account-auth.js';
import { createNeonOwnerAuth } from '../api/_lib/neon-owner-auth.js';

const env = { NEON_AUTH_BASE_URL: 'https://auth.example/neondb/auth', NEON_AUTH_COOKIE_SECRET: 's'.repeat(40), TRACKING_OWNER_EMAIL: 'owner@example.com', TRACKING_OWNER_ID: 'owner-id' };
const timestamp = Date.parse('2026-10-26T12:00:00Z');
const user = { id: 'general-account', email: 'person@example.com', name: 'Person', emailVerified: true };
const session = { id: 'session-id', userId: user.id, expiresAt: '2026-10-27T12:00:00Z', token: 'never-to-browser' };
const cookie = '__Secure-neon-auth.session_token=opaque-secret';
const req = (action, options = {}) => ({
  query: { action }, method: action === 'session' ? 'GET' : 'POST', url: `/api/account?action=${action}`, body: {}, ...options,
  headers: { host: 'prep.example', origin: 'https://prep.example', cookie, 'content-type': 'application/json', ...options.headers },
});
const response = () => ({ headers: {}, statusCode: 200, body: null,
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
});
function setup({ config = env, data = { user, session }, status = 200, headers = {}, failure } = {}) {
  const calls = [];
  const proxy = async options => {
    calls.push({ ...options, body: await options.request.clone().text() });
    if (failure) throw failure;
    return Response.json(data, { status, headers });
  };
  const auth = createAccountAuth({ env: config, now: () => timestamp, proxy });
  const run = async (action, options) => { const res = response(); await auth.handle(req(action, options), res); return res; };
  return { auth, calls, run, proxy };
}

test('account session accepts verified non-owner while private owner authorization remains closed', async () => {
  const { run, proxy } = setup();
  const res = await run('session');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { user });
  const ownerAuth = createNeonOwnerAuth({ env, proxy, now: () => timestamp });
  assert.equal(await ownerAuth.authenticate(req('session')), null);
});

test('account lookup always validates opaque provider session and returns no credentials', async () => {
  const { run, calls } = setup({ data: { user: { ...user, role: 'admin', secret: 'hidden' }, session } });
  const res = await run('session', { headers: { cookie: `${cookie}; __Secure-neon-auth.local.session_data=forged; other=secret`, authorization: 'Bearer forged' }, body: { id: 'forged' } });
  assert.deepEqual(res.body, { user });
  assert.equal(calls[0].request.url, 'https://prep.example/api/auth/get-session?disableCookieCache=true');
  assert.equal(calls[0].request.headers.get('cookie'), cookie);
  assert.equal(calls[0].request.headers.get('authorization'), null);
  assert.equal(calls[0].sameSite, 'strict');
  assert.match(res.headers['cache-control'], /no-store/);
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
});

test('missing, ambiguous or huge cookie yields a signed-out result without upstream access', async () => {
  for (const value of ['', `${cookie}; ${cookie}`, 'x'.repeat(17000)]) {
    const { run, calls } = setup();
    assert.deepEqual((await run('session', { headers: { cookie: value } })).body, { user: null });
    assert.equal(calls.length, 0);
  }
});

test('revoked, unverified, banned, expired and mismatched accounts are not sessions', async () => {
  for (const data of [null, {}, { user, session: null }, { user: { ...user, emailVerified: false }, session },
    { user: { ...user, banned: true }, session }, { user: { ...user, email: 'invalid' }, session },
    { user, session: { ...session, userId: 'another-user' } }, { user, session: { ...session, expiresAt: 'bad' } },
    { user, session: { ...session, expiresAt: new Date(timestamp).toISOString() } },
    { user, session: { ...session, expiresAt: '2026-10-26T11:59:00Z' } }]) {
    const { run } = setup({ data });
    assert.deepEqual((await run('session')).body, { user: null });
  }
});

test('send code uses normalized email and fixed sign-in purpose, discarding injected fields', async () => {
  const { run, calls } = setup({ data: { success: true } });
  const res = await run('send', { body: { email: ' Person@Example.com ', type: 'forget-password', role: 'admin', callbackURL: 'https://evil.example' } });
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0].path, 'email-otp/send-verification-otp');
  assert.deepEqual(JSON.parse(calls[0].body), { email: user.email, type: 'sign-in' });
});

test('verified code can register new users with a bounded display name and shared provider cookie', async () => {
  const { run, calls } = setup({ data: { user, token: 'secret' }, headers: { 'set-cookie': `${cookie}; HttpOnly; Secure; SameSite=Strict; Path=/` } });
  const res = await run('verify', { body: { email: user.email, otp: '123456', name: ' Person ', role: 'owner', emailVerified: true } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(calls[0].body), { email: user.email, otp: '123456', name: 'Person' });
  assert.deepEqual(res.body, { user });
  assert.equal(res.headers['set-cookie'].length, 1);
});

test('invalid identities from verify never set a cookie', async () => {
  for (const altered of [null, { ...user, emailVerified: false }, { ...user, email: 'another@example.com' }, { ...user, banned: true }]) {
    const { run } = setup({ data: { user: altered }, headers: { 'set-cookie': cookie } });
    const res = await run('verify', { body: { email: user.email, otp: '123456' } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['set-cookie'], undefined);
  }
});

test('cross-origin, wrong method and non-JSON mutations are rejected before proxy access', async () => {
  for (const [action, options, expected] of [
    ['send', { headers: { origin: 'https://evil.example' } }, 403],
    ['send', { headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    ['send', { headers: { origin: undefined } }, 403],
    ['send', { method: 'GET' }, 405], ['session', { method: 'POST' }, 405],
    ['signOut', { headers: { 'content-type': 'text/plain' } }, 415],
    ['__proto__', {}, 404], ['anything', {}, 404],
  ]) {
    const { run, calls } = setup();
    assert.equal((await run(action, options)).statusCode, expected);
    assert.equal(calls.length, 0);
  }
});

test('oversized requests, malformed input, invalid emails and codes never reach provider', async () => {
  for (const [body, expected] of [
    [{ email: 'bad' }, 400], [{ email: 'a'.repeat(250) + '@test.com' }, 400],
    [{ email: user.email, otp: 123456 }, 400], [{ email: user.email, otp: '12345a' }, 400],
    [{ email: user.email, otp: '123456', name: 'x'.repeat(81) }, 400],
    [{ email: user.email, otp: '123456', name: 'x\nadmin' }, 400],
    [[], 400], ['{bad json}', 400], [{ data: 'x'.repeat(5000) }, 413],
  ]) {
    const { run, calls } = setup();
    assert.equal((await run('verify', { body })).statusCode, expected);
    assert.equal(calls.length, 0);
  }
});

test('provider failures are sanitized and rate limits offer a retry', async () => {
  for (const [status, expected] of [[429, 429], [500, 503], [400, 400]]) {
    const { run } = setup({ status, data: { error: 'secret provider internals' } });
    const res = await run('verify', { body: { email: user.email, otp: '123456' } });
    assert.equal(res.statusCode, expected);
    assert.doesNotMatch(JSON.stringify(res.body), /secret/);
    if (status === 429) assert.equal(res.headers['retry-after'], '60');
  }
  const { run } = setup({ failure: new Error('secret backend config') });
  assert.equal((await run('session')).statusCode, 503);
});

test('sign-out forwards no identity claims and propagates the provider cookie expiry', async () => {
  const expiry = '__Secure-neon-auth.session_token=; Max-Age=0; Path=/; Secure; HttpOnly';
  const { run, calls } = setup({ data: { success: true }, headers: { 'set-cookie': expiry } });
  const res = await run('signOut', { body: { userId: 'someone-else', token: 'forged' } });
  assert.equal(calls[0].path, 'sign-out');
  assert.deepEqual(JSON.parse(calls[0].body), {});
  assert.deepEqual(res.body, { success: true });
  assert.deepEqual(res.headers['set-cookie'], [expiry]);
});

test('misconfigured providers fail closed', async () => {
  for (const config of [{}, { ...env, NEON_AUTH_COOKIE_SECRET: 'short' }, { ...env, NEON_AUTH_BASE_URL: 'http://auth.example/auth' }]) {
    const { run, calls } = setup({ config });
    assert.equal((await run('session')).statusCode, 503);
    assert.equal(calls.length, 0);
  }
});

test('streaming bodies stop at the byte limit before invoking the provider', async () => {
  const { auth, calls } = setup();
  const request = req('send', { body: undefined });
  request[Symbol.asyncIterator] = async function* () { yield 'x'.repeat(3000); yield 'x'.repeat(2000); };
  const res = response();
  await auth.handle(request, res);
  assert.equal(res.statusCode, 413);
  assert.equal(calls.length, 0);
});

test('an ambiguous upstream success cannot claim an email was sent or session was revoked', async () => {
  for (const action of ['send', 'signOut']) {
    for (const data of [{ success: false }, {}, [], null]) {
      const { run } = setup({ data, headers: { 'set-cookie': cookie } });
      const res = await run(action, { body: { email: user.email } });
      assert.equal(res.statusCode, 503);
      assert.equal(res.headers['set-cookie'], undefined);
    }
  }
});

test('installed Neon proxy preserves registration fields and emits secure first-party cookies', async t => {
  const calls = [];
  const completeUser = { ...user, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const completeSession = { ...session, createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), body: options?.body });
    if (String(url).includes('/get-session')) return Response.json({ user: completeUser, session: completeSession });
    return Response.json({ user: completeUser, token: 'private-provider-token' }, { headers: {
      'set-cookie': '__Secure-neon-auth.session_token=private-provider-token; Path=/; HttpOnly; Secure; SameSite=None; Partitioned',
    } });
  });
  const auth = createAccountAuth({ env, now: () => timestamp });
  const verified = response();
  await auth.handle(req('verify', { body: { email: user.email, otp: '123456', name: 'Person' } }), verified);
  assert.equal(verified.statusCode, 200);
  assert.deepEqual(verified.body, { user });
  assert.equal(calls[0].url, 'https://auth.example/neondb/auth/sign-in/email-otp');
  assert.deepEqual(JSON.parse(calls[0].body), { email: user.email, otp: '123456', name: 'Person' });
  assert.ok(verified.headers['set-cookie'].some(value => value.startsWith('__Secure-neon-auth.session_token=')));
  for (const value of verified.headers['set-cookie']) {
    assert.match(value, /HttpOnly/);
    assert.match(value, /Secure/);
    assert.match(value, /SameSite=Strict/);
    assert.doesNotMatch(value, /Partitioned|Domain=/);
  }
  const restored = response();
  await auth.handle(req('session'), restored);
  assert.deepEqual(restored.body, { user });
  assert.equal(calls.at(-1).url, 'https://auth.example/neondb/auth/get-session?disableCookieCache=true');
});
