import { Buffer } from 'node:buffer';
import { isValidBoardLocation } from '../../shared/board-locations.js';

export class BoardError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const invalid = message => { throw new BoardError(400, 'invalid_request', message); };
const requiredId = value => { if (!uuid(value)) invalid('Choose a valid message.'); return value; };
const hasControlCharacters = value => [...value].some(character => {
  const code = character.charCodeAt(0);
  return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
});
const text = (value, max, label) => {
  if (typeof value !== 'string' || hasControlCharacters(value)) invalid(`Enter valid ${label}.`);
  const result = value.trim();
  if (!result || result.length > max) invalid(`Keep ${label} between 1 and ${max} characters.`);
  return result;
};

function cursor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid('Refresh this page to continue browsing.');
  let parsed;
  try { parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { invalid('Refresh this page to continue browsing.'); }
  if (!parsed || !uuid(parsed.id) || typeof parsed.at !== 'string' || !Number.isFinite(Date.parse(parsed.at)) || parsed.at.length > 40) invalid('Refresh this page to continue browsing.');
  return { at: new Date(parsed.at).toISOString(), id: parsed.id };
}

export function validateBoardInput(action, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Send a JSON object.');
  if (action === 'session') return {};
  if (action === 'list') {
    const country = body.country ?? '';
    const region = body.region ?? '';
    if (typeof country !== 'string' || typeof region !== 'string' || (!country && region) || (country && !isValidBoardLocation(country, region))) invalid('Choose a valid country and region.');
    return { country, region, cursor: cursor(body.cursor) };
  }
  if (action === 'thread') return { id: requiredId(body.id), cursor: cursor(body.cursor) };
  if (action === 'create') {
    if (!isValidBoardLocation(body.country, body.region ?? '')) invalid('Choose a valid country and region.');
    return { title: text(body.title, 120, 'a title'), body: text(body.body, 4000, 'a message'), country: body.country, region: body.region ?? '' };
  }
  if (action === 'reply') return { threadId: requiredId(body.threadId), body: text(body.body, 2000, 'a reply') };
  if (action === 'remove') return { id: requiredId(body.id) };
  if (action === 'report') {
    if (!['spam', 'unsafe', 'personal', 'other'].includes(body.reason)) invalid('Choose a report reason.');
    return { id: requiredId(body.id), reason: body.reason };
  }
  if (action === 'moderation') return { cursor: cursor(body.cursor) };
  if (action === 'moderate') {
    if (!['hide', 'dismiss'].includes(body.decision)) invalid('Choose a moderation action.');
    return { id: requiredId(body.id), decision: body.decision };
  }
  invalid('Choose a valid message-board action.');
}

const errors = {
  invalid_request: [400, 'Check the message details and try again.'],
  not_found: [404, 'This message is no longer available.'],
  unauthorized: [401, 'Refresh the board to restore your anonymous browser session.'],
  forbidden: [403, 'You cannot change this message.'],
  throttled: [429, 'You are posting or refreshing too quickly. Please wait a minute and try again.'],
};

export function createBoardService(store) {
  return {
    async perform(action, body, identity) {
      const input = validateBoardInput(action, body);
      const result = await store.perform(action, input, identity);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new BoardError(503, 'unavailable', 'The message board is temporarily unavailable.');
      if (result.error) {
        const [status, message] = errors[result.error] || [503, 'The message board is temporarily unavailable.'];
        throw new BoardError(status, errors[result.error] ? result.error : 'unavailable', message);
      }
      if (result.nextCursor && typeof result.nextCursor === 'object') {
        result.nextCursor = Buffer.from(JSON.stringify(result.nextCursor)).toString('base64url');
      }
      return result;
    },
  };
}
