import { createHash, randomBytes } from 'node:crypto';

export class TrackingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const problems = {
  not_found: [404, 'This location-sharing session was not found.'],
  unavailable: [410, 'This sharing session has ended, expired, or already been claimed.'],
  throttled: [429, 'Please wait a few seconds before sending another location.'],
  session_limit: [409, 'End an existing invitation before creating another.'],
  invalid_location: [400, 'Send a recent location with valid coordinates and accuracy.'],
};
const hash = value => createHash('sha256').update(value).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const invalid = message => { throw new TrackingError(400, 'invalid_request', message); };

function readToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) invalid('This sharing link is invalid.');
  return value;
}

export function createTrackingService(client, { now = () => Date.now(), token = newToken, authenticate: authenticateOwner } = {}) {
  if (authenticateOwner !== undefined && typeof authenticateOwner !== 'function') throw new TypeError('Owner authentication must be a function.');
  async function run(args) {
    const { data, error } = await client.rpc('prepvault_tracking_action', args);
    if (error) {
      if (['PGRST202', '42P01', '42883'].includes(error.code)) {
        throw new TrackingError(503, 'not_configured', 'Live location sharing needs its database setup before it can be used.');
      }
      throw new TrackingError(503, 'unavailable', 'Location sharing is temporarily unavailable. Please try again.');
    }
    if (!data || typeof data !== 'object') throw new TrackingError(503, 'unavailable', 'Location sharing is temporarily unavailable.');
    if (data.error) {
      const [status, message] = problems[data.error] || [503, 'Location sharing is temporarily unavailable.'];
      throw new TrackingError(status, data.error in problems ? data.error : 'unavailable', message);
    }
    return data;
  }

  return {
    async authenticate(bearer) {
      if (typeof bearer !== 'string' || !bearer || bearer.length > 8192) return null;
      if (authenticateOwner) {
        const owner = await authenticateOwner(bearer);
        if (typeof owner?.id !== 'string' || !owner.id || owner.id.length > 512) return null;
        return owner;
      }
      if (typeof client.auth?.getUser !== 'function') return null;
      const { data, error } = await client.auth.getUser(bearer);
      if (error || !data?.user?.id || !/^[0-9a-f-]{36}$/i.test(data.user.id)) return null;
      return data.user;
    },
    async perform(action, body, owner) {
      const args = { p_action: action };
      if (['list', 'create', 'revoke'].includes(action)) {
        if (!owner?.id) throw new TrackingError(401, 'unauthorized', 'Sign in to your online account to manage live location sharing.');
        args.p_owner_id = owner.id;
      }
      if (action === 'create') {
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80) invalid('Enter a name of up to 80 characters.');
        if (typeof body.phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(body.phone)) invalid('Enter a phone number with its country code, for example +14165550123.');
        if (![60, 240, 1440].includes(body.durationMinutes)) invalid('Choose a sharing duration of 1 hour, 4 hours, or 24 hours.');
        const invitation = token();
        Object.assign(args, {
          p_name: body.name.trim(), p_phone: body.phone.trim(), p_duration_minutes: body.durationMinutes,
          p_owner_name: String(owner.user_metadata?.display_name || owner.user_metadata?.full_name || 'Your Prepper host').slice(0, 80),
          p_new_token_hash: hash(invitation),
        });
        const result = await run(args);
        return { session: result.session, token: invitation };
      }
      if (action === 'revoke') {
        if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) invalid('Choose a valid sharing session.');
        args.p_session_id = body.id;
      }
      if (['inspect', 'start', 'update', 'stop'].includes(action)) args.p_token_hash = hash(readToken(body.token));
      if (action === 'start') {
        const publisher = token();
        args.p_new_token_hash = hash(publisher);
        const result = await run(args);
        return { session: result.session, token: publisher };
      }
      if (action === 'update') {
        const { lat, lng, accuracy, capturedAt } = body;
        const captured = typeof capturedAt === 'string' ? Date.parse(capturedAt) : NaN;
        const timestamp = now();
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 ||
            !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000000 || !Number.isFinite(captured) ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(capturedAt) ||
            captured < timestamp - 60000 || captured > timestamp + 5000) {
          invalid('Send a location captured within the last minute, with valid coordinates and accuracy.');
        }
        Object.assign(args, { p_lat: lat, p_lng: lng, p_accuracy: accuracy, p_captured_at: new Date(captured).toISOString() });
      }
      return run(args);
    },
  };
}
