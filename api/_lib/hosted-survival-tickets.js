import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import process from 'node:process';
import { AdvisorError } from './advisor-service.js';

export const SURVIVAL_ORIGIN = 'https://prepvault-xi.vercel.app';
export const SURVIVAL_AUDIENCE = 'prepvault-survival-hosted';
export const SURVIVAL_TTL_SECONDS = 120;
const SIGNING_DOMAIN = 'prepvault-survival-hosted:v1\0';
const purposes = new Set(['status', 'chat', 'result', 'cancel']);
export const validSurvivalOwner = owner => owner && typeof owner.id === 'string' && owner.id.length > 0 && owner.id.length <= 200 && !/\s/.test(owner.id);

export function createHostedSurvivalTickets({ env = process.env, now = Date.now, nonce = randomUUID } = {}) {
  const isConfigured = () => typeof env.NEON_AUTH_COOKIE_SECRET === 'string' && env.NEON_AUTH_COOKIE_SECRET.length >= 32;
  function signature(encoded) {
    if (!isConfigured()) throw new AdvisorError(503, 'not_configured', 'The private Survival LLM server is not connected.');
    return createHmac('sha256', env.NEON_AUTH_COOKIE_SECRET).update(SIGNING_DOMAIN + encoded, 'utf8').digest();
  }
  const invalid = () => new AdvisorError(401, 'invalid_ticket', 'This server authorization has expired or is invalid.');
  return {
    isConfigured,
    issue(payload, purpose, owner) {
      if (typeof payload !== 'string' || !purposes.has(purpose)) throw new AdvisorError(400, 'invalid_request', 'Choose a valid Survival LLM request.');
      if (!validSurvivalOwner(owner)) throw new AdvisorError(401, 'unauthorized', 'Sign in to use Survival LLM.');
      const iat = Math.floor(now() / 1000);
      const claims = { v: 1, aud: SURVIVAL_AUDIENCE, origin: SURVIVAL_ORIGIN, sub: owner.id, purpose,
        digest: createHash('sha256').update(payload, 'utf8').digest('hex'), iat, exp: iat + SURVIVAL_TTL_SECONDS, nonce: nonce() };
      const encoded = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
      return `${encoded}.${signature(encoded).toString('base64url')}`;
    },
    verify(ticket) {
      if (typeof ticket !== 'string' || ticket.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(ticket)) throw invalid();
      const [encoded, supplied] = ticket.split('.');
      const suppliedBytes = Buffer.from(supplied, 'base64url');
      const expected = signature(encoded);
      if (suppliedBytes.length !== expected.length || suppliedBytes.toString('base64url') !== supplied || !timingSafeEqual(suppliedBytes, expected)) throw invalid();
      let claims;
      try {
        const decoded = Buffer.from(encoded, 'base64url');
        if (decoded.toString('base64url') !== encoded) throw invalid();
        claims = JSON.parse(decoded.toString('utf8'));
      } catch { throw invalid(); }
      const keys = ['v', 'aud', 'origin', 'sub', 'purpose', 'digest', 'iat', 'exp', 'nonce'];
      const current = Math.floor(now() / 1000);
      if (!claims || typeof claims !== 'object' || Array.isArray(claims) || Object.keys(claims).length !== keys.length || Object.keys(claims).some(key => !keys.includes(key)) ||
          claims.v !== 1 || claims.aud !== SURVIVAL_AUDIENCE || claims.origin !== SURVIVAL_ORIGIN || !validSurvivalOwner({ id: claims.sub }) ||
          !purposes.has(claims.purpose) || typeof claims.digest !== 'string' || !/^[a-f0-9]{64}$/.test(claims.digest) ||
          !Number.isSafeInteger(claims.iat) || claims.iat < 0 || claims.iat > current || !Number.isSafeInteger(claims.exp) ||
          claims.exp - claims.iat !== SURVIVAL_TTL_SECONDS || claims.exp <= current ||
          typeof claims.nonce !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(claims.nonce)) throw invalid();
      return claims;
    },
  };
}
