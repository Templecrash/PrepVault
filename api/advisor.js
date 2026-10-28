import { Buffer } from 'node:buffer';
import { authenticateNeonOwner, assertAuthOrigin } from './_lib/neon-owner-auth.js';
import { TrackingError } from './_lib/tracking-service.js';
import { AdvisorError, createAdvisorService, validateAdvisorInput } from './_lib/advisor-service.js';

const MAX_BODY_BYTES = 256 * 1024;
let defaultService;
const getDefaultService = () => defaultService ??= createAdvisorService();

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
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdvisorError(400, 'invalid_request', 'Send a JSON object.');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) throw new AdvisorError(413, 'too_large', 'This request is too large.');
  return validateAdvisorInput(body);
}

export function createAdvisorHandler({ authenticate = authenticateNeonOwner, getService = getDefaultService } = {}) {
  return async function advisor(req, res) {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin, Cookie');
    try {
      assertAuthOrigin(req);
      if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        throw new AdvisorError(405, 'method_not_allowed', 'Use GET or POST for Survival LLM.');
      }
      const owner = await authenticate(req);
      if (!owner) throw new AdvisorError(401, 'unauthorized', 'Sign in to use Survival LLM.');
      if (req.method === 'GET') return res.status(200).json({ configured: Boolean(getService().isConfigured()) });
      if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new AdvisorError(415, 'unsupported_media_type', 'Send this request as JSON.');
      }
      const input = await readBody(req);
      const result = await getService().assess(input, owner);
      // An answer may take time. A sign-out or account change during generation
      // must not deliver the private result into a now-unverified session.
      const currentOwner = await authenticate(req);
      if (!currentOwner || currentOwner.id !== owner.id) throw new AdvisorError(401, 'unauthorized', 'Your private session ended. Sign in again.');
      return res.status(200).json(result);
    } catch (error) {
      const known = error instanceof AdvisorError || error instanceof TrackingError;
      if (known && error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      return res.status(known ? error.status : 503).json({
        error: known ? error.message : 'Survival LLM is temporarily unavailable. Please try again.',
        code: known ? error.code : 'unavailable',
      });
    }
  };
}

export default createAdvisorHandler();
