import { Buffer } from 'node:buffer';
import { authenticateNeonOwner, assertAuthOrigin } from './_lib/neon-owner-auth.js';
import { TrackingError } from './_lib/tracking-service.js';
import { AdvisorError, validateAdvisorInput } from './_lib/advisor-service.js';
import { createHostedSurvivalService, validateSurvivalJobId } from './_lib/hosted-survival-service.js';
import { validSurvivalOwner } from './_lib/hosted-survival-tickets.js';

const MAX_BODY_BYTES = 256 * 1024;
let defaultService;
const getDefaultService = () => defaultService ??= createHostedSurvivalService();

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
  if (Object.hasOwn(body, 'jobId')) {
    const cancellation = body.action === 'cancel';
    if (Object.keys(body).some(key => !['jobId', ...(cancellation ? ['action'] : [])].includes(key))) throw new AdvisorError(400, 'invalid_request', 'Choose a valid Survival LLM request.');
    return { jobId: validateSurvivalJobId(body.jobId), ...(cancellation ? { action: 'cancel' } : {}) };
  }
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
      if (!validSurvivalOwner(owner)) throw new AdvisorError(401, 'unauthorized', 'Sign in to use Survival LLM.');
      const service = getService();
      let result, createdJob;
      if (req.method === 'GET') result = await service.status(owner);
      else if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new AdvisorError(415, 'unsupported_media_type', 'Send this request as JSON.');
      } else {
        const input = await readBody(req);
        result = input.jobId ? await service[input.action === 'cancel' ? 'cancel' : 'result'](input.jobId, owner) : await service.assess(input, owner);
        if (!input.jobId && result.status === 'pending') createdJob = result.jobId;
      }
      // An answer may take time. A sign-out or account change during generation
      // must not deliver the private result into a now-unverified session.
      try {
        const currentOwner = await authenticate(req);
        if (!currentOwner || currentOwner.id !== owner.id) throw new AdvisorError(401, 'unauthorized', 'Your private session ended. Sign in again.');
      } catch (error) {
        // A newly queued job would otherwise continue without its owner ever
        // receiving the ID needed to stop it. Cleanup cannot reveal its result
        // or replace the authorization error if the gateway is unavailable.
        if (createdJob) {
          try { await service.cancel(createdJob, owner, { timeoutMs: 3000 }); } catch { /* Remote hard timeout remains the final bound. */ }
        }
        throw error;
      }
      return res.status(result.status === 'pending' ? 202 : 200).json(result);
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
