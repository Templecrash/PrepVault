import { Buffer } from 'node:buffer';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createTrackingService, TrackingError } from './_lib/tracking-service.js';

const MAX_BODY_BYTES = 8192;
const actions = new Set(['list', 'create', 'revoke', 'inspect', 'start', 'update', 'stop']);
let defaultService;

function getDefaultService() {
  if (defaultService) return defaultService;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new TrackingError(503, 'not_configured', 'Live location sharing is not configured yet.');
  defaultService = createTrackingService(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  return defaultService;
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

export function createTrackingHandler({ getService = getDefaultService } = {}) {
  return async function tracking(req, res) {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    try {
      const origin = req.headers.origin;
      if (origin) {
        let parsed;
        try { parsed = new URL(origin); } catch { throw new TrackingError(403, 'forbidden', 'Use the location-sharing page on this site.'); }
        if (!['https:', 'http:'].includes(parsed.protocol) || parsed.host.toLowerCase() !== String(req.headers.host || '').toLowerCase() || parsed.origin !== origin) {
          throw new TrackingError(403, 'forbidden', 'Use the location-sharing page on this site.');
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        throw new TrackingError(405, 'method_not_allowed', 'Use POST for location-sharing requests.');
      }
      if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new TrackingError(415, 'unsupported_media_type', 'Send this request as JSON.');
      }
      const body = await readBody(req);
      if (!actions.has(body.action)) throw new TrackingError(400, 'invalid_request', 'Choose a valid location-sharing action.');
      const service = getService();
      let owner;
      if (['list', 'create', 'revoke'].includes(body.action)) {
        const match = /^Bearer (\S+)$/i.exec(String(req.headers.authorization || ''));
        owner = match ? await service.authenticate(match[1]) : null;
        if (!owner) throw new TrackingError(401, 'unauthorized', 'Sign in to your online account to manage live location sharing.');
      }
      return res.status(200).json(await service.perform(body.action, body, owner));
    } catch (error) {
      const known = error instanceof TrackingError;
      if (known && error.status === 429) res.setHeader('Retry-After', '3');
      return res.status(known ? error.status : 503).json({
        error: known ? error.message : 'Location sharing is temporarily unavailable. Please try again.',
        code: known ? error.code : 'unavailable',
      });
    }
  };
}

export default createTrackingHandler();
