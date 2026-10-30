import test from 'node:test';
import assert from 'node:assert/strict';
import { createNestSessions, equalNonce, NEST_COOKIES } from '../api/_lib/nest-session.js';
const epoch = 1800000000000;
const env = { SURVEILLANCE_COOKIE_KEY: 'ab'.repeat(32) };
const owner = { id: 'owner-id' };
const req = cookie => ({ headers: { cookie } });
const value = cookie => cookie.split(';')[0];

test('Nest cookies encrypt credentials, isolate purposes, and use narrowly scoped secure flags', () => {
  const jars = createNestSessions({ env, now: () => epoch });
  for (const kind of ['state', 'pending', 'connection']) {
    const data = { owner: owner.id, nonce: 'n'.repeat(43), refreshToken: 'very-private-refresh-token' };
    const cookie = jars.seal(kind, data);
    assert.match(cookie, /Path=\/api\/nest; Max-Age=\d+; HttpOnly; Secure; SameSite=/);
    assert.match(cookie, kind === 'connection' ? /SameSite=Strict$/ : /SameSite=Lax$/);
    assert.equal(cookie.includes('very-private'), false);
    assert.equal(cookie.includes(owner.id), false);
    const decoded = jars.read(kind, req(value(cookie)), owner);
    assert.equal(decoded.owner, owner.id);
    assert.equal(decoded.accessToken, undefined);
    assert.equal(decoded.code, undefined);
    const another = kind === 'state' ? 'pending' : 'state';
    assert.throws(() => jars.read(another, req(value(cookie).replace(NEST_COOKIES[kind], NEST_COOKIES[another])), owner));
  }
});
test('cookies reject different owners, duplicate values, tampering, stale state and bad keys', () => {
  const jars = createNestSessions({ env, now: () => epoch });
  const cookie = value(jars.seal('pending', { owner: owner.id, refreshToken: 'secret' }));
  assert.throws(() => jars.read('pending', req(cookie), { id: 'other-owner' }));
  assert.throws(() => jars.read('pending', req(`${cookie}; ${cookie}`), owner));
  assert.throws(() => jars.read('pending', req(`${cookie.slice(0, -3)}aaa`), owner));
  assert.throws(() => createNestSessions({ env, now: () => epoch + 301000 }).read('pending', req(cookie), owner));
  assert.throws(() => createNestSessions({ env: { SURVEILLANCE_COOKIE_KEY: 'ff'.repeat(32) }, now: () => epoch }).read('pending', req(cookie), owner));
  assert.equal(jars.read('pending', req(''), owner), null);
});
test('state comparison rejects missing, unequal or malformed nonce without throwing', () => {
  assert.equal(equalNonce('a'.repeat(43), 'a'.repeat(43)), true);
  for (const input of [null, {}, [], '', 'a'.repeat(42), 'b'.repeat(43), 'a '.repeat(30)]) assert.equal(equalNonce(input, 'a'.repeat(43)), false);
});
