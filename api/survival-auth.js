import { Buffer } from 'node:buffer';
import { assertAuthOrigin } from './_lib/neon-owner-auth.js';
import { TrackingError } from './_lib/tracking-service.js';
import { AdvisorError } from './_lib/advisor-service.js';
import { createHostedSurvivalTickets, SURVIVAL_ORIGIN } from './_lib/hosted-survival-tickets.js';

const MAX_BODY_BYTES = 4096;
async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw new AdvisorError(413, 'too_large', 'This request is too large.');
  let body = req.body;
  if (body === undefined && req[Symbol.asyncIterator]) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) throw new AdvisorError(413, 'too_large', 'This request is too large.');
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new AdvisorError(413, 'too_large', 'This request is too large.');
    try { body = JSON.parse(body); } catch { throw new AdvisorError(400, 'invalid_request', 'Send valid JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdvisorError(400, 'invalid_request', 'Send a verification ticket.');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) throw new AdvisorError(413, 'too_large', 'This request is too large.');
  if (Object.keys(body).length !== 1 || typeof body.ticket !== 'string' || body.ticket.length > 2048) throw new AdvisorError(400, 'invalid_request', 'Send only the server authorization ticket.');
  return body.ticket;
}

// Verifies existing capabilities only. Issuance is private to the owner-gated
// advisor service. The Modal gateway atomically consumes each nonce in its Dict.
export function createSurvivalAuthHandler({ tickets = createHostedSurvivalTickets(), now = Date.now } = {}) {
  let count = 0, resetAt = 0;
  return async function survivalAuth(req, res) {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    try {
      if (assertAuthOrigin(req) !== SURVIVAL_ORIGIN || req.headers.origin !== SURVIVAL_ORIGIN) throw new AdvisorError(403, 'forbidden', 'Use the approved Survival LLM server verification endpoint.');
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new AdvisorError(405, 'method_not_allowed', 'Use POST for server verification.'); }
      const timestamp = now();
      if (timestamp >= resetAt) { count = 0; resetAt = timestamp + 60_000; }
      if (count >= 240) throw new AdvisorError(429, 'rate_limited', 'Please pause before trying again.', Math.max(1, Math.ceil((resetAt - timestamp) / 1000)));
      count++;
      if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new AdvisorError(415, 'unsupported_media_type', 'Send this request as JSON.');
      return res.status(200).json({ valid: true, claims: tickets.verify(await readBody(req)) });
    } catch (error) {
      const known = error instanceof AdvisorError || error instanceof TrackingError;
      if (known && error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      return res.status(known ? error.status : 503).json({ code: known ? error.code : 'unavailable', error: known ? error.message : 'Server verification is temporarily unavailable.' });
    }
  };
}
export default createSurvivalAuthHandler();
