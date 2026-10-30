import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Execute the actual production migration, including Postgres roles and ACLs.
// This complements the HTTP/service tests; it does not require cloud credentials.
test('private location database enforces grants and atomic state transitions', async t => {
  const db = new PGlite();
  const ownerA = '11111111-1111-4111-8111-111111111111';
  const ownerB = '22222222-2222-4222-8222-222222222222';
  let sequence = 0;
  const hash = () => createHash('sha256').update(`test capability ${sequence++}`).digest('hex');
  const signature = 'public.prepvault_tracking_action(text,uuid,text,text,text,uuid,text,text,integer,double precision,double precision,double precision,timestamptz)';
  const fields = [
    ['p_action', 'text'], ['p_owner_id', 'uuid'], ['p_owner_name', 'text'],
    ['p_token_hash', 'text'], ['p_new_token_hash', 'text'], ['p_session_id', 'uuid'],
    ['p_name', 'text'], ['p_phone', 'text'], ['p_duration_minutes', 'integer'],
    ['p_lat', 'double precision'], ['p_lng', 'double precision'], ['p_accuracy', 'double precision'],
    ['p_captured_at', 'timestamptz'],
  ];
  const sql = `SELECT public.prepvault_tracking_action(${fields.map(([name, type], index) => `${name} => $${index + 1}::${type}`).join(', ')}) AS result`;
  const call = async (action, params = {}) => {
    const args = { p_action: action, ...params };
    const result = await db.query(sql, fields.map(([name]) => args[name] ?? null));
    return result.rows[0].result;
  };
  const create = async (owner = ownerA) => {
    const invitation = hash();
    const result = await call('create', {
      p_owner_id: owner, p_owner_name: 'Host', p_name: 'Guest', p_phone: '+16135550123',
      p_duration_minutes: 60, p_new_token_hash: invitation,
    });
    assert.ok(result.session?.id, JSON.stringify(result));
    return { invitation, id: result.session.id };
  };
  const start = async session => {
    const publisher = hash();
    const result = await call('start', { p_token_hash: session.invitation, p_new_token_hash: publisher });
    assert.equal(result.session?.status, 'sharing');
    return { ...session, publisher };
  };
  const publish = (session, params = {}) => call('update', {
    p_token_hash: session.publisher, p_lat: 0, p_lng: 0, p_accuracy: 5,
    p_captured_at: new Date().toISOString(), ...params,
  });
  const stored = async id => (await db.query('SELECT * FROM public.private_location_sessions WHERE id = $1', [id])).rows[0];
  const assertNoFix = row => {
    for (const field of ['lat', 'lng', 'accuracy', 'captured_at', 'last_fix_at']) assert.equal(row[field], null, field);
  };

  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${ownerA}'), ('${ownerB}');
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);
    const migration = await readFile(new URL('../supabase/migrations/20261026000200_private_location_sharing.sql', import.meta.url), 'utf8');
    await db.exec(migration);

    await t.test('anonymous and authenticated browser roles cannot read the table or call the service RPC', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        try {
          await assert.rejects(db.query('SELECT * FROM public.private_location_sessions'), error => error.code === '42501');
          await assert.rejects(call('list', { p_owner_id: ownerA }), error => error.code === '42501');
        } finally { await db.exec('RESET ROLE'); }
      }
      const grants = await db.query('SELECT has_function_privilege($1, $2, $3) AS allowed', ['service_role', signature, 'EXECUTE']);
      assert.equal(grants.rows[0].allowed, true);
      const definition = await db.query('SELECT proconfig FROM pg_proc WHERE oid = $1::regprocedure', [signature]);
      assert.deepEqual(definition.rows[0].proconfig, ['search_path=""']);
    });

    await t.test('service role can list only the verified owner supplied by the API', async () => {
      await db.exec('SET ROLE service_role');
      try {
        const first = await create(ownerA);
        const second = await create(ownerB);
        assert.deepEqual((await call('list', { p_owner_id: ownerA })).sessions.map(item => item.id), [first.id]);
        assert.deepEqual((await call('list', { p_owner_id: ownerB })).sessions.map(item => item.id), [second.id]);
        assert.equal((await call('revoke', { p_owner_id: ownerB, p_session_id: first.id })).error, 'not_found');
        assert.equal((await call('list', { p_token_hash: first.invitation })).error, 'not_found');
      } finally { await db.exec('RESET ROLE'); }
    });

    await t.test('claim exchanges invitation for a publish-only capability exactly once', async () => {
      const original = await create();
      const session = await start(original);
      assert.equal((await call('start', { p_token_hash: original.invitation, p_new_token_hash: hash() })).error, 'unavailable');
      assert.equal((await publish(session, { p_token_hash: original.invitation })).error, 'unavailable');
      assert.ok((await publish(session)).updatedAt);
      assert.equal((await stored(session.id)).lat, 0);
      const metadata = await call('inspect', { p_token_hash: session.publisher });
      assert.deepEqual(Object.keys(metadata).sort(), ['expiresAt', 'name', 'ownerName', 'status']);
      assert.equal((await call('list', { p_token_hash: session.publisher })).error, 'not_found');
      assert.equal((await call('revoke', { p_token_hash: session.publisher, p_session_id: session.id })).error, 'not_found');
    });

    await t.test('owner freshness uses GPS capture time while update response uses server receipt time', async () => {
      const session = await start(await create());
      const capturedAt = new Date(Date.now() - 50000).toISOString();
      const update = await publish(session, { p_lat: 45, p_lng: -75, p_captured_at: capturedAt });
      assert.ok(Date.parse(update.updatedAt) - Date.parse(capturedAt) >= 49000);
      const visible = (await call('list', { p_owner_id: ownerA })).sessions.find(item => item.id === session.id);
      assert.equal(Date.parse(visible.updatedAt), Date.parse(capturedAt));
      assert.equal(visible.lat, 45);
      assert.equal(visible.lng, -75);
    });

    await t.test('invalid, stale and out-of-order fixes cannot overwrite a valid current position', async () => {
      const session = await start(await create());
      for (const params of [
        { p_lat: 91 }, { p_lng: -181 }, { p_accuracy: -1 }, { p_accuracy: 1000001 },
        { p_lat: Number.NaN }, { p_lng: Number.POSITIVE_INFINITY },
        { p_captured_at: new Date(Date.now() - 65000).toISOString() },
        { p_captured_at: new Date(Date.now() + 10000).toISOString() },
      ]) assert.equal((await publish(session, params)).error, 'invalid_location');
      const captured = new Date().toISOString();
      assert.ok((await publish(session, { p_lat: 45, p_captured_at: captured })).updatedAt);
      assert.equal((await publish(session, { p_lat: 46, p_captured_at: captured })).error, 'throttled');
      await db.query("UPDATE public.private_location_sessions SET last_fix_at = now() - interval '4 seconds' WHERE id = $1", [session.id]);
      assert.equal((await publish(session, { p_lat: 47, p_captured_at: new Date(Date.parse(captured) - 1000).toISOString() })).error, 'throttled');
      assert.equal((await stored(session.id)).lat, 45);
    });

    await t.test('stop removes the fix, is idempotent, and cannot be undone by a delayed update', async () => {
      const session = await start(await create());
      await publish(session);
      assert.equal((await call('stop', { p_token_hash: session.publisher })).ok, true);
      assert.equal((await call('stop', { p_token_hash: session.publisher })).ok, true);
      assert.equal((await publish(session)).error, 'unavailable');
      assert.equal((await call('start', { p_token_hash: session.invitation, p_new_token_hash: hash() })).error, 'unavailable');
      const row = await stored(session.id);
      assert.equal(row.status, 'stopped');
      assertNoFix(row);
    });

    await t.test('owner revocation prevents claim and prevents further updates', async () => {
      const invitation = await create();
      assert.equal((await call('revoke', { p_owner_id: ownerA, p_session_id: invitation.id })).ok, true);
      assert.equal((await call('start', { p_token_hash: invitation.invitation, p_new_token_hash: hash() })).error, 'unavailable');
      const active = await start(await create());
      await publish(active);
      assert.equal((await call('revoke', { p_owner_id: ownerA, p_session_id: active.id })).ok, true);
      assert.equal((await publish(active)).error, 'unavailable');
      assertNoFix(await stored(active.id));
    });

    await t.test('expired invitations cannot be claimed and expired positions are cleared before reads', async () => {
      const invitation = await create();
      const active = await start(await create());
      await publish(active);
      await db.query("UPDATE public.private_location_sessions SET expires_at = now() - interval '1 second' WHERE id = ANY($1::uuid[])", [[invitation.id, active.id]]);
      assert.equal((await call('start', { p_token_hash: invitation.invitation, p_new_token_hash: hash() })).error, 'unavailable');
      assert.equal((await publish(active)).error, 'unavailable');
      assert.equal((await stored(invitation.id)).status, 'stopped');
      assertNoFix(await stored(active.id));
      const visible = (await call('list', { p_owner_id: ownerA })).sessions.find(item => item.id === active.id);
      assert.equal(visible.lat, null);
      assert.equal(visible.lng, null);
    });

    await t.test('active invitation cap is enforced and revocation releases capacity', async () => {
      await db.exec('DELETE FROM public.private_location_sessions');
      let first;
      for (let index = 0; index < 25; index++) { const session = await create(); first ||= session; }
      const args = { p_owner_id: ownerA, p_owner_name: 'Host', p_name: 'Guest', p_phone: '', p_duration_minutes: 60, p_new_token_hash: hash() };
      assert.equal((await call('create', args)).error, 'session_limit');
      await call('revoke', { p_owner_id: ownerA, p_session_id: first.id });
      assert.ok((await call('create', { ...args, p_new_token_hash: hash() })).session);
    });
  } finally { await db.close(); }
});
