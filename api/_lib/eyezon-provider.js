import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';

// Verified first-party portal contract, 2026-10-26. This is the portal's own
// session interface, not a public third-party API. Only fixed login and status
// pages are requested. No alarm-control endpoint or client-provided URL exists.
const ORIGIN = 'https://portal.eyezon.com';
const LOGIN = `${ORIGIN}/app/login.php`;
const MAIN = `${ORIGIN}/app/index.php`;
const PROCESS_LOGIN = `${ORIGIN}/app/partials/_process/processLogin.php`;
const HTML_LIMIT = 2 * 1024 * 1024;
const TIMEOUT = 15_000;
const SESSION_LIFETIME = 12 * 60 * 60 * 1000;
const COOKIE_NAME = 'PHPSESSID';
const COOKIE_VALUE = /^[A-Za-z0-9,-]{16,256}$/;

export class EyezonProviderError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'EyezonProviderError';
    Object.assign(this, { status, code });
  }
}

const unavailable = () => new EyezonProviderError(503, 'eyezon_unavailable', 'EyezOn is unavailable. Try again shortly.');
const malformed = () => new EyezonProviderError(502, 'eyezon_invalid_response', 'EyezOn returned a status page this connector cannot verify. Open the EyezOn portal to check your system.');
const reconnect = () => new EyezonProviderError(409, 'eyezon_reconnect_required', 'Your EyezOn connection has expired. Connect your account again.');
const challenge = () => new EyezonProviderError(409, 'eyezon_verification_required', 'Complete the additional sign-in step in the EyezOn portal before connecting.');
const clean = (value, maximum = 160) => String(value || '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);

function text($, element, maximum) {
  const copy = $(element).clone();
  copy.find('script, style, template, noscript, [hidden], [aria-hidden="true"]').remove();
  return clean(copy.text(), maximum);
}

function statusCode(value) {
  const statuses = new Map([
    ['Away Armed', 'armed_away'], ['Stay Armed', 'armed_stay'], ['Home Armed', 'armed_stay'],
    ['Disarmed', 'disarmed'], ['Ready', 'ready'], ['Not Ready', 'not_ready'],
    ['In Alarm', 'alarm'], ['Alarm', 'alarm'], ['Entry Delay', 'entry_delay'], ['Exit Delay', 'exit_delay'],
  ]);
  return statuses.get(value) || 'unknown';
}

function isLoginPage($) {
  return $('#kt_login_form, form input[type="password"]').length > 0;
}

export function parseEyezonStatus(html, { now = Date.now } = {}) {
  if (typeof html !== 'string' || !html || Buffer.byteLength(html) > HTML_LIMIT) throw malformed();
  const $ = load(html);
  if (isLoginPage($)) throw reconnect();
  const cards = $('.kt-widget-14__content').toArray();
  if (!cards.length || cards.length > 100) throw malformed();
  const systems = [];
  const seen = new Set();
  for (const card of cards) {
    const heading = $(card).children('a').children('h3.kt-widget-14__title');
    const desc = $(card).children('.kt-widget-14__desc');
    if (heading.length !== 1 || desc.length !== 1) throw malformed();
    const name = text($, heading, 200);
    const mac = text($, desc.children('div').first(), 32).replace(/[:-]/g, '').toLowerCase();
    const updates = desc.find('[id]').toArray().filter(element => /^s\d+update$/.test($(element).attr('id')));
    if (!name || !/^[a-f0-9]{12}$/.test(mac) || updates.length !== 1 || seen.has(mac)) throw malformed();
    const prefix = $(updates[0]).attr('id').replace(/update$/, '');
    const connectionElements = desc.find(`[id="${prefix}con"]`);
    const connection = text($, connectionElements, 120);
    const reportedAt = text($, updates[0], 120);
    const model = clean(desc.contents().toArray().filter(node => node.type === 'text').map(node => node.data).join(' '), 120).replace(/\s*-\s*$/, '').trim();
    if (connectionElements.length !== 1 || !connection || !reportedAt || !model || model.length > 80 || !/[A-Za-z0-9]/.test(model)) throw malformed();
    const partitions = [];
    for (let number = 1; number <= 8; number += 1) {
      const matches = $(card).find(`[id="${prefix}p${number}stat"]`);
      if (matches.length > 1) throw malformed();
      const reportedStatus = text($, matches, 120);
      if (!reportedStatus) continue;
      partitions.push({ id: String(number), label: `Partition ${number}`, status: connection === 'Normal' ? statusCode(reportedStatus) : 'unknown', reportedStatus });
    }
    if (!partitions.length) throw malformed();
    const unique = new Set(partitions.map(partition => partition.status));
    const status = connection === 'Normal' ? (unique.size === 1 ? partitions[0].status : 'mixed') : 'unknown';
    systems.push({ id: createHash('sha256').update(mac).digest('hex').slice(0, 24), name, model, connection, status, partitions, reportedAt });
    seen.add(mac);
  }
  return { systems, checkedAt: new Date(now()).toISOString() };
}

async function readText(response, limit) {
  if (!response.body || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw malformed();
  }
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw malformed(); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}

function cookieHeader(cookies) {
  if (!Array.isArray(cookies) || cookies.length !== 1 || cookies[0]?.name !== COOKIE_NAME || !COOKIE_VALUE.test(cookies[0]?.value)) throw reconnect();
  return `${COOKIE_NAME}=${cookies[0].value}`;
}

function updateCookies(response, jar) {
  const headers = response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean);
  const matches = headers.map(header => header.split(';')[0]).filter(pair => pair.startsWith(`${COOKIE_NAME}=`));
  if (matches.length > 1) throw malformed();
  if (matches.length) {
    const value = matches[0].slice(COOKIE_NAME.length + 1);
    if (!COOKIE_VALUE.test(value)) throw reconnect();
    jar.splice(0, jar.length, { name: COOKIE_NAME, value });
  }
}

function verifiedRedirect(value, destination = MAIN) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\r\n<>]/.test(value)) return false;
  let url;
  try { url = new URL(value.trim(), `${ORIGIN}/app/`); } catch { return false; }
  const expected = new URL(destination);
  return url.origin === ORIGIN && url.pathname === expected.pathname && !url.username && !url.password && !url.hash;
}

export function createEyezonProvider({ fetch: request = globalThis.fetch, now = Date.now } = {}) {
  async function perform(url, options, parse) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await request(url, { ...options, redirect: 'manual', signal: controller.signal });
      const result = await parse(response);
      if (controller.signal.aborted) throw unavailable();
      return result;
    } catch (error) {
      if (error instanceof EyezonProviderError) throw error;
      throw unavailable();
    } finally { clearTimeout(timeout); }
  }

  function verifyResponse(response) {
    if (response.status === 429) throw new EyezonProviderError(429, 'eyezon_rate_limited', 'EyezOn has received too many requests. Wait a moment and try again.');
    if ([401, 403].includes(response.status)) throw reconnect();
    if (response.status >= 300 && response.status < 400) {
      if (verifiedRedirect(response.headers.get('location'), LOGIN)) throw reconnect();
      throw malformed();
    }
    if (!response.ok) throw unavailable();
  }

  async function status(session) {
    if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= now()) throw reconnect();
    const cookie = cookieHeader(session.sessionCookies);
    return perform(MAIN, { method: 'GET', headers: { Cookie: cookie, Accept: 'text/html' } }, async response => {
      verifyResponse(response);
      if (!/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) throw malformed();
      return parseEyezonStatus(await readText(response, HTML_LIMIT), { now });
    });
  }

  return {
    async signInEyezon({ email, password } = {}) {
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || !password || password.length > 1024) {
        throw new EyezonProviderError(400, 'eyezon_invalid_credentials', 'Enter your EyezOn email and password.');
      }
      const jar = [];
      await perform(LOGIN, { method: 'GET', headers: { Accept: 'text/html' } }, async response => {
        verifyResponse(response);
        updateCookies(response, jar);
        const html = await readText(response, HTML_LIMIT);
        if (!isLoginPage(load(html)) || !html.includes('partials/_process/processLogin.php')) throw malformed();
      });
      // The public login page sets no cookie. The fixed unauthenticated main
      // page establishes PHPSESSID, then redirects to the login page.
      if (!jar.length) await perform(MAIN, { method: 'GET', headers: { Accept: 'text/html' } }, async response => {
        if (![301, 302, 303].includes(response.status) || !verifiedRedirect(response.headers.get('location'), LOGIN)) throw malformed();
        updateCookies(response, jar);
        await response.body?.cancel();
      });
      const cookie = cookieHeader(jar);
      const body = new URLSearchParams({ username: email.trim(), password }).toString();
      await perform(PROCESS_LOGIN, {
        method: 'POST', headers: { Cookie: cookie, Origin: ORIGIN, Referer: LOGIN, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'text/plain, text/html;q=0.9' }, body,
      }, async response => {
        verifyResponse(response);
        updateCookies(response, jar);
        const result = (await readText(response, 4096)).trim();
        if (['invalid', 'bademailformat', 'noemail'].includes(result)) throw new EyezonProviderError(400, 'eyezon_invalid_credentials', 'EyezOn could not verify that email and password.');
        if (result === 'disabled') throw new EyezonProviderError(409, 'eyezon_account_disabled', 'Your EyezOn account is disabled. Open the EyezOn portal for help.');
        if (result === 'maintenance') throw unavailable();
        if (result === 'badservice') throw new EyezonProviderError(409, 'eyezon_account_service', 'This account uses a different EyezOn portal. Open EyezOn to check your account.');
        if (!verifiedRedirect(result)) {
          if (/mfa|two.factor|verif|otp|challenge/i.test(result)) throw challenge();
          throw malformed();
        }
      });
      const session = { sessionCookies: jar.map(value => ({ ...value })), accountEmail: email.trim().toLowerCase(), expiresAt: now() + SESSION_LIFETIME };
      // Authentication succeeds only when the fixed main page contains a
      // complete, structurally validated status card, never on an HTTP 200 alone.
      await status(session);
      return session;
    },
    loadEyezonStatus: status,
  };
}
