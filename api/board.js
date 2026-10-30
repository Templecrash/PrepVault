import { Buffer } from 'node:buffer';
import process from 'node:process';
import { neon } from '@neondatabase/serverless';
import { authenticateNeonOwner, assertAuthOrigin } from './_lib/neon-owner-auth.js';
import { createBoardService, validateBoardInput, BoardError } from './_lib/board-service.js';
import { createBoardStore } from './_lib/board-store.js';
import { boardConfig, boardIdentity } from './_lib/board-identity.js';

const MAX_BODY = 24576;
const writes = new Set(['create', 'reply', 'report', 'remove']);
async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BODY) throw new BoardError(413, 'too_large', 'This message is too large.');
  let body = req.body;
  if (body === undefined && req[Symbol.asyncIterator]) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) throw new BoardError(413, 'too_large', 'This message is too large.');
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY) throw new BoardError(413, 'too_large', 'This message is too large.');
    try { body = JSON.parse(body); } catch { throw new BoardError(400, 'invalid_request', 'Send valid JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BoardError(400, 'invalid_request', 'Send a JSON object.');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY) throw new BoardError(413, 'too_large', 'This message is too large.');
  return body;
}

export function createBoardHandler({ env = process.env, authenticate = authenticateNeonOwner, getService = config => createBoardService(createBoardStore(neon(config.databaseUrl))), now = Date.now, random } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Origin, Cookie');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new BoardError(405, 'method_not_allowed', 'Use POST for message-board requests.'); }
      try { assertAuthOrigin(req); } catch { throw new BoardError(403, 'forbidden', 'Use the message board on this site.'); }
      if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new BoardError(415, 'unsupported_media_type', 'Send this request as JSON.');
      const body = await readBody(req);
      validateBoardInput(body.action, body);
      const config = boardConfig(env);
      const identity = boardIdentity(req, config, { now, random, vercel: env.VERCEL === '1' });
      if (writes.has(body.action) && !identity.valid) throw new BoardError(401, 'unauthorized', 'Refresh the board to restore your anonymous browser session.');
      let owner = false;
      if (['session', 'moderation', 'moderate'].includes(body.action)) {
        try { owner = Boolean(await authenticate(req)); } catch (error) {
          if (body.action !== 'session') throw error;
        }
      }
      if (['moderation', 'moderate'].includes(body.action) && !owner) throw new BoardError(403, 'forbidden', 'Owner sign-in is required for moderation.');
      const result = await getService(config).perform(body.action, body, { authorKey: identity.authorKey, networkKey: identity.networkKey, owner });
      if (body.action === 'session') {
        if (!identity.valid) res.setHeader('Set-Cookie', identity.cookie);
        return res.status(200).json({ alias: identity.alias, canModerate: owner });
      }
      return res.status(200).json(result);
    } catch (error) {
      const known = error instanceof BoardError;
      if (known && error.status === 429) res.setHeader('Retry-After', '60');
      return res.status(known ? error.status : 503).json({ code: known ? error.code : 'unavailable', error: known ? error.message : 'The message board is temporarily unavailable. Please try again.' });
    }
  };
}
export default createBoardHandler();
