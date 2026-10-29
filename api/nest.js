import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { authenticateNeonOwner, assertAuthOrigin, requestOrigin } from './_lib/neon-owner-auth.js';
import { NestError, createNestSessions, equalNonce, opaqueString } from './_lib/nest-session.js';
import { createNestProvider, nestConfig, validNestDeviceId, validateNestOffer } from './_lib/nest-provider.js';

const BODY_LIMIT = 32768;
const invalid = () => new NestError(400, 'invalid_request', 'Choose a valid Nest connection action.');
const signedOut = () => new NestError(401, 'unauthorized', 'Sign in to access your private cameras.');

async function readBody(req) {
  if (Number(req.headers['content-length']) > BODY_LIMIT) throw new NestError(413, 'too_large', 'This request is too large.');
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new NestError(415, 'unsupported_media_type', 'Send this request as JSON.');
  let value = req.body;
  if (value === undefined && req[Symbol.asyncIterator]) {
    const chunks = []; let length = 0;
    for await (const chunk of req) {
      length += Buffer.byteLength(chunk);
      if (length > BODY_LIMIT) throw new NestError(413, 'too_large', 'This request is too large.');
      chunks.push(Buffer.from(chunk));
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > BODY_LIMIT) throw new NestError(413, 'too_large', 'This request is too large.');
    try { value = JSON.parse(value); } catch { throw invalid(); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  if (Buffer.byteLength(JSON.stringify(value)) > BODY_LIMIT) throw new NestError(413, 'too_large', 'This request is too large.');
  return value;
}
function queryFor(req) {
  if (req.query) return req.query;
  const params = new URL(req.url || '/api/nest', 'https://unused.invalid').searchParams;
  const result = Object.create(null);
  for (const key of params.keys()) result[key] = params.getAll(key).length === 1 ? params.get(key) : params.getAll(key);
  return result;
}
function validateBody(body) {
  const keys = { start: ['action'], finalize: ['action'], stream: ['action', 'deviceId', 'offerSdp'], stop: ['action', 'deviceId', 'mediaSessionId'], disconnect: ['action'] };
  if (typeof body.action !== 'string' || !Object.hasOwn(keys, body.action) || Object.keys(body).some(key => !keys[body.action].includes(key))) throw invalid();
  if (['stream', 'stop'].includes(body.action) && !validNestDeviceId(body.deviceId)) throw invalid();
  if (body.action === 'stream') validateNestOffer(body.offerSdp);
  if (body.action === 'stop' && !opaqueString(body.mediaSessionId, 1024)) throw invalid();
  return body;
}

export function createNestHandler({ env = process.env, authenticate = authenticateNeonOwner, sessions, provider, now = Date.now, nonce = () => randomBytes(32).toString('base64url') } = {}) {
  sessions ||= createNestSessions({ env, now });
  const config = nestConfig(env);
  const api = provider || createNestProvider({ config, now });
  const starts = new Map();
  const requireConfigured = () => { if (config.missing.length) throw new NestError(503, 'not_configured', 'Google Nest needs server configuration before you can connect.'); };
  async function verifyAgain(req, owner) {
    const fresh = await authenticate(req);
    if (!fresh || fresh.id !== owner.id) throw signedOut();
  }
  return async function nestHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Vary', 'Origin, Cookie');
    const query = queryFor(req);
    // Google returns cross-site: this route uses an encrypted, owner-bound,
    // single-use authorization transaction, never a relaxed Neon session check.
    if (req.method === 'GET' && query.action === 'callback') {
      let pending;
      try {
        requireConfigured();
        if (requestOrigin(req) !== config.origin || !opaqueString(query.code, 4096) || !opaqueString(query.state, 128) || query.error) throw invalid();
        const state = sessions.read('state', req);
        if (!state || !equalNonce(query.state, state.nonce)) throw invalid();
        // Google's code exchange is single-use; no code, state or provider error
        // is copied to the destination URL or sent to browser JavaScript.
        const credentials = await api.exchange(query.code);
        pending = sessions.seal('pending', { owner: state.owner, refreshToken: credentials.refreshToken });
      } catch { /* Every callback failure has the same public result. */ }
      res.setHeader('Set-Cookie', [sessions.clear('state'), pending || sessions.clear('pending')]);
      res.setHeader('Location', pending ? '/app?security=nest-connected' : '/app?security=nest-error');
      return res.status(303).end();
    }
    let owner;
    try {
      assertAuthOrigin(req);
      owner = await authenticate(req);
      if (!owner?.id) throw signedOut();
      if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        throw new NestError(405, 'method_not_allowed', 'Use the correct request method.');
      }
      if (Object.keys(query).some(key => key !== 'action') || (req.method === 'POST' && Object.keys(query).length)) throw invalid();
      if (req.method === 'GET') {
        if (query.action !== undefined && query.action !== 'devices') throw invalid();
        if (config.missing.length) return res.status(200).json({ configured: false, connected: false, missingConfig: config.missing, devices: [], checkedAt: null });
        const connection = sessions.read('connection', req, owner);
        if (!connection) return res.status(200).json({ configured: true, connected: false, devices: [], checkedAt: null });
        const credentials = await api.refresh(connection.refreshToken);
        const devices = await api.devices(credentials.accessToken);
        await verifyAgain(req, owner);
        return res.status(200).json({ configured: true, connected: true, devices, checkedAt: new Date(now()).toISOString() });
      }
      const body = validateBody(await readBody(req));
      if (body.action === 'disconnect') {
        let connection;
        try { connection = sessions.read('connection', req, owner); } catch { /* Clear expired/corrupt credentials too. */ }
        const revoked = connection && !config.missing.length ? await api.revoke(connection.refreshToken).catch(() => false) : null;
        await verifyAgain(req, owner);
        res.setHeader('Set-Cookie', ['state', 'pending', 'connection'].map(kind => sessions.clear(kind)));
        return res.status(200).json({ connected: false, revoked });
      }
      requireConfigured();
      if (body.action === 'start') {
        // OAuth cookies may not be moved between a preview and production host.
        if (requestOrigin(req) !== config.origin) throw new NestError(409, 'use_production', 'Connect Google Nest from the published PrepVault site.');
        const recent = (starts.get(owner.id) || []).filter(time => time > now() - 60000);
        if (recent.length >= 5) throw new NestError(429, 'rate_limited', 'Wait a minute before trying Google Nest again.');
        if (starts.size > 500) starts.clear();
        starts.set(owner.id, [...recent, now()]);
        const state = nonce();
        const cookie = sessions.seal('state', { owner: owner.id, nonce: state });
        await verifyAgain(req, owner);
        res.setHeader('Set-Cookie', [cookie, sessions.clear('pending')]);
        return res.status(200).json({ authorizationUrl: api.authorizationUrl(state) });
      }
      if (body.action === 'finalize') {
        const pending = sessions.read('pending', req, owner);
        if (!pending) throw new NestError(409, 'reconnect_required', 'Start the Google Nest connection again.');
        const credentials = await api.refresh(pending.refreshToken);
        // The first list call completes SDM authorization and confirms access.
        await api.devices(credentials.accessToken);
        await verifyAgain(req, owner);
        res.setHeader('Set-Cookie', [sessions.seal('connection', { owner: owner.id, refreshToken: credentials.refreshToken || pending.refreshToken }), sessions.clear('pending')]);
        return res.status(200).json({ connected: true });
      }
      const connection = sessions.read('connection', req, owner);
      if (!connection) throw new NestError(409, 'reconnect_required', 'Connect Google Nest first.');
      const credentials = await api.refresh(connection.refreshToken);
      const devices = await api.devices(credentials.accessToken);
      const device = devices.find(value => value.id === body.deviceId);
      if (!device || !device.supportsLiveView || !device.protocols.includes('WEB_RTC')) throw new NestError(404, 'camera_unavailable', 'This camera does not support a browser live view.');
      if (body.action === 'stop') {
        await api.stop(credentials.accessToken, device.id, body.mediaSessionId);
        await verifyAgain(req, owner);
        return res.status(200).json({ stopped: true });
      }
      const stream = await api.stream(credentials.accessToken, device.id, body.offerSdp);
      try { await verifyAgain(req, owner); }
      catch (error) { await api.stop(credentials.accessToken, device.id, stream.mediaSessionId).catch(() => {}); throw error; }
      return res.status(200).json(stream);
    } catch (error) {
      // Origin/auth errors come from the shared authentication module; expose
      // only known, fixed messages and never provider response bodies.
      const known = error instanceof NestError;
      const sharedStatus = [401, 403].includes(error?.status) ? error.status : null;
      const status = known ? error.status : sharedStatus || 503;
      if (status === 429) res.setHeader('Retry-After', '60');
      return res.status(status).json({ error: known ? error.message : sharedStatus ? 'Sign in on this site to access your private cameras.' : 'Google Nest is temporarily unavailable. Try again.', code: known ? error.code : sharedStatus ? 'unauthorized' : 'unavailable', ...(owner && known && error.code === 'not_configured' ? { missingConfig: config.missing } : {}) });
    }
  };
}

export default createNestHandler();
