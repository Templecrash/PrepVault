import { Buffer } from 'node:buffer';
import process from 'node:process';
import { TrackingError } from './tracking-service.js';

const MAX_BODY_BYTES = 4096;
const SESSION_COOKIE = '__Secure-neon-auth.session_token';
const paths = new Map([
  ['get-session', 'GET'],
  ['email-otp/send-verification-otp', 'POST'],
  ['sign-in/email-otp', 'POST'],
  ['sign-out', 'POST'],
]);
const unavailable = () => new TrackingError(503, 'not_configured', 'Private sign-in is not configured yet.');
const forbidden = () => new TrackingError(403, 'forbidden', 'Use private sign-in on this site.');

function readConfig(env) {
  let base;
  try { base = new URL(env.NEON_AUTH_BASE_URL); } catch { throw unavailable(); }
  const ownerEmail = String(env.TRACKING_OWNER_EMAIL || '').trim().toLowerCase();
  const secret = env.NEON_AUTH_COOKIE_SECRET;
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash ||
      !base.pathname.replace(/\/$/, '').endsWith('/auth') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
      typeof secret !== 'string' || secret.length < 32) throw unavailable();
  return { baseUrl: base.href.replace(/\/$/, ''), cookieSecret: secret, ownerEmail, ownerId: env.TRACKING_OWNER_ID || null };
}

export function requestOrigin(req) {
  const host = String(req.headers.host || '');
  if (!host || /[\s/@?#\\]/.test(host)) throw forbidden();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  const protocol = local && req.headers['x-forwarded-proto'] !== 'https' ? 'http' : 'https';
  return `${protocol}://${host.toLowerCase()}`;
}

export function assertAuthOrigin(req) {
  const expected = requestOrigin(req);
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) throw forbidden();
  if (origin && origin !== expected) throw forbidden();
  if (req.method === 'POST' && !origin) {
    let referer;
    try { referer = new URL(req.headers.referer).origin; } catch { throw forbidden(); }
    if (referer !== expected || site !== 'same-origin') throw forbidden();
  }
  return expected;
}

async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw new TrackingError(413, 'too_large', 'This request is too large.');
  let body = req.body;
  if (body === undefined && req[Symbol.asyncIterator]) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) throw new TrackingError(413, 'too_large', 'This request is too large.');
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new TrackingError(413, 'too_large', 'This request is too large.');
    try { body = JSON.parse(body); } catch { throw new TrackingError(400, 'invalid_request', 'Send valid JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TrackingError(400, 'invalid_request', 'Send a JSON object.');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) throw new TrackingError(413, 'too_large', 'This request is too large.');
  return body;
}

function sessionCookie(req) {
  const raw = String(req.headers.cookie || '');
  if (raw.length > 16384) return '';
  const values = raw.split(';').map(value => value.trim()).filter(value => value.startsWith(`${SESSION_COOKIE}=`));
  // Ambiguous duplicated cookies must not select an identity by parser order.
  return values.length === 1 ? values[0] : '';
}

function verifiedUser(user, config) {
  if (!user || typeof user.id !== 'string' || !user.id || user.id.length > 200 || /\s/.test(user.id) ||
      typeof user.email !== 'string' || user.email.trim().toLowerCase() !== config.ownerEmail ||
      user.emailVerified !== true || user.banned === true || (config.ownerId && user.id !== config.ownerId)) return null;
  return { id: user.id, email: config.ownerEmail, name: String(user.name || 'Your Prepper host').slice(0, 80), emailVerified: true };
}

function verifiedSession(data, config, now) {
  const user = verifiedUser(data?.user, config);
  const session = data?.session;
  if (!user || !session || session.userId !== user.id || !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= now()) return null;
  return { user, session: { id: session.id, userId: user.id, expiresAt: session.expiresAt } };
}

const defaultProxy = async config => {
  const { handleAuthProxyRequest } = await import('@neondatabase/auth/server');
  return handleAuthProxyRequest(config);
};

export function createNeonOwnerAuth({ env = process.env, proxy = defaultProxy, now = Date.now } = {}) {
  async function upstream(req, config, path, body) {
    const origin = requestOrigin(req);
    const url = new URL(`/api/auth/${path}`, origin);
    // Never authorize from a cached signed profile: revalidate the opaque session
    // with Neon on every request so logout/revocation takes effect immediately.
    if (path === 'get-session') url.searchParams.set('disableCookieCache', 'true');
    const headers = new Headers({ origin, accept: 'application/json' });
    const cookie = sessionCookie(req);
    if (cookie) headers.set('cookie', cookie);
    if (body) headers.set('content-type', 'application/json');
    return proxy({
      request: new Request(url, { method: paths.get(path), headers, ...(body ? { body: JSON.stringify(body) } : {}) }),
      path, baseUrl: config.baseUrl, cookieSecret: config.cookieSecret, sameSite: 'strict',
      log: { debug() {}, info() {}, warn() {}, error() {} },
    });
  }

  async function lookup(req) {
    const config = readConfig(env);
    assertAuthOrigin(req);
    if (!sessionCookie(req)) return { data: null, cookies: [] };
    const response = await upstream(req, config, 'get-session');
    if (response.status >= 500) throw new TrackingError(503, 'unavailable', 'Private sign-in is temporarily unavailable.');
    if (!response.ok) return { data: null, cookies: [] };
    const data = verifiedSession(await response.json().catch(() => null), config, now);
    return { data, cookies: response.headers.getSetCookie() };
  }

  return {
    async authenticate(req) {
      const { data } = await lookup(req);
      return data ? { id: data.user.id, email: data.user.email, user_metadata: { display_name: data.user.name } } : null;
    },
    async handle(req, res) {
      res.setHeader('Cache-Control', 'no-store, private, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Vary', 'Origin, Cookie');
      try {
        assertAuthOrigin(req);
        const config = readConfig(env);
        const rawPath = req.query?.path ?? new URL(req.url || '/', requestOrigin(req)).pathname.replace(/^\/api\/auth\//, '');
        const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
        if (!paths.has(path)) throw new TrackingError(404, 'not_found', 'This sign-in action is unavailable.');
        if (req.method !== paths.get(path)) {
          res.setHeader('Allow', paths.get(path));
          throw new TrackingError(405, 'method_not_allowed', 'Use the correct method for this sign-in action.');
        }
        if (path === 'get-session') {
          const { data, cookies } = await lookup(req);
          if (!data) throw new TrackingError(401, 'unauthorized', 'Sign in to access private location sharing.');
          if (cookies.length && data) res.setHeader('Set-Cookie', cookies);
          return res.status(200).json(data);
        }
        if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
          throw new TrackingError(415, 'unsupported_media_type', 'Send this request as JSON.');
        }
        const input = await readBody(req);
        let body = {};
        if (path !== 'sign-out') {
          if (typeof input.email !== 'string' || input.email.trim().toLowerCase() !== config.ownerEmail) {
            throw new TrackingError(403, 'owner_only', 'Private sign-in is available only to the workspace owner.');
          }
          body.email = config.ownerEmail;
          if (path === 'email-otp/send-verification-otp') {
            if (input.type !== 'sign-in') throw new TrackingError(400, 'invalid_request', 'Choose sign-in to receive a code.');
            body.type = 'sign-in';
          } else {
            if (typeof input.otp !== 'string' || !/^\d{6}$/.test(input.otp)) throw new TrackingError(400, 'invalid_request', 'Enter the six-digit sign-in code.');
            body.otp = input.otp;
          }
        }
        const response = await upstream(req, config, path, body);
        if (!response.ok) {
          const status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 400;
          if (status === 429) res.setHeader('Retry-After', '60');
          throw new TrackingError(status, status === 429 ? 'rate_limited' : 'sign_in_failed',
            status === 429 ? 'Please wait a minute before trying again.' : path === 'sign-in/email-otp' ? 'The sign-in code is invalid or expired. Request a new code and try again.' : 'Private sign-in is temporarily unavailable. Please try again.');
        }
        const data = await response.json().catch(() => null);
        if (!data) throw new TrackingError(503, 'unavailable', 'Private sign-in is temporarily unavailable.');
        let user;
        if (path === 'sign-in/email-otp') {
          user = verifiedUser(data.user, config);
          if (!user) throw new TrackingError(403, 'owner_only', 'This account cannot access the workspace.');
        }
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader('Set-Cookie', cookies);
        return res.status(200).json(user ? { user } : { success: true });
      } catch (error) {
        const known = error instanceof TrackingError;
        return res.status(known ? error.status : 503).json({
          error: known ? error.message : 'Private sign-in is temporarily unavailable. Please try again.',
          code: known ? error.code : 'unavailable',
        });
      }
    },
  };
}

export const authenticateNeonOwner = req => createNeonOwnerAuth().authenticate(req);
