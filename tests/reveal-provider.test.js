import test from 'node:test';
import assert from 'node:assert/strict';
import { createRevealProvider } from '../api/_lib/reveal-provider.js';

const NOW = Date.UTC(2026, 9, 26, 12);
const session = { accessToken: 'access.token', refreshToken: 'refresh.token', accountEmail: 'owner@example.com' };
const authenticated = (extra = {}) => ({ AuthenticationResult: { AccessToken: 'new.access', IdToken: 'new.id', RefreshToken: 'new.refresh', ExpiresIn: 3600, ...extra } });
const camera = { cameraId: 'camera-1', name: 'North gate', location: 'Home', model: 'X', hardwareVersion: 'R2', status: { batteryLevel: 0, signal: 0, lastTransmissionTimestamp: NOW } };
const photo = { photoId: 'photo-1.jpg', cameraId: camera.cameraId, photoTimestamp: '10/26/2026 09:30', createdTimestamp: NOW, photoUrl: 'https://example-bucket.s3.us-east-1.amazonaws.com/private/photo.jpg?signature=secret' };
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

function setup(responses) {
  const calls = [];
  const provider = createRevealProvider({ now: () => NOW, fetch: async (url, options) => {
    calls.push({ url, options });
    const response = responses.shift();
    return typeof response === 'function' ? response(url, options) : response;
  } });
  return { provider, calls };
}

test('REVEAL sign-in uses observed Cognito contract and retains tokens but never password', async () => {
  const { provider, calls } = setup([Response.json(authenticated())]);
  const result = await provider.signInReveal({ email: ' Owner@Example.com ', password: 'private password' });
  assert.deepEqual(result, { accessToken: 'new.access', idToken: 'new.id', refreshToken: 'new.refresh', expiresAt: NOW + 3_600_000, accountEmail: session.accountEmail });
  assert.equal(calls[0].url, 'https://cognito-idp.us-east-1.amazonaws.com/');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['X-Amz-Target'], 'AWSCognitoIdentityProviderService.InitiateAuth');
  assert.deepEqual(JSON.parse(calls[0].options.body), { ClientId: '6r9tpojvgvkci5trla0ip14mon', AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: session.accountEmail, PASSWORD: 'private password' } });
  assert.equal(JSON.stringify(result).includes('password'), false);
});

test('refresh works from server-only refresh token and keeps it when Cognito omits a new token', async () => {
  const { provider, calls } = setup([Response.json(authenticated({ RefreshToken: undefined }))]);
  const result = await provider.refreshReveal({ refreshToken: session.refreshToken, accountEmail: session.accountEmail });
  assert.equal(result.refreshToken, session.refreshToken);
  assert.equal(result.expiresAt, NOW + 3_600_000);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.AuthFlow, 'REFRESH_TOKEN_AUTH');
  assert.deepEqual(body.AuthParameters, { REFRESH_TOKEN: session.refreshToken });
  assert.equal(JSON.stringify(body).includes('PASSWORD'), false);
});

test('credentials and malformed sessions fail before any network request', async () => {
  const { provider, calls } = setup([]);
  for (const input of [undefined, {}, { email: 'owner', password: 'test' }, { email: 'owner@example.com', password: '' }, { email: 'owner@example.com', password: 'x'.repeat(1025) }]) {
    await assert.rejects(provider.signInReveal(input), error => error.status === 400);
  }
  await assert.rejects(provider.refreshReveal({ refreshToken: 'token\r\n', accountEmail: session.accountEmail }), error => error.status === 409);
  await assert.rejects(provider.loadRevealFeed({ accessToken: 'token\r\n' }), error => error.status === 409);
  assert.equal(calls.length, 0);
});

test('auth failures are safe, actionable and never use owner-auth status codes', async () => {
  for (const [body, status, expected, code] of [
    [{ __type: 'NotAuthorizedException', message: 'private upstream details' }, 400, 400, 'reveal_invalid_credentials'],
    [{ __type: 'UserNotFoundException' }, 400, 400, 'reveal_invalid_credentials'],
    [{ __type: 'TooManyRequestsException' }, 400, 429, 'reveal_rate_limited'],
    [{ __type: 'UserNotConfirmedException' }, 400, 409, 'reveal_account_unconfirmed'],
    [{ __type: 'PasswordResetRequiredException' }, 400, 409, 'reveal_password_reset_required'],
    [{ ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 'private challenge' }, 200, 409, 'reveal_mfa_required'],
    [{ ChallengeName: 'NEW_PASSWORD_REQUIRED' }, 200, 409, 'reveal_auth_challenge'],
    [{ message: 'private server failure' }, 500, 503, 'reveal_unavailable'],
  ]) {
    const { provider } = setup([Response.json(body, { status })]);
    await assert.rejects(provider.signInReveal({ email: session.accountEmail, password: 'secret' }), error => {
      assert.equal(error.status, expected);
      assert.equal(error.code, code);
      assert.equal(/private|secret/.test(error.message), false);
      return true;
    });
  }
  const { provider } = setup([Response.json({ __type: 'NotAuthorizedException' }, { status: 400 })]);
  await assert.rejects(provider.refreshReveal(session), error => error.status === 409 && error.code === 'reveal_reconnect_required');
});

test('malformed auth payloads cannot establish a session', async () => {
  for (const body of [{}, authenticated({ AccessToken: '' }), authenticated({ RefreshToken: undefined }), authenticated({ ExpiresIn: 0 }), authenticated({ ExpiresIn: 90_000 })]) {
    const { provider } = setup([Response.json(body)]);
    await assert.rejects(provider.signInReveal({ email: session.accountEmail, password: 'test' }), error => error.status === 502);
  }
});

test('feed uses GET-only authenticated API, normalizes real fields, and never exposes media URLs or tokens', async () => {
  const { provider, calls } = setup([
    Response.json({ response: { cameras: [camera] } }),
    Response.json({ response: { photos: [photo], nextToken: 'private cursor' } }),
  ]);
  const result = await provider.loadRevealFeed(session);
  assert.deepEqual(result.cameras, [{ id: camera.cameraId, name: 'North gate', location: 'Home', model: 'X', batteryPercent: 0, signalPercent: 25, signalLabel: 'Weak', lastSeenAt: new Date(NOW).toISOString() }]);
  assert.deepEqual(result.photos, [{ id: photo.photoId, cameraId: camera.cameraId, capturedAt: '2026-10-26T09:30:00', receivedAt: new Date(NOW).toISOString() }]);
  assert.equal(result.checkedAt, new Date(NOW).toISOString());
  assert.equal(result.hasMore, true);
  assert.equal(result.limit, 100);
  assert.equal(/secret|private|photoUrl|access.token/.test(JSON.stringify(result)), false);
  assert.deepEqual(calls.map(call => call.url), ['https://api.reveal.ishareit.net/v1/cameras', 'https://api.reveal.ishareit.net/v1/photos/v2?size=100']);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.Authorization, 'Bearer access.token');
    assert.equal(call.options.headers['Reveal-User-Agent'], 'RevealWeb/5.12.0');
  }
});

test('unknown camera photos are excluded and missing telemetry stays unknown', async () => {
  const { provider } = setup([
    Response.json({ response: { cameras: [{ cameraId: camera.cameraId, name: 'Camera' }] } }),
    Response.json({ response: { photos: [{ ...photo, photoTimestamp: '022920250930' }, { ...photo, photoId: 'outside', cameraId: 'unknown-camera' }] } }),
  ]);
  const result = await provider.loadRevealFeed(session);
  assert.equal(result.cameras[0].batteryPercent, null);
  assert.equal(result.cameras[0].signalPercent, null);
  assert.equal(result.photos.length, 1);
  assert.equal(result.photos[0].capturedAt, null);
  assert.equal(result.hasMore, false);
});

test('missing feed envelopes and excessive records fail explicitly, not as an empty successful feed', async () => {
  for (const [cameras, photos] of [
    [{ cameras: [camera] }, { response: { photos: [photo] } }],
    [{ response: { cameras: [camera] } }, {}],
    [{ response: { cameras: [camera] } }, { response: { photos: Array(101).fill(photo) } }],
    [{ response: { cameras: [{ cameraId: '../../escape' }] } }, { response: { photos: [] } }],
  ]) {
    const { provider } = setup([Response.json(cameras), Response.json(photos)]);
    await assert.rejects(provider.loadRevealFeed(session), error => error.status === 502);
  }
});

test('provider expiry, unavailable status and invalid JSON remain truthful and redacted', async () => {
  for (const [response, expected] of [
    [Response.json({ secret: 'private' }, { status: 401 }), 409],
    [Response.json({ secret: 'private' }, { status: 403 }), 409],
    [Response.json({ secret: 'private' }, { status: 429 }), 429],
    [Response.json({ secret: 'private' }, { status: 500 }), 503],
    [new Response('private invalid body'), 502],
    [() => { throw Error('private connection details'); }, 503],
  ]) {
    const { provider } = setup([response, Response.json({ response: { photos: [] } })]);
    await assert.rejects(provider.loadRevealFeed(session), error => error.status === expected && !error.message.includes('private'));
  }
});

test('photo fetch re-resolves authenticated metadata, checks IDs, and strips credentials from media request', async () => {
  const { provider, calls } = setup([Response.json({ response: { photo } }), new Response(jpeg, { headers: { 'Content-Type': 'application/octet-stream' } })]);
  const image = await provider.fetchRevealPhoto(session, { cameraId: camera.cameraId, photoId: photo.photoId });
  assert.equal(calls[0].url, 'https://api.reveal.ishareit.net/v1/photos/photo-1.jpg');
  assert.equal(calls[1].url, photo.photoUrl);
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(image.contentType, 'image/jpeg');
  assert.deepEqual(new Uint8Array(image.bytes), jpeg);
});

test('photo IDs cannot inject routes and metadata must belong to requested camera and photo', async () => {
  const { provider, calls } = setup([]);
  for (const id of ['../photo', '%2e%2e', 'photo?foo', 'photo#fragment', '\\host', '..', '', 'x'.repeat(257)]) {
    await assert.rejects(provider.fetchRevealPhoto(session, { photoId: id, cameraId: camera.cameraId }), error => error.status === 400);
  }
  assert.equal(calls.length, 0);
  for (const wrong of [{ ...photo, cameraId: 'another-camera' }, { ...photo, photoId: 'another-photo' }]) {
    const current = setup([Response.json({ response: { photo: wrong } })]);
    await assert.rejects(current.provider.fetchRevealPhoto(session, { photoId: photo.photoId, cameraId: camera.cameraId }), error => error.status === 404);
    assert.equal(current.calls.length, 1);
  }
});

test('photo source allowlist blocks SSRF, hostname suffix spoofing, credentials, redirects and active content', async () => {
  for (const photoUrl of [
    'http://bucket.s3.amazonaws.com/photo.jpg', 'https://127.0.0.1/photo', 'https://[::1]/photo',
    'https://169.254.169.254/latest/meta-data/', 'https://bucket.s3.amazonaws.com.attacker.example/photo',
    'https://attacker-cloudfront.net/photo', 'https://user:password@d123.cloudfront.net/photo',
    'https://d123.cloudfront.net:444/photo', 'https://d123.cloudfront.net/photo#fragment', 'https://attacker.example/photo',
  ]) {
    const { provider, calls } = setup([Response.json({ response: { photo: { ...photo, photoUrl } } })]);
    await assert.rejects(provider.fetchRevealPhoto(session, { photoId: photo.photoId, cameraId: camera.cameraId }), error => error.code === 'reveal_unsupported_photo_source');
    assert.equal(calls.length, 1);
  }
  for (const response of [new Response('<svg onload="alert(1)"></svg>', { headers: { 'content-type': 'image/svg+xml' } }), new Response('<html>bad</html>', { headers: { 'content-type': 'image/jpeg' } }), new Response(null, { status: 302, headers: { location: 'http://127.0.0.1' } })]) {
    const { provider } = setup([Response.json({ response: { photo } }), response]);
    await assert.rejects(provider.fetchRevealPhoto(session, { photoId: photo.photoId, cameraId: camera.cameraId }), error => [502, 503].includes(error.status));
  }
});

test('response bodies are bounded both by header and streamed bytes', async () => {
  for (const response of [new Response('{}', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }), new Response('x'.repeat(2 * 1024 * 1024 + 1))]) {
    const { provider } = setup([response]);
    await assert.rejects(provider.signInReveal({ email: session.accountEmail, password: 'test' }), error => error.code === 'reveal_response_too_large');
  }
  const { provider } = setup([Response.json({ response: { photo } }), new Response(jpeg, { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } })]);
  await assert.rejects(provider.fetchRevealPhoto(session, { photoId: photo.photoId, cameraId: camera.cameraId }), error => error.code === 'reveal_response_too_large');
});

test('network timeout aborts requests and redacts provider internals', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const provider = createRevealProvider({ fetch: (_url, options) => new Promise((_resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(Error('private network details')), { once: true });
  }) });
  const pending = provider.signInReveal({ email: session.accountEmail, password: 'test' });
  t.mock.timers.tick(15_000);
  await assert.rejects(pending, error => error.status === 503 && !error.message.includes('private'));
  assert.equal(signal.aborted, true);
});
