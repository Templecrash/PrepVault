import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createTrackingHandler } from '../api/tracking.js';
import { createTrackingService, TrackingError } from '../api/_lib/tracking-service.js';

const owner = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', user_metadata: { display_name: 'Alex' } };
const invitation = 'a'.repeat(43);
const publisher = 'b'.repeat(43);
const time = Date.parse('2026-10-26T12:00:00.000Z');
const location = { token: publisher, lat: 0, lng: 0, accuracy: 5, capturedAt: new Date(time).toISOString() };
const digest = value => createHash('sha256').update(value).digest('hex');

function setup({ result = {}, error = null, user = owner, clock = time } = {}) {
  const calls = [];
  const authCalls = [];
  const tokens = [invitation, publisher];
  const service = createTrackingService({
    auth: { getUser: async bearer => { authCalls.push(bearer); return { data: { user: bearer === 'valid-jwt' ? user : null }, error: null }; } },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: result, error }; },
  }, { now: () => clock, token: () => tokens.shift() });
  return { service, calls, authCalls, handler: createTrackingHandler({ getService: () => service, authenticate: req => {
    const match = /^Bearer (\S+)$/i.exec(String(req.headers.authorization || ''));
    return match ? service.authenticate(match[1]) : null;
  } }) };
}

async function request(handler, body, { headers = {}, method = 'POST' } = {}) {
  const response = { statusCode: 200, headers: {}, body: undefined,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  await handler({ method, body, headers: {
    host: 'prep.example', origin: 'https://prep.example', 'content-type': 'application/json', ...headers,
  } }, response);
  return response;
}

test('owner requests verify bearer identity and scope RPC to the verified owner', async () => {
  const { handler, calls, authCalls } = setup({ result: { sessions: [] } });
  const response = await request(handler, { action: 'list', ownerId: 'attacker' }, { headers: { authorization: 'Bearer valid-jwt' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(authCalls, ['valid-jwt']);
  assert.deepEqual(calls, [{ name: 'prepvault_tracking_action', args: { p_action: 'list', p_owner_id: owner.id } }]);
  assert.deepEqual(response.body, { sessions: [] });
  assert.match(response.headers['cache-control'], /no-store/);
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
});

test('invitation, local account IDs and absent authentication cannot list/create/revoke', async () => {
  for (const action of ['list', 'create', 'revoke']) {
    for (const bearer of [null, invitation, 'local-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']) {
      const { handler, calls } = setup();
      const response = await request(handler, { action, token: invitation }, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
      assert.equal(response.statusCode, 401);
      assert.equal(calls.length, 0);
    }
  }
});

test('even an auth response with a local user ID is rejected', async () => {
  const { handler, calls } = setup({ user: { id: 'local-something' } });
  assert.equal((await request(handler, { action: 'list' }, { headers: { authorization: 'Bearer valid-jwt' } })).statusCode, 401);
  assert.equal(calls.length, 0);
});

test('create stores only an invitation hash and returns its raw capability once', async () => {
  const session = { id: owner.id, name: 'Sam', status: 'invited' };
  const { handler, calls } = setup({ result: { session } });
  const response = await request(handler, { action: 'create', name: ' Sam ', phone: '+15555555555', durationMinutes: 240 }, { headers: { authorization: 'Bearer valid-jwt' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { session, token: invitation });
  assert.equal(calls[0].args.p_new_token_hash, digest(invitation));
  assert.equal(calls[0].args.p_name, 'Sam');
  assert.equal(calls[0].args.p_owner_name, 'Alex');
  assert.ok(!JSON.stringify(calls).includes(invitation));
});

test('invalid create fields do not reach the database', async () => {
  for (const invalid of [{ name: '' }, { name: 'a'.repeat(81) }, { phone: '' }, { phone: '14165550123' }, { phone: '+01234567890' }, { phone: '<script>' }, { phone: '1'.repeat(41) }, { durationMinutes: 0 }, { durationMinutes: '60' }]) {
    const { handler, calls } = setup();
    const response = await request(handler, { action: 'create', name: 'Sam', phone: '+14165550123', durationMinutes: 60, ...invalid }, { headers: { authorization: 'Bearer valid-jwt' } });
    assert.equal(response.statusCode, 400);
    assert.equal(calls.length, 0);
  }
});

test('start exchanges the invitation for a new hashed publish capability', async () => {
  const { service, calls } = setup({ result: { session: { name: 'Sam', status: 'sharing' } } });
  await service.perform('create', { name: 'Sam', phone: '+14165550123', durationMinutes: 60 }, owner);
  const result = await service.perform('start', { token: invitation });
  assert.equal(result.token, publisher);
  assert.deepEqual(calls[1].args, { p_action: 'start', p_token_hash: digest(invitation), p_new_token_hash: digest(publisher) });
  assert.ok(!JSON.stringify(calls).includes(publisher));
});

test('inspect only passes the token hash and needs no owner authentication', async () => {
  const expected = { name: 'Sam', ownerName: 'Alex', expiresAt: '2026-10-26T13:00:00Z', status: 'invited' };
  const { handler, calls, authCalls } = setup({ result: expected });
  const response = await request(handler, { action: 'inspect', token: invitation });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, expected);
  assert.deepEqual(calls[0].args, { p_action: 'inspect', p_token_hash: digest(invitation) });
  assert.equal(authCalls.length, 0);
});

test('a valid owner JWT alone cannot publish location', async () => {
  const { handler, calls } = setup();
  const response = await request(handler, { action: 'update', ...location, token: undefined }, { headers: { authorization: 'Bearer valid-jwt' } });
  assert.equal(response.statusCode, 400);
  assert.equal(calls.length, 0);
});

test('zero coordinates and a fresh fix are valid; server response controls updatedAt', async () => {
  const { handler, calls } = setup({ result: { updatedAt: 'server-time' } });
  const response = await request(handler, { action: 'update', ...location });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { updatedAt: 'server-time' });
  assert.deepEqual(calls[0].args, {
    p_action: 'update', p_token_hash: digest(publisher), p_lat: 0, p_lng: 0, p_accuracy: 5, p_captured_at: location.capturedAt,
  });
});

test('invalid, stale and future fixes cannot reach storage', async () => {
  for (const invalid of [
    { lat: NaN }, { lat: Infinity }, { lat: -90.01 }, { lat: 90.01 }, { lat: '1' },
    { lng: -180.01 }, { lng: 180.01 }, { lng: null }, { accuracy: -1 }, { accuracy: Infinity },
    { capturedAt: 123 }, { capturedAt: 'not a date' }, { capturedAt: '2026-10-26' },
    { capturedAt: new Date(time - 60001).toISOString() }, { capturedAt: new Date(time + 5001).toISOString() },
  ]) {
    const { handler, calls } = setup();
    assert.equal((await request(handler, { action: 'update', ...location, ...invalid })).statusCode, 400);
    assert.equal(calls.length, 0);
  }
});

test('storage terminal states and rate limits are exposed safely', async () => {
  for (const [error, status] of [['not_found', 404], ['unavailable', 410], ['throttled', 429], ['session_limit', 409]]) {
    const { handler } = setup({ result: { error } });
    const response = await request(handler, { action: 'update', ...location });
    assert.equal(response.statusCode, status);
    if (status === 429) assert.equal(response.headers['retry-after'], '3');
  }
});

test('revoke binds the session to the verified owner; client owner IDs are ignored', async () => {
  const { handler, calls } = setup({ result: { ok: true } });
  assert.equal((await request(handler, { action: 'revoke', id: owner.id, ownerId: 'other-owner' }, { headers: { authorization: 'Bearer valid-jwt' } })).statusCode, 200);
  assert.deepEqual(calls[0].args, { p_action: 'revoke', p_owner_id: owner.id, p_session_id: owner.id });
});

test('stop is publish-token scoped without owner or coordinate parameters', async () => {
  const { handler, calls } = setup({ result: { ok: true } });
  const response = await request(handler, { action: 'stop', token: publisher, ownerId: owner.id, lat: 45 });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls[0].args, { p_action: 'stop', p_token_hash: digest(publisher) });
});

test('strict origin, method, JSON and size validation happen before service access', async () => {
  let accessed = false;
  const handler = createTrackingHandler({ getService() { accessed = true; throw Error('must not run'); } });
  const cases = [
    [{ action: 'list' }, { headers: { origin: 'https://evil.example' } }, 403],
    [{ action: 'list' }, { headers: { origin: 'null' } }, 403],
    [{ action: 'list' }, { headers: { origin: 'https://prep.example.evil.com' } }, 403],
    [{ action: 'list' }, { headers: { origin: 'https://prep.example/path' } }, 403],
    [{ action: 'list' }, { method: 'GET' }, 405],
    [{ action: 'list' }, { method: 'OPTIONS' }, 405],
    [{ action: 'list' }, { headers: { 'content-type': 'text/plain' } }, 415],
    ['{broken', {}, 400], [[], {}, 400], [{ action: 'unknown' }, {}, 400],
    [{ action: 'list', data: 'a'.repeat(8192) }, {}, 413],
    [{ action: 'list' }, { headers: { 'content-length': '9000' } }, 413],
  ];
  for (const [body, options, expected] of cases) assert.equal((await request(handler, body, options)).statusCode, expected);
  assert.equal(accessed, false);
});

test('server clients may omit Origin but must still authenticate', async () => {
  const { handler } = setup({ result: { sessions: [] } });
  assert.equal((await request(handler, { action: 'list' }, { headers: { origin: undefined, authorization: 'Bearer valid-jwt' } })).statusCode, 200);
});

test('unconfigured storage and unexpected errors never expose backend data', async () => {
  for (const error of [{ code: 'PGRST202', message: 'secret SQL' }, { code: 'OTHER', message: publisher }]) {
    const { handler } = setup({ error });
    const response = await request(handler, { action: 'inspect', token: invitation });
    assert.equal(response.statusCode, 503);
    assert.ok(!JSON.stringify(response.body).includes(publisher));
    assert.ok(!JSON.stringify(response.body).includes('secret SQL'));
    if (error.code === 'PGRST202') assert.equal(response.body.code, 'not_configured');
  }
  const unavailable = createTrackingHandler({ getService: () => { throw new TrackingError(503, 'not_configured', 'Live location sharing is not configured yet.'); } });
  assert.equal((await request(unavailable, { action: 'list' })).body.code, 'not_configured');
  const unexpected = createTrackingHandler({ getService: () => { throw Error('secret connection string'); } });
  assert.ok(!JSON.stringify((await request(unexpected, { action: 'list' })).body).includes('secret'));
});

test('migration keeps precise locations private and guards atomic state transitions', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261026000200_private_location_sharing.sql', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.private_location_sessions FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.prepvault_tracking_action[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /WHERE invitation_hash = p_token_hash AND status = 'invited' AND expires_at > v_now RETURNING/);
  assert.match(sql, /WHERE publisher_hash = p_token_hash AND status = 'sharing' AND expires_at > v_now/);
  assert.match(sql, /last_fix_at <= v_now - interval '3 seconds'/);
  assert.match(sql, /WHERE id = p_session_id AND owner_id = p_owner_id RETURNING/);
  assert.match(sql, /WHERE expires_at <= v_now AND status IN \('invited', 'sharing'\)/);
});
