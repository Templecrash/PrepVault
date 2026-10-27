import { Buffer } from 'node:buffer';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { BoardError } from './board-service.js';

const LIFE_SECONDS = 30 * 24 * 60 * 60;
const hmac = (secret, value) => createHmac('sha256', secret).update(value).digest('base64url');
const digest = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
// IPv6 privacy addresses in one /64 share a bucket, avoiding easy rate-limit bypass.
export function networkBucket(address) {
  if (isIP(address) !== 6) return address;
  if (address.toLowerCase().startsWith('::ffff:') && isIP(address.slice(7)) === 4) return address.slice(7);
  const parts = address.toLowerCase().split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const expanded = parts.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${expanded.slice(0, 4).map(part => Number.parseInt(part, 16).toString(16)).join(':')}::/64`;
}

export function boardConfig(env) {
  if (typeof env.BOARD_COOKIE_SECRET !== 'string' || env.BOARD_COOKIE_SECRET.length < 32 || !env.BOARD_DATABASE_URL) throw new BoardError(503, 'not_configured', 'The message board is not configured yet.');
  return { secret: env.BOARD_COOKIE_SECRET, databaseUrl: env.BOARD_DATABASE_URL };
}

export function boardIdentity(req, { secret }, { now = Date.now, random = () => randomBytes(32).toString('base64url'), vercel = false } = {}) {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(String(req.headers.host || ''));
  const secure = !local || req.headers['x-forwarded-proto'] === 'https';
  const cookieName = secure ? '__Host-pv_board' : 'pv_board_local';
  const rawCookies = String(req.headers.cookie || '');
  const candidates = rawCookies.length <= 16384 ? rawCookies.split(';').map(s => s.trim()).filter(s => s.startsWith(`${cookieName}=`)) : [];
  let id, expires;
  if (candidates.length === 1) {
    const value = candidates[0].slice(cookieName.length + 1);
    const match = /^([A-Za-z0-9_-]{43})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(value);
    if (match) {
      const expected = hmac(secret, `board-cookie:${match[1]}.${match[2]}`);
      const actual = match[3];
      if (timingSafeEqual(Buffer.from(actual), Buffer.from(expected)) && Number(match[2]) > Math.floor(now() / 1000) && Number(match[2]) <= Math.floor(now() / 1000) + LIFE_SECONDS) {
        id = match[1]; expires = Number(match[2]);
      }
    }
  }
  const valid = Boolean(id);
  if (!valid) { id = random(); expires = Math.floor(now() / 1000) + LIFE_SECONDS; }
  const token = `${id}.${expires}.${hmac(secret, `board-cookie:${id}.${expires}`)}`;
  const address = vercel ? String(req.headers['x-vercel-forwarded-for'] || '').split(',')[0].trim() : String(req.socket?.remoteAddress || '127.0.0.1');
  if (!isIP(address)) throw new BoardError(503, 'unavailable', 'The message board is temporarily unavailable.');
  const authorKey = digest(secret, `board-author:${id}`);
  const networkKey = digest(secret, `board-network:${new Date(now()).toISOString().slice(0, 10)}:${networkBucket(address)}`);
  return {
    valid, authorKey, networkKey, alias: `Neighbor ${authorKey.slice(0, 8).toUpperCase()}`,
    cookie: `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${LIFE_SECONDS}${secure ? '; Secure' : ''}`,
  };
}
