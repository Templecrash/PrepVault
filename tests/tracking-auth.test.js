import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrackingOwner, sendTrackingSignInCode, signOutTrackingOwner, verifyTrackingSignInCode } from '../src/tracking-auth.js';

const owner = { id: 'verified-owner', email: 'owner@example.test', name: 'Owner' };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('tracking sign-in requests use same-origin cookies, JSON, and no bearer credentials', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return response({ success: true });
  });
  await sendTrackingSignInCode(' owner@example.test ');
  await signOutTrackingOwner();
  assert.deepEqual(requests.map(item => item.url), ['/api/auth/email-otp/send-verification-otp', '/api/auth/sign-out']);
  for (const { options } of requests) {
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.headers.Authorization, undefined);
  }
  assert.deepEqual(JSON.parse(requests[0].options.body), { email: owner.email, type: 'sign-in' });
  assert.deepEqual(JSON.parse(requests[1].options.body), {});
});

test('owner session distinguishes a signed-out user from a service failure', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ error: 'Sign in required.' }, 401));
  assert.equal(await getTrackingOwner(), null);
  fetch.mock.mockImplementation(async () => response({ error: 'Service not configured.' }, 503));
  await assert.rejects(getTrackingOwner(), error => error.status === 503 && error.message === 'Service not configured.');
  fetch.mock.mockImplementation(async () => response({ error: 'Owner access required.' }, 403));
  await assert.rejects(getTrackingOwner(), error => error.status === 403);
  fetch.mock.mockImplementation(async () => response({ user: owner }));
  assert.deepEqual(await getTrackingOwner(), owner);
  fetch.mock.mockImplementation(async () => response({ user: { id: 123, email: owner.email } }));
  await assert.rejects(getTrackingOwner(), /could not be verified/);
});

test('successful OTP verification still requires an independently verified owner session', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return response({ user: url.endsWith('get-session') ? owner : { id: 'untrusted-signin-result' } });
  });
  assert.deepEqual(await verifyTrackingSignInCode(' owner@example.test ', ' 123456 '), owner);
  assert.deepEqual(requests.map(item => item.url), ['/api/auth/sign-in/email-otp', '/api/auth/get-session']);
  assert.deepEqual(JSON.parse(requests[0].options.body), { email: owner.email, otp: '123456' });
  assert.equal(requests[1].options.method, 'GET');
  assert.equal(requests[1].options.body, undefined);
});

test('an unverified OTP response cannot open the tracker', async t => {
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('get-session')
    ? response({ error: 'Signed out.' }, 401) : response({ user: owner }));
  await assert.rejects(verifyTrackingSignInCode(owner.email, '123456'), /could not be verified/);
});

test('malformed server responses and aborted owner requests fail safely', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML response'); } }));
  await assert.rejects(getTrackingOwner(), /Secure sign-in is unavailable/);
  const controller = new AbortController();
  fetch.mock.mockImplementation(async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Request cancelled', 'AbortError')), { once: true });
  }));
  const request = getTrackingOwner({ signal: controller.signal });
  controller.abort();
  await assert.rejects(request, error => error.name === 'AbortError');
});
