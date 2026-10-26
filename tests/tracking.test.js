import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, visiblePosition, trackingStatus, invitationLink, smsLink, trackingRequest } from '../src/tracking.js';

const now = Date.parse('2026-10-26T12:00:00Z');
const fix = { status: 'sharing', lat: 0, lng: 0, updatedAt: new Date(now - 5000).toISOString(), expiresAt: new Date(now + 60000).toISOString() };

test('phone numbers require explicit country codes without inventing a locale', () => {
  assert.equal(normalizePhone('+1 (613) 555-0123'), '+16135550123');
  assert.equal(normalizePhone('+44 20 7946 0123'), '+442079460123');
  for (const invalid of ['6135550123', '+0 12345678', '+123', '+1234567890123456', '+1<script>', '']) assert.equal(normalizePhone(invalid), null);
});
test('valid zero coordinates remain visible; missing or invalid fixes never become positions', () => {
  assert.equal(visiblePosition(fix, now), true);
  for (const changes of [{ lat: null }, { lng: undefined }, { lat: 100 }, { lng: NaN }, { updatedAt: null }]) assert.equal(visiblePosition({ ...fix, ...changes }, now), false);
});
test('location labels age without needing a successful poll and old positions disappear', () => {
  assert.equal(trackingStatus(fix, now), 'Live');
  assert.equal(trackingStatus({ ...fix, updatedAt: new Date(now - 50000).toISOString() }, now), 'Last seen');
  const stale = { ...fix, updatedAt: new Date(now - 310000).toISOString() };
  assert.equal(trackingStatus(stale, now), 'Signal lost');
  assert.equal(visiblePosition(stale, now), false);
});
test('stopped, revoked, invited and expired sessions never show a marker', () => {
  for (const status of ['stopped', 'revoked', 'invited']) assert.equal(visiblePosition({ ...fix, status }, now), false);
  const expired = { ...fix, expiresAt: new Date(now).toISOString() };
  assert.equal(visiblePosition(expired, now), false);
  assert.equal(trackingStatus(expired, now), 'Expired');
});
test('invitation secret is in a URL fragment, not a query that reaches server logs', () => {
  const url = new URL(invitationLink('abc_123-xyz', 'https://example.com'));
  assert.equal(url.pathname, '/share-location');
  assert.equal(url.search, '');
  assert.equal(url.hash, '#token=abc_123-xyz');
  assert.equal(smsLink('invalid', 'message'), null);
  assert.equal(smsLink('+16135550123', 'hello & you'), 'sms:+16135550123?body=hello%20%26%20you');
  assert.equal(smsLink('+16135550123', 'hello', 'iPhone'), 'sms:+16135550123&body=hello');
});
test('transport keeps owner credentials in headers, disables caching and forwards cancellation', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/tracking');
    assert.equal(options.headers.Authorization, 'Bearer private');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.signal.aborted, false);
    controller.abort();
    assert.equal(options.signal.aborted, true);
    assert.equal(options.keepalive, true);
    assert.equal(JSON.parse(options.body).action, 'list');
    return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
  });
  assert.deepEqual(await trackingRequest('list', {}, 'private', { signal: controller.signal, keepalive: true }), { sessions: [] });
});
test('transport surfaces configuration and throttling errors rather than reporting success', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Sharing is not configured.' }), { status: 503 }));
  await assert.rejects(trackingRequest('inspect', { token: 'x' }), error => error.status === 503 && /not configured/.test(error.message));
});
