import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createNeonTrackingStore } from '../api/_lib/neon-tracking-store.js';
import { createTrackingService } from '../api/_lib/tracking-service.js';

test('Neon storage parameterizes input and cannot select another function or argument', async () => {
  const queries = [];
  const store = createNeonTrackingStore({ query: async (sql, values) => {
    queries.push({ sql, values });
    return [{ result: { sessions: [] } }];
  } });
  const untrustedName = "Guest'); DROP TABLE prepvault.private_location_sessions; --";
  const result = await store.rpc('prepvault_tracking_action', {
    p_action: 'create', p_owner_id: 'verified-subject', p_name: untrustedName,
    p_lat: 0, p_lng: 0, p_accuracy: 0,
  });
  assert.deepEqual(result, { data: { sessions: [] }, error: null });
  assert.ok(!queries[0].sql.includes(untrustedName));
  assert.deepEqual(queries[0].values, ['create', 'verified-subject', null, null, null, null, untrustedName, null, null, 0, 0, 0, null]);
  await store.rpc('prepvault_tracking_action', { p_action: 'list', p_owner_id: 'another-subject' });
  assert.equal(queries[0].sql, queries[1].sql);
  for (const [name, args] of [
    ['public.other_function', { p_action: 'list' }],
    ['prepvault_tracking_action', { p_action: 'delete_all' }],
    ['prepvault_tracking_action', { p_action: 'list', table: 'other_table' }],
    ['prepvault_tracking_action', null],
    ['prepvault_tracking_action', []],
    ['prepvault_tracking_action', Object.create({ p_action: 'list' })],
  ]) {
    assert.equal((await store.rpc(name, args)).error.code, 'INVALID_TRACKING_QUERY');
  }
  assert.equal(queries.length, 2);
});

test('Neon storage removes sensitive database details from errors and rejects malformed results', async () => {
  const secret = 'postgres://private-user:private-password@private-host/database';
  for (const code of ['42P01', '42883', '42501', secret, undefined]) {
    const store = createNeonTrackingStore({ query: async () => { throw Object.assign(new Error(secret), { code, detail: secret }); } });
    const result = await store.rpc('prepvault_tracking_action', { p_action: 'list' });
    assert.deepEqual(result, { data: null, error: { code: ['42P01', '42883'].includes(code) ? code : 'TRACKING_DATABASE_ERROR' } });
    assert.ok(!JSON.stringify(result).includes(secret));
    const service = createTrackingService(store);
    await assert.rejects(service.perform('list', {}, { id: 'owner' }), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, ['42P01', '42883'].includes(code) ? 'not_configured' : 'unavailable');
      assert.ok(!error.message.includes(secret));
      return true;
    });
  }
  for (const rows of [null, [], [{ result: null }], [{ result: 'secret' }], [{ result: [] }], [{ result: {} }, { result: {} }]]) {
    const store = createNeonTrackingStore({ query: async () => rows });
    assert.deepEqual(await store.rpc('prepvault_tracking_action', { p_action: 'list' }), {
      data: null, error: { code: 'INVALID_TRACKING_RESULT' },
    });
  }
});

test('injected owner verifier is the only identity authority for a Neon service', async () => {
  const verified = { id: 'neon-auth-subject', user_metadata: { display_name: 'Owner' } };
  const checked = [];
  const calls = [];
  const store = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { sessions: [] } }; } };
  const service = createTrackingService(store, { authenticate: async bearer => {
    checked.push(bearer);
    return bearer === 'valid-token' ? verified : null;
  } });
  for (const bearer of [undefined, null, '', 17, {}, 'x'.repeat(8193)]) assert.equal(await service.authenticate(bearer), null);
  assert.deepEqual(checked, []);
  assert.equal(await service.authenticate('invalid-token'), null);
  const owner = await service.authenticate('valid-token');
  assert.equal(owner, verified);
  await service.perform('list', { ownerId: 'forged-owner' }, owner);
  assert.deepEqual(checked, ['invalid-token', 'valid-token']);
  assert.equal(calls[0].args.p_owner_id, verified.id);
  await assert.rejects(service.perform('list', {}, null), error => error.status === 401);
  assert.equal(await createTrackingService(store).authenticate('valid-token'), null);
  for (const invalidOwner of [{}, { id: 12 }, { id: '' }, { id: 'x'.repeat(513) }]) {
    const invalid = createTrackingService(store, { authenticate: async () => invalidOwner });
    assert.equal(await invalid.authenticate('valid-token'), null);
  }
});

test('Neon adapter executes the real migration from invitation through location removal', async () => {
  const db = new PGlite();
  try {
    const migration = await readFile(new URL('../neon/migrations/20261026000100_private_location_sharing.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const store = createNeonTrackingStore({ query: async (sql, args) => (await db.query(sql, args)).rows });
    const owner = { id: 'neon-owner-subject', user_metadata: { display_name: 'Host' } };
    const service = createTrackingService(store, { authenticate: async bearer => bearer === 'verified-token' ? owner : null });
    const verified = await service.authenticate('verified-token');
    const invitation = await service.perform('create', { name: 'Guest', phone: '+16135550123', durationMinutes: 60 }, verified);
    assert.ok(invitation.session.id);
    assert.equal(invitation.token.length, 43);
    const sharing = await service.perform('start', { token: invitation.token });
    const fix = await service.perform('update', { token: sharing.token, lat: 0, lng: 0, accuracy: 5, capturedAt: new Date().toISOString() });
    assert.ok(fix.updatedAt);
    const ownSessions = await service.perform('list', {}, verified);
    assert.equal(ownSessions.sessions[0].lat, 0);
    assert.deepEqual(await service.perform('list', {}, { id: 'different-verified-owner' }), { sessions: [] });
    await service.perform('stop', { token: sharing.token });
    const stopped = (await service.perform('list', {}, verified)).sessions[0];
    assert.equal(stopped.status, 'stopped');
    assert.equal(stopped.lat, null);
    assert.equal(stopped.lng, null);
    await assert.rejects(service.perform('update', { token: sharing.token, lat: 1, lng: 1, accuracy: 5, capturedAt: new Date().toISOString() }), error => error.status === 410);
  } finally {
    await db.close();
  }
});
