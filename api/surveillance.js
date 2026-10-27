import { Buffer } from 'node:buffer';
import { authenticateNeonOwner, assertAuthOrigin } from './_lib/neon-owner-auth.js';
import { TrackingError } from './_lib/tracking-service.js';
import { SurveillanceError, createSurveillanceSessions } from './_lib/surveillance-session.js';
import { RevealProviderError, createRevealProvider } from './_lib/reveal-provider.js';
import { EyezonProviderError, createEyezonProvider } from './_lib/eyezon-provider.js';

const MAX_BODY = 8192;
const unauthorized = () => new SurveillanceError(401, 'unauthorized', 'Sign in to open your private surveillance.');
const invalid = () => new SurveillanceError(400, 'invalid_request', 'Choose a valid surveillance action.');

async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BODY) throw new SurveillanceError(413, 'too_large', 'This request is too large.');
  let value = req.body;
  if (value === undefined && req[Symbol.asyncIterator]) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) throw new SurveillanceError(413, 'too_large', 'This request is too large.');
      chunks.push(Buffer.from(chunk));
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > MAX_BODY) throw new SurveillanceError(413, 'too_large', 'This request is too large.');
    try { value = JSON.parse(value); } catch { throw invalid(); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BODY) throw new SurveillanceError(413, 'too_large', 'This request is too large.');
  const connecting = ['connect-reveal', 'connect-eyezon'].includes(value.action);
  const allowed = connecting ? ['action', 'email', 'password'] : ['action'];
  if (!['connect-reveal', 'disconnect-reveal', 'connect-eyezon', 'disconnect-eyezon'].includes(value.action) || Object.keys(value).some(key => !allowed.includes(key))) throw invalid();
  if (connecting && (typeof value.email !== 'string' || value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) ||
      typeof value.password !== 'string' || !value.password || value.password.length > 1024)) throw new SurveillanceError(400, 'invalid_credentials', 'Enter your provider email and password.');
  return value;
}

export function createSurveillanceHandler({ authenticate = authenticateNeonOwner, provider = createRevealProvider(), sessions = createSurveillanceSessions(), eyezonProvider = createEyezonProvider(), eyezonSessions = createSurveillanceSessions({ provider: 'eyezon' }), now = Date.now } = {}) {
  const access = new Map();
  const refreshing = new Map();
  const attempts = new Map();
  let generation = 0;
  const blank = () => ({ reveal: { configured: sessions.configured(), connected: false, cameras: [], photos: [], checkedAt: null },
    eyezon: { configured: eyezonSessions.configured(), connected: false, status: 'unknown', systems: [], checkedAt: null }, fetchedAt: new Date(now()).toISOString() });
  const revealFeed = async session => ({ configured: true, connected: true, accountEmail: session.accountEmail, ...await provider.loadRevealFeed(session) });
  const eyezonFeed = async session => ({ configured: true, connected: true, accountEmail: session.accountEmail, ...await eyezonProvider.loadEyezonStatus(session) });
  const isKnown = error => error instanceof SurveillanceError || error instanceof TrackingError || error instanceof RevealProviderError || error instanceof EyezonProviderError;
  async function snapshot(req, owner, overrides = {}) {
    const result = blank();
    await Promise.allSettled(['reveal', 'eyezon'].map(async name => {
      if (Object.hasOwn(overrides, name)) { if (overrides[name]) result[name] = overrides[name]; return; }
      let connection;
      try {
        connection = (name === 'reveal' ? sessions : eyezonSessions).read(req, owner);
        if (!connection) return;
        result[name] = name === 'reveal' ? await revealFeed(await activeSession(connection)) : await eyezonFeed(connection);
      } catch (error) {
        result[name].connected = Boolean(connection) && error.status !== 409;
        if (connection) result[name].accountEmail = connection.accountEmail;
        result[name].error = isKnown(error) ? error.message : 'This connection is temporarily unavailable. Please try again.';
      }
    }));
    return result;
  }
  function limitConnect(owner) {
    for (const [id, state] of attempts) if (state.reset <= now()) attempts.delete(id);
    const state = attempts.get(owner.id) || { count: 0, reset: now() + 60_000 };
    if (++state.count > 5) throw new SurveillanceError(429, 'rate_limited', 'Wait a minute before trying to connect again.');
    attempts.set(owner.id, state);
  }
  async function activeSession(connection) {
    for (const [id, cached] of access) if (cached.expires <= now()) access.delete(id);
    const cached = access.get(connection.cacheKey);
    if (cached) return cached.session;
    if (refreshing.has(connection.cacheKey)) return refreshing.get(connection.cacheKey);
    const started = generation;
    const pending = (async () => {
      const session = await provider.refreshReveal(connection);
      if (started !== generation) throw new SurveillanceError(409, 'reconnect_required', 'Your REVEAL connection was disconnected.');
      if (access.size >= 20) access.delete(access.keys().next().value);
      access.set(connection.cacheKey, { session, expires: Math.min(now() + 300_000, session.expiresAt - 60_000) });
      return session;
    })();
    refreshing.set(connection.cacheKey, pending);
    try { return await pending; } finally { refreshing.delete(connection.cacheKey); }
  }
  return async function surveillance(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Vary', 'Origin, Cookie');
    try {
      assertAuthOrigin(req);
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw new SurveillanceError(405, 'method_not_allowed', 'Use GET or POST.'); }
      const owner = await authenticate(req);
      if (!owner) throw unauthorized();
      let result; let setCookie; let photo;
      if (req.method === 'POST') {
        if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new SurveillanceError(415, 'unsupported_media_type', 'Send JSON.');
        const body = await readBody(req);
        const name = body.action.endsWith('eyezon') ? 'eyezon' : 'reveal';
        const store = name === 'reveal' ? sessions : eyezonSessions;
        if (body.action.startsWith('disconnect-')) {
          // Clear every warm token even when the supplied cookie is expired.
          if (name === 'reveal') { generation += 1; access.clear(); refreshing.clear(); }
          setCookie = store.clear(); result = await snapshot(req, owner, { [name]: null });
        } else {
          if (!store.configured()) throw new SurveillanceError(503, 'not_configured', 'Surveillance connections are not configured yet.');
          limitConnect(owner);
          let session;
          try { session = await (name === 'reveal' ? provider.signInReveal : eyezonProvider.signInEyezon)({ email: body.email.trim(), password: body.password }); }
          finally { body.password = ''; }
          setCookie = store.seal(session, owner);
          const connected = name === 'reveal' ? await revealFeed(session) : await eyezonFeed(session);
          result = await snapshot(req, owner, { [name]: connected });
        }
      } else {
        const query = req.query || Object.fromEntries(new URL(req.url || '/', 'https://prepvault.invalid').searchParams);
        if (query.action && query.action !== 'photo') throw invalid();
        if (Object.keys(query).some(key => !['action', 'cameraId', 'photoId'].includes(key))) throw invalid();
        if (query.action === 'photo' && ![query.cameraId, query.photoId].every(id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(id))) throw invalid();
        if (query.action === 'photo') {
          const connection = sessions.read(req, owner);
          if (!connection) throw new SurveillanceError(409, 'not_connected', 'Connect REVEAL to view photos.');
          const session = await activeSession(connection);
          photo = await provider.fetchRevealPhoto(session, { cameraId: query.cameraId, photoId: query.photoId });
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.contentType) || !(photo.bytes instanceof Uint8Array) || !photo.bytes.byteLength || photo.bytes.byteLength > 4 * 1024 * 1024) {
            throw new SurveillanceError(502, 'photo_unavailable', 'This photo could not be loaded. Open it in REVEAL.');
          }
        } else result = await snapshot(req, owner);
      }
      const current = await authenticate(req);
      if (!current || current.id !== owner.id) throw unauthorized();
      if (setCookie) res.setHeader('Set-Cookie', setCookie);
      if (photo) { res.setHeader('Content-Type', photo.contentType); return res.status(200).end(Buffer.from(photo.bytes)); }
      return res.status(200).json(result);
    } catch (error) {
      const known = isKnown(error);
      if (known && error.status === 429) res.setHeader('Retry-After', '60');
      return res.status(known ? error.status : 503).json({ error: known ? error.message : 'Surveillance is temporarily unavailable. Please try again.', code: known ? error.code : 'unavailable' });
    }
  };
}

export default createSurveillanceHandler();
