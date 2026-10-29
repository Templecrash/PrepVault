import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { createAdvisorHandler } from '../api/advisor.js';
import { createSurvivalAuthHandler } from '../api/survival-auth.js';
import { createHostedSurvivalTickets, SURVIVAL_ORIGIN } from '../api/_lib/hosted-survival-tickets.js';
import { createHostedSurvivalService, normalizeHostedSurvivalAnswer, survivalServerUrl } from '../api/_lib/hosted-survival-service.js';

const owner = { id: 'verified-owner' };
const env = { NEON_AUTH_COOKIE_SECRET: 'a'.repeat(64), SURVIVAL_SERVER_URL: 'https://example--survival.modal.run' };
const clock = 1_793_318_400_987;
const jobId = '863b9cd1-5368-4a9f-af1b-53032622deee';
const input = { messages: [{ role: 'user', content: 'Assess my water supply.' }], context: { inventory: { items: [{ id: 'water', quantity: 5 }] } } };
const headers = { host: 'prepvault-xi.vercel.app', origin: SURVIVAL_ORIGIN, 'content-type': 'application/json' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const decode = ticket => JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8'));
function sign(claims, prefix = 'prepvault-survival-hosted:v1\0') {
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${encoded}.${createHmac('sha256', env.NEON_AUTH_COOKIE_SECRET).update(prefix + encoded, 'utf8').digest('base64url')}`;
}
function recorder() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}
async function request(handler, options = {}) {
  const res = recorder();
  await handler({ method: 'POST', body: input, ...options, headers: { ...headers, ...options.headers } }, res);
  return res;
}
function ticketService(options = {}) { return createHostedSurvivalTickets({ env, now: () => clock, ...options }); }

test('hosted tickets bind exact UTF-8 payload, verified owner, purpose, origin and 120-second lifetime', () => {
  const tickets = ticketService();
  const payload = JSON.stringify({ query: '備え 💧' });
  const seen = new Set();
  for (const purpose of ['status', 'chat', 'result', 'cancel']) {
    const ticket = tickets.issue(payload, purpose, owner);
    const claims = tickets.verify(ticket);
    assert.equal(claims.aud, 'prepvault-survival-hosted');
    assert.equal(claims.origin, SURVIVAL_ORIGIN);
    assert.equal(claims.sub, owner.id);
    assert.equal(claims.purpose, purpose);
    assert.equal(claims.digest, createHash('sha256').update(payload, 'utf8').digest('hex'));
    assert.equal(claims.iat, Math.floor(clock / 1000));
    assert.equal(claims.exp, claims.iat + 120);
    assert.equal(ticket, sign(claims));
    assert.notEqual(ticket, sign(claims, ''));
    assert.equal(seen.has(claims.nonce), false);
    seen.add(claims.nonce);
    assert.equal(JSON.stringify(claims).includes(env.NEON_AUTH_COOKIE_SECRET), false);
  }
});

test('invalid, forged, wrong-domain and expired capabilities fail closed', () => {
  let now = clock;
  const tickets = ticketService({ now: () => now });
  const ticket = tickets.issue('{}', 'status', owner), claims = decode(ticket);
  for (const value of ['', 'invalid', `${ticket}.extra`, 'x'.repeat(2049), sign(claims, ''), sign(claims, 'prepvault-survival-local:v1\0')]) {
    assert.throws(() => tickets.verify(value), error => error.status === 401);
  }
  for (const patch of [{ aud: 'other' }, { origin: 'https://evil.example' }, { sub: 'bad owner' }, { purpose: 'admin' },
    { digest: claims.digest.toUpperCase() }, { exp: claims.exp + 1 }, { iat: claims.iat + 1, exp: claims.exp + 1 },
    { nonce: 'reusable' }, { admin: true }, { v: 2 }]) assert.throws(() => tickets.verify(sign({ ...claims, ...patch })), error => error.status === 401);
  now = claims.exp * 1000 - 1;
  assert.equal(tickets.verify(ticket).sub, owner.id);
  now++;
  assert.throws(() => tickets.verify(ticket), error => error.status === 401);
  assert.throws(() => ticketService({ env: {} }).issue('{}', 'status', owner), error => error.status === 503);
  assert.throws(() => tickets.issue('{}', 'chat', null), error => error.status === 401);
});

test('public verification returns existing claims only and cannot mint a ticket', async () => {
  const tickets = ticketService(), handler = createSurvivalAuthHandler({ tickets, now: () => clock });
  const ticket = tickets.issue('{}', 'status', owner);
  const result = await request(handler, { body: { ticket } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { valid: true, claims: decode(ticket) });
  assert.match(result.headers['cache-control'], /no-store.*private/);
  assert.equal(result.headers['access-control-allow-origin'], undefined);
  for (const [body, status] of [[{ purpose: 'chat', digest: 'a'.repeat(64) }, 400], [{ ticket, ownerId: owner.id }, 400],
    [{ ticket: 'bad' }, 401], [{ ticket: 'x'.repeat(2049) }, 400], [{ ticket: 'x'.repeat(4096) }, 413]]) {
    const res = await request(handler, { body });
    assert.equal(res.statusCode, status);
    assert.equal(res.body.ticket, undefined);
    assert.equal(res.body.claims, undefined);
  }
});

test('verification enforces fixed origin, JSON body limits, method and bounded rate', async () => {
  let now = clock;
  const tickets = ticketService({ now: () => now });
  const handler = createSurvivalAuthHandler({ tickets, now: () => now });
  const ticket = tickets.issue('{}', 'status', owner), body = { ticket };
  for (const override of [{ origin: undefined }, { origin: 'https://evil.example' }, { host: 'preview.vercel.app', origin: 'https://preview.vercel.app' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await request(handler, { body, headers: override })).statusCode, 403);
  }
  assert.equal((await request(handler, { method: 'GET', body })).statusCode, 405);
  assert.equal((await request(handler, { body, headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await request(handler, { body: '{' })).statusCode, 400);
  assert.equal((await request(handler, { body, headers: { 'content-length': '4097' } })).statusCode, 413);
  now += 60_000;
  for (let i = 0; i < 240; i++) assert.equal((await request(handler, { body })).statusCode, 200);
  const limited = await request(handler, { body });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['retry-after'], '60');
});

test('gateway URL is restricted to HTTPS Modal origins without user-controlled paths or credentials', () => {
  assert.equal(survivalServerUrl(env), env.SURVIVAL_SERVER_URL);
  assert.equal(survivalServerUrl({ SURVIVAL_SERVER_URL: `${env.SURVIVAL_SERVER_URL}/` }), env.SURVIVAL_SERVER_URL);
  for (const value of [undefined, 'http://example.modal.run', 'https://modal.run', 'https://modal.run.evil.example', 'https://evil.example',
    'http://127.0.0.1:8766', 'https://example.modal.run:8443', 'https://user:pass@example.modal.run',
    'https://example.modal.run/chat', 'https://example.modal.run?x=1', 'https://example.modal.run#fragment']) {
    assert.equal(survivalServerUrl({ SURVIVAL_SERVER_URL: value }), null);
  }
});

test('unconfigured hosted service never calls OpenAI or any fallback even if an OpenAI key exists', async () => {
  let calls = 0;
  const service = createHostedSurvivalService({ env: { NEON_AUTH_COOKIE_SECRET: env.NEON_AUTH_COOKIE_SECRET, OPENAI_API_KEY: 'present-but-not-used' }, fetch: async () => { calls++; throw Error('must not fetch'); } });
  assert.equal(service.isConfigured(), false);
  assert.equal((await service.status(owner)).configured, false);
  await assert.rejects(service.assess(input, owner), error => error.status === 503);
  assert.equal(calls, 0);
});

test('status only contacts CPU status and projects safe configuration metadata', async () => {
  const requests = [];
  const tickets = ticketService();
  const service = createHostedSurvivalService({ env, tickets, fetch: async (url, options) => {
    requests.push({ url, options });
    return json({ configured: true, model: 'nemotron', library: { ready: true, articles: 238 }, privatePath: '/secret' });
  } });
  assert.deepEqual(await service.status(owner), { configured: true, engine: 'Survival LLM', transport: 'hosted', model: 'nemotron', libraryArticles: 238, error: '' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${env.SURVIVAL_SERVER_URL}/status`);
  const envelope = JSON.parse(requests[0].options.body);
  assert.equal(envelope.payload, '{}');
  assert.equal(tickets.verify(envelope.ticket).purpose, 'status');
});

test('start, poll and cancel bind exact payloads to fresh owner-bound capabilities', async () => {
  const calls = [], tickets = ticketService();
  const service = createHostedSurvivalService({ env, tickets, fetch: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/chat')) return json({ jobId }, 202);
    if (url.endsWith('/result')) return json({ status: 'pending' });
    return json({ status: 'cancelled' });
  } });
  const privateInput = { ...input, context: { ...input.context, password: 'secret-input' } };
  assert.deepEqual(await service.assess(privateInput, owner), { status: 'pending', jobId });
  assert.deepEqual(await service.result(jobId, owner), { status: 'pending', jobId });
  assert.deepEqual(await service.cancel(jobId, owner), { status: 'cancelled', jobId });
  const nonces = new Set();
  for (const [i, { url, options }] of calls.entries()) {
    assert.equal(url, `${env.SURVIVAL_SERVER_URL}/${['chat', 'result', 'cancel'][i]}`);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Origin, SURVIVAL_ORIGIN);
    assert.equal(options.body.includes(env.NEON_AUTH_COOKIE_SECRET), false);
    assert.equal(options.body.includes('secret-input'), false);
    const body = JSON.parse(options.body), claims = tickets.verify(body.ticket);
    assert.deepEqual(Object.keys(body).sort(), ['payload', 'ticket']);
    assert.equal(claims.sub, owner.id);
    assert.equal(claims.digest, createHash('sha256').update(body.payload).digest('hex'));
    nonces.add(claims.nonce);
    if (i) assert.deepEqual(JSON.parse(body.payload), { jobId });
  }
  assert.equal(nonces.size, 3);
});

test('completed responses retain bounded references without unsafe links or private extra fields', async () => {
  const data = { status: 'done', reply: ' Review water. ', model: 'model', trace: 'private', sources: [null,
    { title: 'Reference', url: 'https://example.com/guide', excerpt: 'Useful text', token: 'private' },
    { url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.com/' }] };
  const service = createHostedSurvivalService({ env, fetch: async () => json(data) });
  const result = await service.result(jobId, owner);
  assert.equal(result.reply, 'Review water.');
  assert.equal(result.sources.length, 3);
  assert.equal(result.sources[0].url, 'https://example.com/guide');
  assert.equal(result.sources[1].url, '');
  assert.equal(result.sources[2].url, '');
  assert.equal(result.trace, undefined);
  assert.equal(result.sources[0].token, undefined);
  assert.throws(() => normalizeHostedSurvivalAnswer({ reply: 'x'.repeat(32001) }));
});

test('remote failures and oversized or incomplete output never reveal provider details or fallback', async () => {
  for (const response of [() => json({ status: 'error', error: 'secret-server-path' }), () => json({ status: 'done', reply: '' }),
    () => json({ error: 'secret' }, 500), () => json({ status: 'unexpected', reply: 'Do not display' }),
    () => new Response('{'), () => json({ reply: 'x'.repeat(257 * 1024) })]) {
    let calls = 0;
    const service = createHostedSurvivalService({ env, fetch: async () => { calls++; return response(); } });
    await assert.rejects(service.result(jobId, owner), error => error.status === 503 && !error.message.includes('secret'));
    assert.equal(calls, 1);
  }
  const contextTooLarge = createHostedSurvivalService({ env, fetch: async () => json({ code: 'context_too_large', error: 'private' }, 413) });
  await assert.rejects(contextTooLarge.assess(input, owner), error => error.status === 413 && !error.message.includes('private'));
});

test('separate poll allowance keeps a long-running job usable after chat rate limit', async () => {
  let now = clock;
  const service = createHostedSurvivalService({ env, now: () => now, fetch: async url => url.endsWith('/chat') ? json({ jobId }, 202) : json({ status: 'pending' }) });
  for (let i = 0; i < 6; i++) await service.assess(input, owner);
  await assert.rejects(service.assess(input, owner), error => error.status === 429);
  for (let i = 0; i < 60; i++) await service.result(jobId, owner);
  await assert.rejects(service.result(jobId, owner), error => error.status === 429);
  now += 60_000;
  assert.equal((await service.assess(input, owner)).status, 'pending');
});

test('proxy timeouts release request slots and surface a retryable error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let blocked = true;
  const service = createHostedSurvivalService({ env, fetch: async (_url, options) => {
    if (!blocked) return json({ jobId }, 202);
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
  } });
  const pending = service.assess(input, owner);
  t.mock.timers.tick(25_000);
  await assert.rejects(pending, error => error.status === 504);
  blocked = false;
  assert.equal((await service.assess(input, owner)).status, 'pending');
});

test('API maps start/poll/cancel and checks owner before and after each operation', async () => {
  const operations = [];
  const service = { status: async () => ({ configured: true }), assess: async () => ({ status: 'pending', jobId }),
    result: async id => { operations.push(['result', id]); return { reply: 'Done', sources: [] }; },
    cancel: async id => { operations.push(['cancel', id]); return { status: 'cancelled', jobId: id }; } };
  let checks = 0;
  const handler = createAdvisorHandler({ authenticate: async () => { checks++; return owner; }, getService: () => service });
  assert.equal((await request(handler)).statusCode, 202);
  assert.equal((await request(handler, { body: { jobId } })).statusCode, 200);
  assert.equal((await request(handler, { body: { jobId, action: 'cancel' } })).body.status, 'cancelled');
  assert.equal((await request(handler, { method: 'GET' })).body.configured, true);
  assert.equal(checks, 8);
  assert.deepEqual(operations, [['result', jobId], ['cancel', jobId]]);
});

test('API rejects forged job controls and discards status, job IDs and replies after revocation', async () => {
  const service = { status: async () => ({ configured: true }), assess: async () => ({ status: 'pending', jobId }), result: async () => ({ reply: 'Private reply' }), cancel: async () => ({ status: 'cancelled' }) };
  const handler = createAdvisorHandler({ authenticate: async () => owner, getService: () => service });
  for (const body of [{ jobId: '../private' }, { jobId: 'x' }, { jobId, action: 'delete' }, { jobId, ownerId: 'other' }, { jobId, messages: [] }, { jobId, action: 'cancel', url: 'evil' }]) {
    assert.equal((await request(handler, { body })).statusCode, 400);
  }
  for (const options of [{}, { body: { jobId } }, { body: { jobId, action: 'cancel' } }, { method: 'GET' }]) {
    let checks = 0;
    const revoked = createAdvisorHandler({ authenticate: async () => ++checks === 1 ? owner : null, getService: () => service });
    const res = await request(revoked, options);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.jobId, undefined);
    assert.equal(res.body.reply, undefined);
    assert.equal(res.body.configured, undefined);
  }
});

test('newly created jobs are cancelled if the final owner check fails, without masking its error', async () => {
  for (const mode of ['revoked', 'changed', 'unavailable']) {
    for (const cancelFails of [false, true]) {
      let checks = 0;
      const cancellations = [];
      const service = { assess: async () => ({ status: 'pending', jobId }), cancel: async (...args) => {
        cancellations.push(args);
        if (cancelFails) throw Error('cleanup secret detail');
        return { status: 'cancelled' };
      } };
      const handler = createAdvisorHandler({ getService: () => service, authenticate: async () => {
        if (++checks === 1) return owner;
        if (mode === 'unavailable') throw Error('auth secret detail');
        return mode === 'changed' ? { id: 'new-owner' } : null;
      } });
      const res = await request(handler);
      assert.equal(res.statusCode, mode === 'unavailable' ? 503 : 401);
      assert.deepEqual(cancellations, [[jobId, owner, { timeoutMs: 3000 }]]);
      assert.equal(res.body.jobId, undefined);
      assert.equal(JSON.stringify(res.body).includes('secret detail'), false);
    }
  }
});

test('owner check failures do not cancel existing polled jobs or successful new jobs', async () => {
  for (const [body, revoke] of [[{ jobId }, true], [input, false]]) {
    let checks = 0, cancelled = false;
    const service = { assess: async () => ({ status: 'pending', jobId }), result: async () => ({ status: 'pending', jobId }),
      cancel: async () => { cancelled = true; } };
    const handler = createAdvisorHandler({ getService: () => service, authenticate: async () => ++checks > 1 && revoke ? null : owner });
    assert.equal((await request(handler, { body })).statusCode, revoke ? 401 : 202);
    assert.equal(cancelled, false);
  }
});

test('best-effort cancellation uses its shorter request deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  const service = createHostedSurvivalService({ env, fetch: async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(Error('cancel timeout')); }, { once: true });
  }) });
  const pending = service.cancel(jobId, owner, { timeoutMs: 3000 });
  t.mock.timers.tick(2999);
  assert.equal(aborted, false);
  t.mock.timers.tick(1);
  await assert.rejects(pending, error => error.status === 504);
  assert.equal(aborted, true);
});
