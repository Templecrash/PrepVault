import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAdvisorContext } from '../src/advisor-context.js';
import { askAdvisor, getAdvisorStatus, normalizeAdvisorAnswer } from '../src/advisor-client.js';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('advisor status sends no app context and requests use same-origin cookies without cache or redirects', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return response(options.method === 'GET' ? { configured: true } : { reply: 'Review your water reserve.' });
  });
  assert.deepEqual(await getAdvisorStatus(), { configured: true, model: '', libraryArticles: 0, error: '' });
  assert.deepEqual(await askAdvisor([{ role: 'user', content: 'Assess my supplies.' }], { inventory: [] }), { reply: 'Review your water reserve.', model: '', sources: [] });
  assert.equal(requests[0].options.body, undefined);
  for (const { url, options } of requests) {
    assert.equal(url, '/api/advisor');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
  }
  assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
});

test('each advisor request serializes fresh context and sends only message roles and content', async t => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return response({ reply: 'Recorded.' });
  });
  const context = { inventory: { items: [{ id: 'water', quantity: 1 }] } };
  const messages = [{ role: 'user', content: 'Assess this.', privateUiState: 'excluded' }];
  await askAdvisor(messages, context);
  context.inventory.items[0].quantity = 5;
  await askAdvisor(messages, context);
  assert.equal(bodies[0].context.inventory.items[0].quantity, 1);
  assert.equal(bodies[1].context.inventory.items[0].quantity, 5);
  assert.deepEqual(bodies[1].messages, [{ role: 'user', content: 'Assess this.' }]);
  assert.equal(messages[0].privateUiState, 'excluded');
});

test('long conversations trim old exchanges while preserving the current question and character limits', async t => {
  let submitted;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    submitted = JSON.parse(options.body).messages;
    return response({ reply: 'Done.' });
  });
  const messages = Array.from({ length: 32 }, (_value, index) => ({
    role: index % 2 ? 'assistant' : 'user', content: (index % 2 ? 'a' : 'u').repeat(index % 2 ? 32000 : 6000),
  }));
  messages.push({ role: 'user', content: 'The newest question.' });
  await askAdvisor(messages, {});
  assert.equal(submitted[0].role, 'user');
  assert.deepEqual(submitted.at(-1), messages.at(-1));
  assert.ok(submitted.length <= 20);
  assert.ok(submitted.reduce((total, message) => total + message.content.length, 0) <= 60000);
  assert.equal(messages.length, 33);
});

test('owner authorization failures remain distinguishable from service and setup errors', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ error: 'Owner sign-in required.', code: 'unauthorized' }, 401));
  await assert.rejects(askAdvisor([{ role: 'user', content: 'Question' }], {}), error => error.status === 401 && error.code === 'unauthorized');
  fetch.mock.mockImplementation(async () => response({ error: 'Owner access only.', code: 'forbidden' }, 403));
  await assert.rejects(getAdvisorStatus(), error => error.status === 403);
  fetch.mock.mockImplementation(async () => response({ error: 'The advisor connection is unavailable.', code: 'unavailable' }, 503));
  await assert.rejects(getAdvisorStatus(), error => error.status === 503 && error.message === 'The advisor connection is unavailable.');
  fetch.mock.mockImplementation(async () => response({ configured: false }));
  assert.deepEqual(await getAdvisorStatus(), { configured: false, model: '', libraryArticles: 0, error: '' });
});

test('Unicode conversation history respects the total UTF-8 request limit alongside app context', async t => {
  let submitted;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    submitted = options.body;
    return response({ reply: 'Done.' });
  });
  const context = { inventory: { items: Array.from({ length: 800 }, (_value, id) => ({ id, notes: 'x'.repeat(160) })) } };
  const messages = [
    { role: 'user', content: 'u'.repeat(6000) },
    { role: 'assistant', content: '準'.repeat(32000) },
    { role: 'user', content: 'u'.repeat(6000) },
    { role: 'assistant', content: '備'.repeat(10000) },
    { role: 'user', content: 'Please review the latest changes.' },
  ];
  const byteLength = value => new TextEncoder().encode(value).length;
  assert.ok(byteLength(JSON.stringify(context)) <= 150 * 1024);
  assert.ok(byteLength(JSON.stringify({ messages, context })) > 256 * 1024);
  await askAdvisor(messages, context);
  assert.ok(byteLength(submitted) <= 256 * 1024);
  const result = JSON.parse(submitted);
  assert.deepEqual(result.messages.at(-1), messages.at(-1));
  assert.equal(result.messages[0].role, 'user');
  assert.deepEqual(result.context, sanitizeAdvisorContext(context));
});

test('invalid status, empty replies and non-JSON responses are not treated as successful answers', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ configured: 'yes' }));
  await assert.rejects(getAdvisorStatus(), /could not be checked/);
  fetch.mock.mockImplementation(async () => response({ reply: '  ' }));
  await assert.rejects(askAdvisor([], {}), /empty reply/);
  fetch.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => { throw Error('Not JSON'); } }));
  await assert.rejects(getAdvisorStatus(), /unavailable/);
});

test('an already-cancelled request never sends context', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw Error('Should not fetch'); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(askAdvisor([{ role: 'user', content: 'Private question' }], { private: true }, { signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(fetch.mock.callCount(), 0);
});

test('cancellation rejects late responses even if the transport ignores the abort signal', async t => {
  let release;
  t.mock.method(globalThis, 'fetch', async () => new Promise(resolve => { release = resolve; }));
  const controller = new AbortController();
  const pending = askAdvisor([{ role: 'user', content: 'Question' }], {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  release(response({ reply: 'Stale private response' }));
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

test('Stop during job creation returns immediately and cancels the late job without resending context', async t => {
  let release;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (calls.length === 1) return new Promise(resolve => { release = resolve; });
    return response({ status: 'cancelled' });
  });
  const controller = new AbortController();
  const onProgress = t.mock.fn();
  const pending = askAdvisor([{ role: 'user', content: 'Private question' }], { inventory: [] }, { signal: controller.signal, onProgress });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.signal.aborted, false);
  release(response({ status: 'pending', jobId: 'late-created-job' }, 202));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, '/api/advisor');
  assert.deepEqual(calls[1].body, { jobId: 'late-created-job', action: 'cancel' });
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(calls[1].options.keepalive, true);
  assert.equal(calls[1].options.signal, undefined);
  assert.equal(onProgress.mock.callCount(), 0);
});

test('Stop while reading the creation response still cancels its late job ID', async t => {
  let releaseBody;
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length > 1) return response({ status: 'cancelled' });
    return { ok: true, status: 202, json: () => new Promise(resolve => { releaseBody = resolve; }) };
  });
  const controller = new AbortController();
  const pending = askAdvisor([{ role: 'user', content: 'Private question' }], {}, { signal: controller.signal });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  releaseBody({ status: 'pending', jobId: 'late-parsed-job' });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepEqual(bodies[1], { jobId: 'late-parsed-job', action: 'cancel' });
  assert.equal(bodies.length, 2);
});

test('abandoned creation retains its 35-second transport bound and handles a late failure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let transportSignal;
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((_resolve, reject) => {
    transportSignal = options.signal;
    transportSignal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const pending = askAdvisor([{ role: 'user', content: 'Question' }], {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  t.mock.timers.tick(34999);
  assert.equal(transportSignal.aborted, false);
  t.mock.timers.tick(1);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(transportSignal.aborted, true);
  assert.equal(fetch.mock.callCount(), 1);
});

test('abandoned creation never cancels an invalid late ID or retries an authorization failure', async t => {
  for (const lateResponse of [response({ status: 'pending', jobId: '../admin' }, 202), response({ error: 'Owner sign-in required.' }, 401)]) {
    let release;
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Promise(resolve => { release = resolve; }));
    const controller = new AbortController();
    const pending = askAdvisor([{ role: 'user', content: 'Question' }], {}, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    release(lateResponse);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test('cancellation while parsing also rejects the response', async t => {
  let release;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: () => new Promise(resolve => { release = resolve; }) }));
  const controller = new AbortController();
  const pending = getAdvisorStatus({ signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  release({ configured: true });
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('35-second request timeout produces a retryable explanation rather than an expired-session error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
  }));
  const pending = askAdvisor([{ role: 'user', content: 'Question' }], {});
  t.mock.timers.tick(35000);
  await assert.rejects(pending, error => /too long/.test(error.message) && error.status === undefined);
});

test('a hosted job polls only the owner API and returns real source metadata', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return response(calls.length === 1 ? { status: 'pending', jobId: 'fc-test12345' } : {
      reply: 'Store more water.', model: 'nemotron-3.5-super', sources: [{ title: 'Water storage', url: 'https://example.org/water', license: 'CC BY', excerpt: 'An excerpt.' }],
    });
  });
  const progress = [];
  const pending = askAdvisor([{ role: 'user', content: 'Assess supplies' }], {}, { onProgress: message => progress.push(message) });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  t.mock.timers.tick(5000);
  const answer = await pending;
  assert.equal(answer.model, 'nemotron-3.5-super');
  assert.equal(answer.sources[0].title, 'Water storage');
  assert.equal(progress.length, 1);
  assert.deepEqual(calls[1], { url: '/api/advisor', body: { jobId: 'fc-test12345' } });
  assert.equal(calls.length, 2);
});

test('closing a pending chat requests cancellation without resending private context', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return response({ status: 'pending', jobId: 'fc-test12345' });
  });
  const controller = new AbortController();
  const pending = askAdvisor([{ role: 'user', content: 'Private question' }], { supplies: [] }, { signal: controller.signal });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.deepEqual(bodies[1], { jobId: 'fc-test12345', action: 'cancel' });
});

test('a slow cold startup can finish after ten minutes but before job expiration', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    if (requests === 2) now = 11 * 60_000;
    return response(requests < 3 ? { status: 'pending', jobId: 'cold-start-job' } : { reply: 'Assessment ready.' });
  });
  const pending = askAdvisor([{ role: 'user', content: 'Assess supplies.' }], {});
  for (let i = 0; i < 10; i++) await Promise.resolve();
  t.mock.timers.tick(5000);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  t.mock.timers.tick(5000);
  assert.equal((await pending).reply, 'Assessment ready.');
  assert.equal(requests, 3);
});

test('an overlong job is cancelled before server expiration', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 2) now = 14 * 60_000;
    return response({ status: 'pending', jobId: 'cold-start-job' });
  });
  const pending = askAdvisor([{ role: 'user', content: 'Assess supplies.' }], {});
  for (let i = 0; i < 10; i++) await Promise.resolve();
  t.mock.timers.tick(5000);
  await assert.rejects(pending, /took too long/);
  assert.deepEqual(bodies.at(-1), { jobId: 'cold-start-job', action: 'cancel' });
});

test('source links cannot contain executable URLs or credentials', () => {
  const answer = normalizeAdvisorAnswer({ reply: 'Answer', sources: [
    { url: 'javascript:alert(1)', title: 'a' }, { url: 'https://secret:token@example.org/', title: 'b' },
    { url: 'https://example.org/reference', title: 'c' }, null,
  ] });
  assert.deepEqual(answer.sources.map(source => source.url), ['', '', 'https://example.org/reference']);
});

test('invalid job IDs never trigger polling', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ status: 'pending', jobId: '../admin' }));
  await assert.rejects(askAdvisor([{ role: 'user', content: 'Hello' }], {}), /invalid job/);
  assert.equal(fetch.mock.callCount(), 1);
});
