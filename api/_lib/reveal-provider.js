import { Buffer } from 'node:buffer';

// Observed in REVEAL's first-party web client (RevealWeb/5.12.0), 2026-10-26:
// https://account.revealcellcam.com/assets/index-Ui42kh-x.js
// These public client identifiers are not API secrets. This is a private web
// API contract, not a documented third-party OAuth grant; keep all tokens on
// the server and expose only the read-only operations below.
const API = 'https://api.reveal.ishareit.net/v1/';
const AUTH = 'https://cognito-idp.us-east-1.amazonaws.com/';
const CLIENT_ID = '6r9tpojvgvkci5trla0ip14mon';
const JSON_LIMIT = 2 * 1024 * 1024;
const IMAGE_LIMIT = 4 * 1024 * 1024;
const REQUEST_TIMEOUT = 15_000;
const PHOTO_LIMIT = 100;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const TOKEN = /^[A-Za-z0-9_+/.=-]{1,16000}$/;

export class RevealProviderError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'RevealProviderError';
    this.status = status;
    this.code = code;
  }
}

const unavailable = () => new RevealProviderError(503, 'reveal_unavailable', 'REVEAL is unavailable. Try again shortly.');
const malformed = () => new RevealProviderError(502, 'reveal_invalid_response', 'REVEAL returned an incomplete response. Try again shortly.');
const reconnect = () => new RevealProviderError(409, 'reveal_reconnect_required', 'Your REVEAL connection has expired. Connect your account again.');
const cleanText = (value, limit = 200) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, '').slice(0, limit) : '';
const validId = value => typeof value === 'string' && ID.test(value) && value !== '.' && value !== '..';
const validToken = value => typeof value === 'string' && TOKEN.test(value);

function isoTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value < 1e12 ? value * 1000 : value);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

// REVEAL supplies camera-local timestamps without an offset. Preserve that
// fact instead of inventing a timezone or using upload time as capture time.
function captureTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/) || value.match(/^(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, month, day, year, hour, minute] = match;
  const stamp = `${year}-${month}-${day}T${hour}:${minute}:00`;
  const date = new Date(`${stamp}Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().startsWith(stamp) ? stamp : null;
}

function normalizeCamera(camera) {
  if (!camera || !validId(camera.cameraId)) throw malformed();
  const battery = camera.status?.batteryLevel;
  const signal = camera.status?.signal;
  const genOne = camera.hardwareVersion == null || String(camera.hardwareVersion).toUpperCase().includes('R1');
  // Percent is the four-bar display strength, not an RF measurement. The
  // first-party client maps first-generation 5 to four bars and newer 0 to one.
  const bars = Number.isInteger(signal) && (genOne ? signal >= 1 && signal <= 5 : signal >= 0 && signal <= 4)
    ? Math.max(1, Math.min(4, signal)) : null;
  return {
    id: camera.cameraId,
    name: cleanText(camera.name) || 'REVEAL camera',
    location: cleanText(camera.location),
    model: cleanText(camera.model),
    batteryPercent: typeof battery === 'number' && battery >= 0 && battery <= 100 ? battery : null,
    signalPercent: bars === null ? null : bars * 25,
    signalLabel: bars === null ? null : ['Weak', 'Moderate', 'Strong', 'Very strong'][bars - 1],
    lastSeenAt: isoTimestamp(camera.status?.lastTransmissionTimestamp),
  };
}

function normalizePhoto(photo) {
  if (!photo || !validId(photo.photoId) || !validId(photo.cameraId)) throw malformed();
  return {
    id: photo.photoId,
    cameraId: photo.cameraId,
    capturedAt: captureTimestamp(photo.photoTimestamp),
    receivedAt: isoTimestamp(photo.createdTimestamp),
  };
}

function safeImageUrl(value) {
  if (typeof value !== 'string' || value.length > 16_000) throw malformed();
  let url;
  try { url = new URL(value); } catch { throw malformed(); }
  // Only provider-resolved AWS media URLs. No arbitrary URLs, credentials,
  // custom ports, redirects, metadata services, or access-token forwarding.
  const host = url.hostname;
  const awsMedia = /^[a-z0-9-]+\.cloudfront\.net$/.test(host) ||
    /^(?:[a-z0-9][a-z0-9.-]*\.)?s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !awsMedia) {
    throw new RevealProviderError(502, 'reveal_unsupported_photo_source', 'REVEAL returned an unsupported photo source. The connection needs an update.');
  }
  return url.href;
}

async function readBounded(response, limit) {
  if (Number(response.headers.get('content-length')) > limit || !response.body) {
    await response.body?.cancel();
    throw new RevealProviderError(502, 'reveal_response_too_large', 'This REVEAL response is too large to load.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RevealProviderError(502, 'reveal_response_too_large', 'This REVEAL response is too large to load.');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

function imageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function createRevealProvider({ fetch: request = globalThis.fetch, now = Date.now } = {}) {
  async function perform(url, options, parse) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await request(url, { ...options, redirect: 'error', signal: controller.signal });
      const result = await parse(response);
      if (controller.signal.aborted) throw unavailable();
      return result;
    } catch (error) {
      if (error instanceof RevealProviderError) throw error;
      throw unavailable();
    } finally { clearTimeout(timeout); }
  }

  async function json(response) {
    const bytes = await readBounded(response, JSON_LIMIT);
    try { return JSON.parse(bytes.toString('utf8')); } catch { throw malformed(); }
  }

  async function authenticate(parameters, { refresh = false, accountEmail, refreshToken } = {}) {
    const data = await perform(AUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
      body: JSON.stringify({ ClientId: CLIENT_ID, AuthFlow: refresh ? 'REFRESH_TOKEN_AUTH' : 'USER_PASSWORD_AUTH', AuthParameters: parameters }),
    }, async response => {
      const body = await json(response);
      if (!response.ok) {
        const type = typeof body?.__type === 'string' ? body.__type.split('#').at(-1) : '';
        if (type === 'TooManyRequestsException' || response.status === 429) throw new RevealProviderError(429, 'reveal_rate_limited', 'REVEAL has received too many requests. Wait a moment and try again.');
        if (refresh && ['NotAuthorizedException', 'UserNotFoundException', 'InvalidParameterException'].includes(type)) throw reconnect();
        if (['NotAuthorizedException', 'UserNotFoundException'].includes(type)) throw new RevealProviderError(400, 'reveal_invalid_credentials', 'REVEAL could not verify that email and password.');
        if (type === 'UserNotConfirmedException') throw new RevealProviderError(409, 'reveal_account_unconfirmed', 'Confirm your account in REVEAL, then connect again.');
        if (type === 'PasswordResetRequiredException') throw new RevealProviderError(409, 'reveal_password_reset_required', 'Reset your password in REVEAL, then connect again.');
        throw unavailable();
      }
      return body;
    });
    if (data?.ChallengeName) {
      const mfa = ['SMS_MFA', 'SOFTWARE_TOKEN_MFA', 'EMAIL_OTP', 'SMS_OTP', 'SELECT_MFA_TYPE', 'MFA_SETUP'].includes(data.ChallengeName);
      throw new RevealProviderError(409, mfa ? 'reveal_mfa_required' : 'reveal_auth_challenge', mfa
        ? 'This REVEAL account requires additional verification. This connector does not yet support that sign-in step; use the official REVEAL app.'
        : 'REVEAL requires an additional sign-in step. Complete it in the official REVEAL app before connecting.');
    }
    const result = data?.AuthenticationResult;
    const token = result?.RefreshToken || refreshToken;
    if (!result || !validToken(result.AccessToken) || !validToken(token) || !Number.isFinite(result.ExpiresIn) || result.ExpiresIn <= 0 || result.ExpiresIn > 86_400) throw malformed();
    return {
      accessToken: result.AccessToken,
      ...(validToken(result.IdToken) ? { idToken: result.IdToken } : {}),
      refreshToken: token,
      expiresAt: now() + result.ExpiresIn * 1000,
      accountEmail,
    };
  }

  async function api(session, path) {
    if (!validToken(session?.accessToken)) throw reconnect();
    return perform(`${API}${path}`, {
      method: 'GET', headers: {
        Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json',
        'Content-Type': 'application/json', 'Reveal-User-Agent': 'RevealWeb/5.12.0',
      },
    }, async response => {
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw reconnect();
        if (response.status === 404) throw new RevealProviderError(404, 'reveal_photo_not_found', 'This REVEAL photo is no longer available.');
        if (response.status === 429) throw new RevealProviderError(429, 'reveal_rate_limited', 'REVEAL has received too many requests. Wait a moment and try again.');
        throw unavailable();
      }
      return json(response);
    });
  }

  return {
    async signInReveal({ email, password } = {}) {
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
          typeof password !== 'string' || !password || password.length > 1024) {
        throw new RevealProviderError(400, 'reveal_invalid_credentials', 'Enter your REVEAL email and password.');
      }
      const accountEmail = email.trim().toLowerCase();
      return authenticate({ USERNAME: accountEmail, PASSWORD: password }, { accountEmail });
    },
    async refreshReveal(session) {
      if (!validToken(session?.refreshToken) || typeof session.accountEmail !== 'string' || session.accountEmail.length > 254) throw reconnect();
      return authenticate({ REFRESH_TOKEN: session.refreshToken }, { refresh: true, accountEmail: session.accountEmail, refreshToken: session.refreshToken });
    },
    async loadRevealFeed(session) {
      const results = await Promise.allSettled([api(session, 'cameras'), api(session, `photos/v2?size=${PHOTO_LIMIT}`)]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
      const cameras = results[0].value?.response?.cameras;
      const photos = results[1].value?.response?.photos;
      if (!Array.isArray(cameras) || cameras.length > 1000 || !Array.isArray(photos) || photos.length > PHOTO_LIMIT) throw malformed();
      const normalizedCameras = cameras.map(normalizeCamera);
      const ids = new Set(normalizedCameras.map(camera => camera.id));
      const normalizedPhotos = photos.map(normalizePhoto).filter(photo => ids.has(photo.cameraId));
      const latest = new Map();
      for (const photo of normalizedPhotos) {
        const previous = latest.get(photo.cameraId);
        if (!previous || Date.parse(photo.receivedAt || '') > Date.parse(previous.receivedAt || '')) latest.set(photo.cameraId, photo);
      }
      // REVEAL's first-party HomeFeed passes cameraIds as comma-separated IDs
      // to photos/v2. Query quiet cameras separately when the global page ends.
      const missing = results[1].value.response.nextToken ? normalizedCameras.filter(camera => !latest.has(camera.id)) : [];
      const queue = missing.slice(0, 30);
      const deadline = now() + 35_000;
      let incomplete = missing.length > queue.length;
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length && now() < deadline) {
          const camera = queue.shift();
          try {
            const page = await api(session, `photos/v2?${new URLSearchParams({ size: '1', cameraIds: camera.id })}`);
            const rows = page?.response?.photos;
            if (!Array.isArray(rows) || rows.length > 1) throw malformed();
            if (rows.length) {
              const photo = normalizePhoto(rows[0]);
              if (photo.cameraId !== camera.id) throw malformed();
              latest.set(camera.id, photo);
            }
          } catch (error) {
            if (error.status === 409) throw error;
            incomplete = true;
          }
        }
      }));
      if (queue.length) incomplete = true;
      return {
        cameras: normalizedCameras,
        photos: normalizedPhotos,
        latestPhotos: [...latest.values()],
        ...(incomplete ? { error: 'Some camera images could not be checked. Refresh or open REVEAL to verify those cameras.' } : {}),
        checkedAt: new Date(now()).toISOString(),
        hasMore: Boolean(results[1].value.response.nextToken),
        limit: PHOTO_LIMIT,
      };
    },
    async fetchRevealPhoto(session, { cameraId, photoId } = {}) {
      if (!validId(cameraId) || !validId(photoId)) throw new RevealProviderError(400, 'reveal_invalid_photo', 'Select a valid REVEAL photo.');
      const metadata = await api(session, `photos/${encodeURIComponent(photoId)}`);
      const photo = metadata?.response?.photo;
      if (!photo || photo.photoId !== photoId || photo.cameraId !== cameraId) throw new RevealProviderError(404, 'reveal_photo_not_found', 'This REVEAL photo is no longer available.');
      const url = safeImageUrl(photo.photoUrl);
      return perform(url, { method: 'GET', headers: { Accept: 'image/jpeg, image/png, image/webp' } }, async response => {
        if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
        const bytes = await readBounded(response, IMAGE_LIMIT);
        const contentType = imageType(bytes);
        if (!contentType) throw new RevealProviderError(502, 'reveal_invalid_photo', 'REVEAL did not return a supported image.');
        return { bytes, contentType };
      });
    },
  };
}

const provider = createRevealProvider();
export const signInReveal = provider.signInReveal;
export const refreshReveal = provider.refreshReveal;
export const loadRevealFeed = provider.loadRevealFeed;
export const fetchRevealPhoto = provider.fetchRevealPhoto;
