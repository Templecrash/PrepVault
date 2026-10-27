import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';

export class SurveillanceError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}

export const CONNECTION_COOKIE = '__Secure-prepvault.reveal';
const LIFETIME = 30 * 24 * 60 * 60;
const expired = () => new SurveillanceError(409, 'reconnect_required', 'Your REVEAL connection has expired. Connect again.');
const unavailable = () => new SurveillanceError(503, 'not_configured', 'Camera connections are not configured yet.');

// Only the provider session is persisted, in an encrypted, host-only, HttpOnly
// cookie. The owner must ALSO have a valid independently verified Neon session.
// Passwords and REVEAL access tokens never enter cookies, localStorage or the database.
export function createSurveillanceSessions({ env = process.env, now = Date.now, provider = 'reveal' } = {}) {
  if (!['reveal', 'eyezon'].includes(provider)) throw unavailable();
  const cookieName = provider === 'reveal' ? CONNECTION_COOKIE : '__Secure-prepvault.eyezon';
  const field = provider === 'reveal' ? 'refreshToken' : 'sessionCookies';
  const expiredConnection = () => provider === 'reveal' ? expired() : new SurveillanceError(409, 'eyezon_reconnect_required', 'Your EyezOn connection has expired. Connect again.');
  function key() {
    const value = env.SURVEILLANCE_COOKIE_KEY;
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw unavailable();
    return Buffer.from(value, 'hex');
  }
  const cookie = (value, age) => `${cookieName}=${value}; Path=/api/surveillance; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
  return {
    configured() { try { key(); return true; } catch { return false; } },
    clear() { return cookie('', 0); },
    seal(session, owner) {
      const credentials = session[field];
      const valid = provider === 'reveal' ? typeof credentials === 'string' && credentials.length > 0 : Array.isArray(credentials) && credentials.length > 0;
      if (!owner?.id || !valid || JSON.stringify(credentials).length > 2400 ||
          typeof session.accountEmail !== 'string' || session.accountEmail.length > 254) throw unavailable();
      const expiresAt = provider === 'eyezon' ? Math.min(session.expiresAt, now() + LIFETIME * 1000) : now() + LIFETIME * 1000;
      if (!Number.isFinite(expiresAt) || expiresAt <= now()) throw unavailable();
      const payload = JSON.stringify({ v: 1, owner: owner.id, [field]: credentials, accountEmail: session.accountEmail, expiresAt });
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key(), iv);
      cipher.setAAD(Buffer.from(`prepvault:${provider}:${owner.id}`));
      const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
      const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
      if (value.length > 3700) throw unavailable();
      return cookie(value, Math.floor((expiresAt - now()) / 1000));
    },
    read(req, owner) {
      const raw = String(req.headers.cookie || '');
      if (raw.length > 24000) throw expiredConnection();
      const entries = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
      if (!entries.length) return null;
      if (entries.length !== 1 || !owner?.id) throw expiredConnection();
      const value = entries[0].slice(cookieName.length + 1);
      if (value.length > 3700 || !/^[A-Za-z0-9_-]+$/.test(value)) throw expiredConnection();
      const encryptionKey = key();
      try {
        const packed = Buffer.from(value, 'base64url');
        if (packed.length < 29) throw expiredConnection();
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey, packed.subarray(0, 12));
        decipher.setAAD(Buffer.from(`prepvault:${provider}:${owner.id}`));
        decipher.setAuthTag(packed.subarray(12, 28));
        const decoded = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8'));
        if (decoded.v !== 1 || decoded.owner !== owner.id || !Number.isFinite(decoded.expiresAt) || decoded.expiresAt <= now() ||
            decoded.expiresAt > now() + LIFETIME * 1000 ||
            (provider === 'reveal' ? typeof decoded[field] !== 'string' || !decoded[field] : !Array.isArray(decoded[field]) || !decoded[field].length) ||
            typeof decoded.accountEmail !== 'string') throw expiredConnection();
        return { [field]: decoded[field], accountEmail: decoded.accountEmail, ...(provider === 'eyezon' ? { expiresAt: decoded.expiresAt } : {}),
          cacheKey: createHash('sha256').update(value).digest('hex') };
      } catch { throw expiredConnection(); }
    },
  };
}
