import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { CONNECTION_COOKIE, createSurveillanceSessions } from '../api/_lib/surveillance-session.js';

const epoch = 1_800_000_000_000;
const owner = { id: 'verified-owner' };
const env = { SURVEILLANCE_COOKIE_KEY: 'a'.repeat(64) };
const session = { accountEmail: 'owner@example.test', refreshToken: 'refresh-token-private', accessToken: 'access-token-private', password: 'password-private', expiresAt: epoch + 3_600_000 };
const header = value => value.split(';')[0];
const req = cookie => ({ headers: { cookie } });
const reconnect = error => error.status === 409 && error.code === 'reconnect_required';

test('refresh cookie is encrypted, owner-bound, host-only and private', () => {
  const sessions = createSurveillanceSessions({ env, now: () => epoch });
  const cookie = sessions.seal(session, owner);
  const decoded = sessions.read(req(header(cookie)), owner);
  assert.equal(decoded.refreshToken, session.refreshToken);
  assert.equal(decoded.accountEmail, session.accountEmail);
  assert.match(decoded.cacheKey, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(decoded).sort(), ['accountEmail', 'cacheKey', 'refreshToken']);
  assert.match(cookie, /^__Secure-prepvault\.reveal=/);
  assert.match(cookie, /; Path=\/api\/surveillance;/);
  assert.match(cookie, /; Max-Age=2592000;/);
  assert.match(cookie, /; HttpOnly; Secure; SameSite=Strict$/);
  assert.equal(cookie.includes('Domain='), false);
  const ciphertext = Buffer.from(header(cookie).split('=')[1], 'base64url').toString('utf8');
  for (const value of [session.accountEmail, session.refreshToken, session.accessToken, session.password]) {
    assert.equal(cookie.includes(value), false);
    assert.equal(ciphertext.includes(value), false);
  }
});

test('each seal uses fresh authenticated encryption and a distinct cache identity', () => {
  const sessions = createSurveillanceSessions({ env, now: () => epoch });
  const first = header(sessions.seal(session, owner));
  const second = header(sessions.seal(session, owner));
  assert.notEqual(first, second);
  assert.notEqual(sessions.read(req(first), owner).cacheKey, sessions.read(req(second), owner).cacheKey);
});

test('ciphertext, IV and authentication-tag tampering all fail closed', () => {
  const sessions = createSurveillanceSessions({ env, now: () => epoch });
  const packed = Buffer.from(header(sessions.seal(session, owner)).split('=')[1], 'base64url');
  for (const offset of [0, 12, 28, packed.length - 1]) {
    const changed = Buffer.from(packed);
    changed[offset] ^= 1;
    assert.throws(() => sessions.read(req(`${CONNECTION_COOKIE}=${changed.toString('base64url')}`), owner), reconnect);
  }
});

test('cookie cannot be used by another owner or decrypted with another key', () => {
  const sessions = createSurveillanceSessions({ env, now: () => epoch });
  const cookie = header(sessions.seal(session, owner));
  assert.throws(() => sessions.read(req(cookie), { id: 'stranger' }), reconnect);
  assert.throws(() => sessions.read(req(cookie), null), reconnect);
  const changedKey = createSurveillanceSessions({ env: { SURVEILLANCE_COOKIE_KEY: 'b'.repeat(64) }, now: () => epoch });
  assert.throws(() => changedKey.read(req(cookie), owner), reconnect);
});

test('cookie expires after thirty days and is rejected at the exact expiry boundary', () => {
  let now = epoch;
  const sessions = createSurveillanceSessions({ env, now: () => now });
  const cookie = header(sessions.seal(session, owner));
  now += 30 * 24 * 60 * 60 * 1000 - 1;
  assert.equal(sessions.read(req(cookie), owner).accountEmail, session.accountEmail);
  now += 1;
  assert.throws(() => sessions.read(req(cookie), owner), reconnect);
});

test('absent cookie is disconnected while duplicates and malformed cookies require reconnect', () => {
  const sessions = createSurveillanceSessions({ env, now: () => epoch });
  const cookie = header(sessions.seal(session, owner));
  assert.equal(sessions.read({ headers: {} }, owner), null);
  assert.equal(sessions.read(req('unrelated=value'), owner), null);
  assert.equal(sessions.read(req(`unrelated=value; ${cookie}`), owner).accountEmail, session.accountEmail);
  for (const value of [`${cookie}; ${cookie}`, `${cookie}; ${CONNECTION_COOKIE}=other`, `${CONNECTION_COOKIE}=`, `${CONNECTION_COOKIE}=bad%20encoding`, `${CONNECTION_COOKIE}=AA`, `${CONNECTION_COOKIE}=${'a'.repeat(3701)}`, 'x'.repeat(24001)]) {
    assert.throws(() => sessions.read(req(value), owner), reconnect);
  }
});

test('missing or malformed encryption configuration fails closed without echoing data', () => {
  for (const key of [undefined, '', 'not-a-key', 'a'.repeat(63), 'g'.repeat(64)]) {
    const sessions = createSurveillanceSessions({ env: { SURVEILLANCE_COOKIE_KEY: key }, now: () => epoch });
    assert.equal(sessions.configured(), false);
    assert.throws(() => sessions.seal(session, owner), error => error.status === 503 && !error.message.includes('private'));
  }
});

test('seal rejects invalid credentials and oversize encrypted cookie payloads', () => {
  const sessions = createSurveillanceSessions({ env, now: () => epoch });
  for (const value of [{ ...session, refreshToken: '' }, { ...session, refreshToken: 42 }, { ...session, refreshToken: 'x'.repeat(2401) }, { ...session, accountEmail: null }, { ...session, accountEmail: 'x'.repeat(255) }]) {
    assert.throws(() => sessions.seal(value, owner), error => error.status === 503);
  }
  assert.throws(() => sessions.seal(session, null), error => error.status === 503);
  assert.throws(() => sessions.seal({ ...session, refreshToken: 'x'.repeat(2400), accountEmail: 'a'.repeat(254) }, { id: 'x'.repeat(200) }), error => error.status === 503);
});

test('disconnect clears the same secured cookie and scoped path', () => {
  const cookie = createSurveillanceSessions({ env }).clear();
  assert.equal(cookie, `${CONNECTION_COOKIE}=; Path=/api/surveillance; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
});

test('EyezOn session cookies remain encrypted and retain the provider twelve-hour expiry', () => {
  let now = epoch;
  const sessions = createSurveillanceSessions({ env, now: () => now, provider: 'eyezon' });
  const alarm = { accountEmail: session.accountEmail, sessionCookies: ['PHPSESSID=alarm-cookie-private'], password: 'password-private', expiresAt: epoch + 12 * 3_600_000 };
  const cookie = sessions.seal(alarm, owner);
  assert.match(cookie, /^__Secure-prepvault\.eyezon=/);
  assert.match(cookie, /Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/);
  assert.equal(cookie.includes('Domain='), false);
  assert.equal(cookie.includes('alarm-cookie-private'), false);
  const decoded = sessions.read(req(header(cookie)), owner);
  assert.deepEqual(decoded.sessionCookies, alarm.sessionCookies);
  assert.equal(decoded.expiresAt, alarm.expiresAt);
  assert.equal(decoded.password, undefined);
  assert.equal(decoded.refreshToken, undefined);
  now = alarm.expiresAt - 1;
  assert.equal(sessions.read(req(header(cookie)), owner).accountEmail, session.accountEmail);
  now += 1;
  assert.throws(() => sessions.read(req(header(cookie)), owner), error => error.status === 409 && error.code === 'eyezon_reconnect_required');
  assert.match(sessions.clear(), /^__Secure-prepvault\.eyezon=; Path=\/api\/surveillance; Max-Age=0; HttpOnly; Secure; SameSite=Strict$/);
});

test('connection cookies are cryptographically bound to both owner and provider, even after cookie renaming', () => {
  const reveal = createSurveillanceSessions({ env, now: () => epoch });
  const eyezon = createSurveillanceSessions({ env, now: () => epoch, provider: 'eyezon' });
  const revealCookie = header(reveal.seal(session, owner));
  const eyezonCookie = header(eyezon.seal({ accountEmail: session.accountEmail, sessionCookies: ['PHPSESSID=alarm-private'], expiresAt: epoch + 3_600_000 }, owner));
  assert.equal(eyezon.read(req(revealCookie), owner), null);
  assert.equal(reveal.read(req(eyezonCookie), owner), null);
  assert.throws(() => reveal.read(req(eyezonCookie.replace('__Secure-prepvault.eyezon=', '__Secure-prepvault.reveal=')), owner), reconnect);
  for (const [cookie, currentOwner] of [[revealCookie.replace('__Secure-prepvault.reveal=', '__Secure-prepvault.eyezon='), owner], [eyezonCookie, { id: 'another-owner' }]]) {
    assert.throws(() => eyezon.read(req(cookie), currentOwner), error => error.status === 409 && error.code === 'eyezon_reconnect_required');
  }
});

test('EyezOn seal rejects missing, expired and oversized credentials without storing passwords', () => {
  const sessions = createSurveillanceSessions({ env, now: () => epoch, provider: 'eyezon' });
  const alarm = { accountEmail: session.accountEmail, sessionCookies: ['PHPSESSID=alarm-private'], expiresAt: epoch + 3_600_000 };
  for (const value of [{ ...alarm, sessionCookies: [] }, { ...alarm, sessionCookies: 'raw-cookie' }, { ...alarm, sessionCookies: ['x'.repeat(2400)] }, { ...alarm, expiresAt: undefined }, { ...alarm, expiresAt: epoch }, { ...alarm, expiresAt: NaN }]) {
    assert.throws(() => sessions.seal(value, owner), error => error.status === 503 && !error.message.includes('private'));
  }
});
