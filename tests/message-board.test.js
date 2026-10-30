import test from 'node:test';
import assert from 'node:assert/strict';
import { boardRequest, mergeBoardPage } from '../src/message-board.js';

const response = (data, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => data });

test('board transport uses same-origin cookies and an allowlist that excludes private workspace fields', async () => {
  let seen;
  const data = await boardRequest('create', { title: 'Rain barrels', body: 'What worked for you?', country: 'CA', region: 'ON', privatePlans: 'never send', ownerId: 'spoof', contacts: ['private'], action: 'moderate' }, { fetchImpl: async (url, options) => { seen = { url, options }; return response({ id: '123' }); } });
  assert.deepEqual(data, { id: '123' });
  assert.equal(seen.url, '/api/board');
  assert.equal(seen.options.method, 'POST');
  assert.equal(seen.options.credentials, 'same-origin');
  assert.equal(seen.options.cache, 'no-store');
  assert.deepEqual(JSON.parse(seen.options.body), { action: 'create', title: 'Rain barrels', body: 'What worked for you?', country: 'CA', region: 'ON' });
});

test('report and moderation send only their designated fields', async () => {
  const bodies = [];
  const fetchImpl = async (_, options) => { bodies.push(JSON.parse(options.body)); return response({ ok: true }); };
  await boardRequest('report', { id: 'post', reason: 'personal', decision: 'hide', canModerate: true }, { fetchImpl });
  await boardRequest('moderate', { id: 'post', decision: 'hide', reason: 'other', owner: true }, { fetchImpl });
  assert.deepEqual(bodies, [{ action: 'report', id: 'post', reason: 'personal' }, { action: 'moderate', id: 'post', decision: 'hide' }]);
  await assert.rejects(boardRequest('invalid', {}, { fetchImpl }), /valid board action/);
  assert.equal(bodies.length, 2);
});

test('server errors, throttling and malformed responses never report success', async () => {
  await assert.rejects(boardRequest('create', {}, { fetchImpl: async () => response({ error: 'Slow down.', code: 'rate_limited' }, 429, { 'Retry-After': '30' }) }), error => error.message === 'Slow down.' && error.status === 429 && error.retryAfter === 30 && error.code === 'rate_limited');
  await assert.rejects(boardRequest('list', {}, { fetchImpl: async () => response(null) }), /unavailable/);
  await assert.rejects(boardRequest('list', {}, { fetchImpl: async () => response(['invalid']) }), /unavailable/);
});

test('navigation cancellation propagates without turning into a misleading timeout', async () => {
  const controller = new AbortController();
  const pending = boardRequest('list', {}, { signal: controller.signal, fetchImpl: (_, options) => new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); }) });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('unconfirmed timed-out writes tell the user to refresh before retrying', async () => {
  await assert.rejects(boardRequest('reply', {}, { timeoutMs: 5, fetchImpl: (_, options) => new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); }) }), /not confirmed.*Refresh/);
});

test('pagination deduplicates records while retaining order and updated server fields', () => {
  const original = { threads: [{ id: 'a', replyCount: 1 }, { id: 'b', replyCount: 0 }], nextCursor: 'one' };
  const next = { threads: [{ id: 'b', replyCount: 2 }, { id: 'c', replyCount: 0 }], nextCursor: null };
  const merged = mergeBoardPage(original, next, 'threads');
  assert.deepEqual(merged, { threads: [{ id: 'a', replyCount: 1 }, { id: 'b', replyCount: 2 }, { id: 'c', replyCount: 0 }], nextCursor: null });
  assert.equal(original.threads[1].replyCount, 0);
});
