import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_SESSION_EVENT, getAccountSession, sendAccountCode, signOutAccount, verifyAccountCode } from '../src/account-auth-client.js';
import { OWNER_SIGN_OUT_EVENT, signOutTrackingOwner, verifyTrackingSignInCode } from '../src/tracking-auth.js';

const user = { id: 'verified-id', email: 'person@example.com', name: 'Person', emailVerified: true };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function browser(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  t.after(() => original ? Object.defineProperty(globalThis, 'window', original) : delete globalThis.window);
  return target;
}

test('account API uses same-origin HTTP-only sessions and no client credentials', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return response({ success: true }); });
  await sendAccountCode(' person@example.com ');
  await signOutAccount();
  assert.deepEqual(calls.map(call => call.url), ['/api/account?action=send', '/api/account?action=signOut']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: user.email });
  for (const { options } of calls) {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
  }
});

test('verified account restoration is marked Neon without promising cloud plan storage', async t => {
  t.mock.method(globalThis, 'fetch', async () => response({ user }));
  assert.deepEqual(await getAccountSession(), { id: user.id, email: user.email, name: user.name, authProvider: 'neon', isLocal: false, user_metadata: { display_name: user.name } });
});

test('signed-out, unavailable and invalid session responses remain distinct', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ user: null }));
  assert.equal(await getAccountSession(), null);
  fetch.mock.mockImplementation(async () => response({ error: 'Temporarily unavailable.' }, 503));
  await assert.rejects(getAccountSession(), error => error.status === 503);
  fetch.mock.mockImplementation(async () => response({ user: { ...user, emailVerified: false } }));
  await assert.rejects(getAccountSession(), /could not be verified/);
});

test('verification immediately gates all surfaces, normalizes registration fields, and independently checks session', async t => {
  const target = browser(t), events = [], calls = [];
  target.addEventListener(OWNER_SIGN_OUT_EVENT, event => events.push(event.type));
  target.addEventListener(ACCOUNT_SESSION_EVENT, event => events.push(event.type));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('session')) assert.deepEqual(events, [OWNER_SIGN_OUT_EVENT, ACCOUNT_SESSION_EVENT]);
    return response(url.endsWith('session') ? { user } : { user: { id: 'do-not-trust' } });
  });
  const result = await verifyAccountCode(` ${user.email} `, ' 123456 ', { name: ' Person ' });
  assert.equal(result.id, user.id);
  assert.deepEqual(calls.map(call => call.url), ['/api/account?action=verify', '/api/account?action=session']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: user.email, otp: '123456', name: 'Person' });
  assert.deepEqual(events, [OWNER_SIGN_OUT_EVENT, ACCOUNT_SESSION_EVENT]);
});

test('verification rejects a stale or mismatched provider session', async t => {
  for (const value of [null, { ...user, email: 'different@example.com' }]) {
    t.mock.method(globalThis, 'fetch', async url => response(url.endsWith('session') ? { user: value } : { user }));
    await assert.rejects(verifyAccountCode(user.email, '123456'), /could not be verified/);
  }
});

test('sign-out announces change only after success and clears private views before account refresh', async t => {
  const target = browser(t), events = [];
  target.addEventListener(OWNER_SIGN_OUT_EVENT, event => events.push(event.type));
  target.addEventListener(ACCOUNT_SESSION_EVENT, event => events.push(event.type));
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ error: 'Unavailable.' }, 503));
  await assert.rejects(signOutAccount(), /Unavailable/);
  assert.deepEqual(events, []);
  fetch.mock.mockImplementation(async () => response({ success: true }));
  await signOutAccount();
  assert.deepEqual(events, [OWNER_SIGN_OUT_EVENT, ACCOUNT_SESSION_EVENT]);
});

test('malformed JSON and cancelled requests do not synthesize a session', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML'); } }));
  await assert.rejects(getAccountSession(), /unavailable/);
  const controller = new AbortController();
  fetch.mock.mockImplementation(async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
  }));
  const result = getAccountSession({ signal: controller.signal });
  controller.abort();
  await assert.rejects(result, error => error.name === 'AbortError');
});

test('a completed verification clears previous private content even if session restoration fails', async t => {
  const target = browser(t), events = [];
  target.addEventListener(OWNER_SIGN_OUT_EVENT, event => events.push(event.type));
  target.addEventListener(ACCOUNT_SESSION_EVENT, event => events.push(event.type));
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('verify') ? response({ user }) : response({ error: 'Session unavailable.' }, 503));
  await assert.rejects(verifyAccountCode(user.email, '123456'), /Session unavailable/);
  assert.deepEqual(events, [OWNER_SIGN_OUT_EVENT, ACCOUNT_SESSION_EVENT]);
});

test('root can close the modal immediately after verification without retaining the previous workspace', async t => {
  const target = browser(t), events = [], controller = new AbortController();
  target.addEventListener(OWNER_SIGN_OUT_EVENT, event => events.push(event.type));
  target.addEventListener(ACCOUNT_SESSION_EVENT, event => { events.push(event.type); controller.abort(); });
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ user }));
  await assert.rejects(verifyAccountCode(user.email, '123456', { signal: controller.signal }), error => error.name === 'AbortError');
  assert.deepEqual(events, [OWNER_SIGN_OUT_EVENT, ACCOUNT_SESSION_EVENT]);
  assert.equal(fetch.mock.callCount(), 1, 'root owns restoration after aborting the closed modal');
});

test('transport cancellation rejects pre-cancelled and late responses before trusting their identity', async t => {
  const controller = new AbortController();
  controller.abort();
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ user }));
  await assert.rejects(getAccountSession({ signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(fetch.mock.callCount(), 0);
  const late = new AbortController();
  fetch.mock.mockImplementation(async () => { late.abort(); return response({ user }); });
  await assert.rejects(getAccountSession({ signal: late.signal }), error => error.name === 'AbortError');
});

test('malformed success responses do not announce sign-out or claim code delivery', async t => {
  const target = browser(t), events = [];
  target.addEventListener(ACCOUNT_SESSION_EVENT, event => events.push(event.type));
  for (const data of [null, [], {}, { success: false }]) {
    t.mock.method(globalThis, 'fetch', async () => response(data));
    await assert.rejects(sendAccountCode(user.email));
    await assert.rejects(signOutAccount());
  }
  assert.deepEqual(events, []);
});

test('owner authentication also refreshes the general account and sign-out clears both surfaces', async t => {
  const target = browser(t), events = [];
  target.addEventListener(OWNER_SIGN_OUT_EVENT, event => events.push(event.type));
  target.addEventListener(ACCOUNT_SESSION_EVENT, event => events.push(event.type));
  t.mock.method(globalThis, 'fetch', async url => response(url.endsWith('sign-out') ? { success: true } : { user }));
  await verifyTrackingSignInCode(user.email, '123456');
  assert.deepEqual(events, [ACCOUNT_SESSION_EVENT]);
  await signOutTrackingOwner();
  assert.deepEqual(events, [ACCOUNT_SESSION_EVENT, OWNER_SIGN_OUT_EVENT, ACCOUNT_SESSION_EVENT]);
});
