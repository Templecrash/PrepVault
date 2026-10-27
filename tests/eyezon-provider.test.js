import test from 'node:test';
import assert from 'node:assert/strict';
import { createEyezonProvider, parseEyezonStatus } from '../api/_lib/eyezon-provider.js';

const epoch = 1_800_000_000_000;
const origin = 'https://portal.eyezon.com';
const login = `${origin}/app/login.php`;
const main = `${origin}/app/index.php`;
const processLogin = `${origin}/app/partials/_process/processLogin.php`;
const cookieValue = '0123456789abcdef0123456789abcdef';
const rotatedCookie = 'fedcba9876543210fedcba9876543210';
const session = () => ({ sessionCookies: [{ name: 'PHPSESSID', value: cookieValue }], accountEmail: 'owner@example.test', expiresAt: epoch + 3_600_000 });
const htmlResponse = (html, options = {}) => new Response(html, { ...options, headers: { 'Content-Type': 'text/html; charset=UTF-8', ...options.headers } });
const loginHtml = '<form id="kt_login_form"><input name="username"><input type="password" name="password"></form><script>$.post("partials/_process/processLogin.php", form)</script>';
const card = ({ index = 1, name = 'Home', mac = '001122334455', model = 'EVL4 UNIVERSAL', connection = 'Normal', status = 'Away Armed', extra = '' } = {}) => `
<div class="carousel-item active"><div class="kt-widget-14__content">
  <a href="details.php?private=not-returned"><h3 class="kt-widget-14__title">${name}</h3></a>
  <div class="kt-widget-14__desc"><div>${mac}</div><div id="s${index}update">2026-10-26 15:30:00</div>${model} - <span id="s${index}con">${connection}</span></div>
  <div id="s${index}p1stat">${status}</div><div id="s${index}p2stat"></div>${extra}
</div></div>`;
const page = (...cards) => `<html><body><main>${cards.join('')}</main></body></html>`;

function loginFixture({ result = 'index.php', statusHtml = page(card()), cookie = cookieValue } = {}) {
  const calls = [];
  const responses = [
    () => htmlResponse(loginHtml),
    () => new Response(null, { status: 302, headers: { Location: login, 'Set-Cookie': `PHPSESSID=${cookie}; path=/` } }),
    () => new Response(result, { headers: { 'Content-Type': 'text/html' } }),
    () => htmlResponse(statusHtml),
  ];
  return { calls, provider: createEyezonProvider({ now: () => epoch, fetch: async (url, options) => {
    calls.push({ url, options });
    const response = responses[calls.length - 1];
    assert.ok(response, 'The connector must not issue extra or arbitrary requests');
    return response();
  } }) };
}

test('parses both observed EVL4 UNIVERSAL and UNO cards with hashed IDs and explicit provider status', () => {
  const data = parseEyezonStatus(page(card(), card({ index: 2, name: 'Cottage &amp; garden', mac: 'aabbccddeeff', model: 'UNO', status: 'Ready' })), { now: () => epoch });
  assert.equal(data.systems.length, 2);
  assert.equal(data.systems[0].model, 'EVL4 UNIVERSAL');
  assert.equal(data.systems[0].status, 'armed_away');
  assert.deepEqual(data.systems[0].partitions, [{ id: '1', label: 'Partition 1', status: 'armed_away', reportedStatus: 'Away Armed' }]);
  assert.equal(data.systems[1].name, 'Cottage & garden');
  assert.equal(data.systems[1].model, 'UNO');
  assert.equal(data.systems[1].status, 'ready');
  assert.equal(data.systems[0].reportedAt, '2026-10-26 15:30:00');
  assert.equal(data.checkedAt, new Date(epoch).toISOString());
  for (const system of data.systems) assert.match(system.id, /^[a-f0-9]{24}$/);
  assert.notEqual(data.systems[0].id, data.systems[1].id);
  for (const secret of ['001122334455', 'aabbccddeeff', 'details.php', 'private=']) assert.equal(JSON.stringify(data).includes(secret), false);
});

test('unrecognized and offline states stay unknown rather than becoming disarmed', () => {
  for (const settings of [{ status: 'Installer maintenance' }, { status: 'Awaiting update' }, { connection: 'Offline' }, { connection: 'Communications lost' }]) {
    const system = parseEyezonStatus(page(card(settings))).systems[0];
    assert.equal(system.status, 'unknown');
    assert.equal(system.partitions[0].status, 'unknown');
    assert.equal(system.partitions[0].reportedStatus, settings.status || 'Away Armed');
  }
});

test('multiple partition states remain separate and differing states are mixed', () => {
  const extra = '<div id="s1p3stat">Not Ready</div><div id="s1p8stat">Future status</div>';
  const system = parseEyezonStatus(page(card({ extra }))).systems[0];
  assert.equal(system.status, 'mixed');
  assert.deepEqual(system.partitions.map(({ id, status }) => ({ id, status })), [{ id: '1', status: 'armed_away' }, { id: '3', status: 'not_ready' }, { id: '8', status: 'unknown' }]);
});

test('parser rejects missing, duplicate, malformed and login-only cards', () => {
  for (const html of [
    '', '<html>Normal Away Armed</html>', JSON.stringify({ status: 'Disarmed' }),
    page(card({ mac: 'not-a-device' })), page(card({ name: '' })), page(card({ model: '' })),
    page(card({ connection: '' })), page(card({ status: '' })), page(card(), card()),
    page(card()).replace('id="s1update"', 'id="other-update"'),
    page(card()).replace('2026-10-26 15:30:00', ''),
    page(card({ extra: '<div id="s1p1stat">Disarmed</div>' })),
    page(card()).replace('kt-widget-14__title', 'unexpected-title'),
  ]) assert.throws(() => parseEyezonStatus(html), error => error.status === 502);
  assert.throws(() => parseEyezonStatus(loginHtml), error => error.status === 409);
  assert.throws(() => parseEyezonStatus(page(card()) + loginHtml), error => error.status === 409);
});

test('scripts, command links and hidden content never become status data or executable requests', () => {
  const html = page(card({ name: 'Home<script>stealSecrets()</script><span hidden>hidden-marker</span>', extra: '<a href="arm.php">Arm</a><script>fetch("https://attacker.example")</script>' }));
  const serialized = JSON.stringify(parseEyezonStatus(html));
  assert.equal(JSON.parse(serialized).systems[0].name, 'Home');
  for (const excluded of ['stealSecrets', 'hidden-marker', 'arm.php', 'attacker.example']) assert.equal(serialized.includes(excluded), false);
});

test('sign-in uses the observed fixed PHP flow and validates the main page before returning a session', async () => {
  const { calls, provider } = loginFixture();
  const connected = await provider.signInEyezon({ email: ' Owner@Example.test ', password: 'private & password=+' });
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [[login, 'GET'], [main, 'GET'], [processLogin, 'POST'], [main, 'GET']]);
  assert.ok(calls.every(({ options }) => options.redirect === 'manual' && options.signal instanceof AbortSignal));
  const auth = calls[2].options;
  assert.deepEqual(Object.fromEntries(new URLSearchParams(auth.body)), { username: 'Owner@Example.test', password: 'private & password=+' });
  assert.equal(auth.headers.Cookie, `PHPSESSID=${cookieValue}`);
  assert.equal(auth.headers.Origin, origin);
  assert.equal(auth.headers.Referer, login);
  assert.equal(calls[3].options.headers.Cookie, `PHPSESSID=${cookieValue}`);
  assert.deepEqual(connected, { sessionCookies: [{ name: 'PHPSESSID', value: cookieValue }], accountEmail: 'owner@example.test', expiresAt: epoch + 12 * 60 * 60 * 1000 });
  assert.equal(JSON.stringify(connected).includes('password'), false);
});

test('fresh login cookie and authenticated cookie rotation are preserved without leaking unrelated cookies', async () => {
  const calls = [];
  const provider = createEyezonProvider({ now: () => epoch, fetch: async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return htmlResponse(loginHtml, { headers: { 'Set-Cookie': `PHPSESSID=${cookieValue}; Path=/; HttpOnly` } });
    if (calls.length === 2) return new Response('/app/index.php', { headers: { 'Set-Cookie': `PHPSESSID=${rotatedCookie}; Path=/; Secure` } });
    return htmlResponse(page(card()));
  } });
  const result = await provider.signInEyezon({ email: 'owner@example.test', password: 'private' });
  assert.deepEqual(calls.map(({ url }) => url), [login, processLogin, main]);
  assert.equal(result.sessionCookies[0].value, rotatedCookie);
  assert.equal(calls[2].options.headers.Cookie, `PHPSESSID=${rotatedCookie}`);
});

test('login redirect is validated but never followed and external redirects are rejected', async () => {
  for (const target of ['https://attacker.example/', '//attacker.example/app/index.php', '/app/arm.php', 'index.php#secret', 'https://user:pass@portal.eyezon.com/app/index.php', '<html>Login succeeded</html>']) {
    const { provider, calls } = loginFixture({ result: target });
    await assert.rejects(provider.signInEyezon({ email: 'owner@example.test', password: 'private' }), error => error.status === 502);
    assert.equal(calls.length, 3);
  }
  const { provider, calls } = loginFixture({ result: `${main}?untrusted=value` });
  await provider.signInEyezon({ email: 'owner@example.test', password: 'private' });
  assert.equal(calls.at(-1).url, main);
});

test('login errors and additional verification receive safe typed errors, never owner 401', async () => {
  for (const [result, status, code] of [
    ['invalid', 400, 'eyezon_invalid_credentials'], ['bademailformat', 400, 'eyezon_invalid_credentials'],
    ['noemail', 400, 'eyezon_invalid_credentials'], ['disabled', 409, 'eyezon_account_disabled'],
    ['maintenance', 503, 'eyezon_unavailable'], ['badservice', 409, 'eyezon_account_service'],
    ['verify-mfa.php', 409, 'eyezon_verification_required'],
  ]) {
    const { provider } = loginFixture({ result });
    await assert.rejects(provider.signInEyezon({ email: 'owner@example.test', password: 'private-password' }), error => {
      assert.equal(error.status, status); assert.equal(error.code, code); assert.equal(error.message.includes('private-password'), false); return true;
    });
  }
});

test('HTTP success or a redirect alone cannot establish a connection without valid system cards', async () => {
  for (const statusHtml of [loginHtml, '<html><div>Normal</div></html>', '<html>Account loaded</html>']) {
    const { provider } = loginFixture({ statusHtml });
    await assert.rejects(provider.signInEyezon({ email: 'owner@example.test', password: 'private' }), error => [409, 502].includes(error.status));
  }
});

test('status uses only fixed main GET with the allowlisted portal session cookie', async () => {
  const calls = [];
  const provider = createEyezonProvider({ now: () => epoch, fetch: async (url, options) => { calls.push({ url, options }); return htmlResponse(page(card())); } });
  const result = await provider.loadEyezonStatus({ ...session(), url: 'https://attacker.example', accessToken: 'not-forwarded', password: 'not-forwarded' });
  assert.equal(result.systems.length, 1);
  assert.equal(calls[0].url, main);
  assert.deepEqual(calls[0].options.headers, { Cookie: `PHPSESSID=${cookieValue}`, Accept: 'text/html' });
});

test('invalid credentials, expired sessions and forged cookie lists fail before network access', async () => {
  let called = false;
  const provider = createEyezonProvider({ now: () => epoch, fetch: async () => { called = true; } });
  for (const value of [{ email: 'bad', password: 'secret' }, { email: 'owner@example.test', password: '' }, { email: 'owner@example.test', password: 'a'.repeat(1025) }]) await assert.rejects(provider.signInEyezon(value));
  for (const value of [null, { ...session(), expiresAt: epoch }, { ...session(), expiresAt: 'tomorrow' }, { ...session(), sessionCookies: [] },
    { ...session(), sessionCookies: [{ name: 'otherCookie', value: cookieValue }] },
    { ...session(), sessionCookies: [{ name: 'PHPSESSID', value: `${cookieValue}; admin=true` }] },
    { ...session(), sessionCookies: [session().sessionCookies[0], session().sessionCookies[0]] },
  ]) await assert.rejects(provider.loadEyezonStatus(value), error => error.status === 409);
  assert.equal(called, false);
});

test('expired portal login redirects, HTTP errors and upstream failures never leak cookies or provider details', async () => {
  for (const [response, status] of [
    [() => new Response(null, { status: 302, headers: { Location: login } }), 409],
    [() => new Response(null, { status: 302, headers: { Location: 'https://attacker.example' } }), 502],
    [() => new Response('private-provider-debug', { status: 401 }), 409],
    [() => new Response('private-provider-debug', { status: 403 }), 409],
    [() => new Response('private-provider-debug', { status: 429 }), 429],
    [() => new Response('private-provider-debug', { status: 500 }), 503],
    [() => { throw Error(`private-provider-debug ${cookieValue}`); }, 503],
    [() => Response.json({ status: 'Disarmed' }), 502],
  ]) {
    const provider = createEyezonProvider({ now: () => epoch, fetch: response });
    await assert.rejects(provider.loadEyezonStatus(session()), error => {
      assert.equal(error.status, status);
      assert.equal(error.message.includes('private-provider-debug'), false);
      assert.equal(error.message.includes(cookieValue), false);
      return true;
    });
  }
});

test('status response is bounded by both declared and streamed body size', async () => {
  for (const response of [
    () => htmlResponse(page(card()), { headers: { 'Content-Length': String(2 * 1024 * 1024 + 1) } }),
    () => htmlResponse('x'.repeat(2 * 1024 * 1024 + 1)),
  ]) {
    const provider = createEyezonProvider({ now: () => epoch, fetch: response });
    await assert.rejects(provider.loadEyezonStatus(session()), error => error.status === 502);
  }
});

test('15-second deadline aborts stalled upstream status requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const provider = createEyezonProvider({ now: () => epoch, fetch: async (_url, options) => new Promise((_resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(Error('private network error')), { once: true });
  }) });
  const pending = provider.loadEyezonStatus(session());
  t.mock.timers.tick(15_000);
  await assert.rejects(pending, error => error.status === 503);
  assert.equal(signal.aborted, true);
});
