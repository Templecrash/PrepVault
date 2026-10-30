import { Buffer } from 'node:buffer';
import process from 'node:process';
import { assertAuthOrigin, requestOrigin } from './neon-owner-auth.js';
import { TrackingError } from './tracking-service.js';

const SESSION_COOKIE = '__Secure-neon-auth.session_token';
const MAX_BODY_BYTES = 4096;
const actions = {
  session: { path: 'get-session', method: 'GET' },
  send: { path: 'email-otp/send-verification-otp', method: 'POST' },
  verify: { path: 'sign-in/email-otp', method: 'POST' },
  signOut: { path: 'sign-out', method: 'POST' },
};
const unavailable = () => new TrackingError(503, 'unavailable', 'Secure sign-in is temporarily unavailable. Please try again.');
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function readConfig(env) {
  let url;
  try { url = new URL(env.NEON_AUTH_BASE_URL); } catch { throw unavailable(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.pathname.replace(/\/$/, '').endsWith('/auth') ||
      typeof env.NEON_AUTH_COOKIE_SECRET !== 'string' || env.NEON_AUTH_COOKIE_SECRET.length < 32) throw unavailable();
  return { baseUrl: url.href.replace(/\/$/, ''), cookieSecret: env.NEON_AUTH_COOKIE_SECRET };
}

function sessionCookie(req) {
  const raw = String(req.headers.cookie || '');
  if (raw.length > 16384) return '';
  const values = raw.split(';').map(value => value.trim()).filter(value => value.startsWith(`${SESSION_COOKIE}=`));
  return values.length === 1 ? values[0] : '';
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

function verifiedUser(user) {
  if (!user || typeof user.id !== 'string' || !user.id || user.id.length > 200 || /\s/.test(user.id) ||
      !validEmail(user.email) || user.emailVerified !== true || user.banned === true) return null;
  return { id: user.id, email: user.email.trim().toLowerCase(), name: String(user.name || '').slice(0, 80), emailVerified: true };
}

function sessionUser(data, now) {
  const user = verifiedUser(data?.user);
  const expires = Date.parse(data?.session?.expiresAt);
  return user && data?.session?.userId === user.id && Number.isFinite(expires) && expires > now() ? user : null;
}

const defaultProxy = async config => {
  const { handleAuthProxyRequest } = await import('@neondatabase/auth/server');
  return handleAuthProxyRequest(config);
};

// General account access is separate from owner authorization. The private
// endpoints continue to enforce the owner's email AND pinned provider ID.
export function createAccountAuth({ env = process.env, proxy = defaultProxy, now = Date.now } = {}) {
  async function upstream(req, config, action, body) {
    const origin = requestOrigin(req);
    const { path, method } = actions[action];
    const url = new URL(`/api/auth/${path}`, origin);
    if (action === 'session') url.searchParams.set('disableCookieCache', 'true');
    const headers = new Headers({ origin, accept: 'application/json' });
    const cookie = sessionCookie(req);
    if (cookie) headers.set('cookie', cookie);
    if (body) headers.set('content-type', 'application/json');
    return proxy({
      request: new Request(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }),
      path, ...config, sameSite: 'strict',
      log: { debug() {}, info() {}, warn() {}, error() {} },
    });
  }

  return {
    async authenticate(req) {
      assertAuthOrigin(req);
      const config = readConfig(env);
      if (!sessionCookie(req)) return null;
      // Reuse the same opaque-cookie lookup as account restoration. Never
      // authorize API access from request body/profile claims or a cached user.
      let response;
      try { response = await upstream(req, config, 'session'); }
      catch { throw unavailable(); }
      if ([401, 403].includes(response.status)) return null;
      if (!response.ok) throw unavailable();
      const data = await response.json().catch(() => undefined);
      if (data === undefined) throw unavailable();
      return sessionUser(data, now);
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
        const action = req.query?.action ?? new URL(req.url || '/', requestOrigin(req)).searchParams.get('action');
        if (typeof action !== 'string' || !Object.hasOwn(actions, action)) throw new TrackingError(404, 'not_found', 'This account action is unavailable.');
        if (req.method !== actions[action].method) {
          res.setHeader('Allow', actions[action].method);
          throw new TrackingError(405, 'method_not_allowed', 'Use the correct method for this account action.');
        }
        if (action === 'session' && !sessionCookie(req)) return res.status(200).json({ user: null });

        let body;
        if (action !== 'session') {
          if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
            throw new TrackingError(415, 'unsupported_media_type', 'Send this request as JSON.');
          }
          const input = await readBody(req);
          body = {};
          if (action !== 'signOut') {
            const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
            if (!validEmail(email)) throw new TrackingError(400, 'invalid_email', 'Enter a valid email address.');
            body.email = email;
            if (action === 'send') body.type = 'sign-in';
            else {
              if (typeof input.otp !== 'string' || !/^\d{6}$/.test(input.otp)) throw new TrackingError(400, 'invalid_code', 'Enter the six-digit email code.');
              body.otp = input.otp;
              if (input.name !== undefined) {
                if (typeof input.name !== 'string' || input.name.trim().length > 80 || [...input.name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
                  throw new TrackingError(400, 'invalid_name', 'Use a name of 80 characters or fewer.');
                }
                if (input.name.trim()) body.name = input.name.trim();
              }
            }
          }
        }
        const response = await upstream(req, config, action, body);
        if (!response.ok) {
          if (action === 'session' && [401, 403].includes(response.status)) return res.status(200).json({ user: null });
          const status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 400;
          if (status === 429) res.setHeader('Retry-After', '60');
          throw new TrackingError(status, status === 429 ? 'rate_limited' : 'sign_in_failed',
            status === 429 ? 'Please wait a minute before trying again.' : action === 'verify' ?
              'That code is invalid or expired. Request a new code and try again.' :
              'Secure sign-in is temporarily unavailable. Please try again.');
        }
        const data = await response.json().catch(() => undefined);
        if (data === undefined || (action !== 'session' && (!data || typeof data !== 'object' || Array.isArray(data)))) throw unavailable();
        if (['send', 'signOut'].includes(action) && data.success !== true) throw unavailable();
        const user = action === 'session' ? sessionUser(data, now) : action === 'verify' ? verifiedUser(data?.user) : null;
        if (action === 'verify' && (!user || user.email !== body.email)) throw unavailable();
        // Never expose provider tokens or trust a client-supplied profile.
        const cookies = response.headers.getSetCookie();
        if (cookies.length && (action !== 'session' || user)) res.setHeader('Set-Cookie', cookies);
        return res.status(200).json(action === 'session' || action === 'verify' ? { user } : { success: true });
      } catch (error) {
        const known = error instanceof TrackingError;
        return res.status(known ? error.status : 503).json({
          error: known ? error.message : 'Secure sign-in is temporarily unavailable. Please try again.',
          code: known ? error.code : 'unavailable',
        });
      }
    },
  };
}

export const authenticateAccount = req => createAccountAuth().authenticate(req);
