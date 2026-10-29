import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';

export class NestError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
export const NEST_COOKIES = {
  state: '__Secure-prepvault.nest-state',
  pending: '__Secure-prepvault.nest-pending',
  connection: '__Secure-prepvault.nest',
};
const TTL = { state: 600, pending: 300, connection: 30 * 86400 };
const fail = () => new NestError(409, 'reconnect_required', 'Your Nest connection has expired. Connect again.');
// eslint-disable-next-line no-control-regex -- Credentials may not contain whitespace or control bytes.
export const opaqueString = (value, max = 2400) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\s\x00-\x1f\x7f]/.test(value);
export function equalNonce(a, b) {
  if (!opaqueString(a, 128) || !opaqueString(b, 128)) return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function createNestSessions({ env = process.env, now = Date.now } = {}) {
  const key = () => {
    if (!/^[a-f\d]{64}$/i.test(env.SURVEILLANCE_COOKIE_KEY || '')) throw new NestError(503, 'not_configured', 'Nest connections are not configured yet.');
    return Buffer.from(env.SURVEILLANCE_COOKIE_KEY, 'hex');
  };
  const cookie = (kind, value, age) => `${NEST_COOKIES[kind]}=${value}; Path=/api/nest; Max-Age=${age}; HttpOnly; Secure; SameSite=${kind === 'connection' ? 'Strict' : 'Lax'}`;
  function valid(kind, data) {
    return opaqueString(data.owner, 200) && (kind === 'state'
      ? /^[A-Za-z0-9_-]{43}$/.test(data.nonce || '')
      : opaqueString(data.refreshToken));
  }
  return {
    clear(kind) { return cookie(kind, '', 0); },
    seal(kind, data) {
      if (!TTL[kind] || !valid(kind, data)) throw fail();
      // Never retain the access token or authorization code in a browser cookie.
      const payload = { v: 1, owner: data.owner, ...(kind === 'state' ? { nonce: data.nonce } : { refreshToken: data.refreshToken }), expiresAt: now() + TTL[kind] * 1000 };
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
      cipher.setAAD(Buffer.from(`prepvault:nest:${kind}:v1`));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
      const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
      if (value.length > 3700) throw fail();
      return cookie(kind, value, TTL[kind]);
    },
    read(kind, req, owner) {
      if (!TTL[kind]) throw fail();
      const raw = String(req.headers?.cookie || '');
      if (raw.length > 24000) throw fail();
      const parts = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(`${NEST_COOKIES[kind]}=`));
      if (!parts.length) return null;
      if (parts.length !== 1) throw fail();
      const value = parts[0].slice(NEST_COOKIES[kind].length + 1);
      if (!/^[A-Za-z0-9_-]{40,3700}$/.test(value)) throw fail();
      try {
        const bytes = Buffer.from(value, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from(`prepvault:nest:${kind}:v1`));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
        if (data.v !== 1 || !valid(kind, data) || !Number.isFinite(data.expiresAt) || data.expiresAt <= now() || data.expiresAt > now() + TTL[kind] * 1000 || (owner && data.owner !== owner.id)) throw fail();
        return data;
      } catch { throw fail(); }
    },
  };
}
