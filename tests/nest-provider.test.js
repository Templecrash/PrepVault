import test from 'node:test';
import assert from 'node:assert/strict';
import { createNestProvider, nestConfig, normalizeNestDevices, validateNestOffer, NEST_SCOPE } from '../api/_lib/nest-provider.js';
const epoch = 1800000000000;
const env = { SURVEILLANCE_COOKIE_KEY: 'ab'.repeat(32), GOOGLE_NEST_CLIENT_ID: 'client.apps.googleusercontent.com', GOOGLE_NEST_CLIENT_SECRET: 'private-secret', GOOGLE_NEST_PROJECT_ID: 'project-id', GOOGLE_NEST_REDIRECT_URI: 'https://prep.example/api/nest?action=callback' };
const config = nestConfig(env);
const offer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\na=rtpmap:111 opus/48000/2\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';
const rawCamera = { name: 'enterprises/project-id/devices/camera-1', type: 'sdm.devices.types.CAMERA', traits: { 'sdm.devices.traits.Info': { customName: ' Driveway ' }, 'sdm.devices.traits.CameraLiveStream': { supportedProtocols: ['WEB_RTC', 'RTSP', 'BOGUS', 'WEB_RTC'] }, 'sdm.devices.traits.Connectivity': { status: 'ONLINE' } }, parentRelations: [{ displayName: 'Outside' }] };
function setup(responses) {
  const requests = [];
  return { requests, api: createNestProvider({ config, now: () => epoch, fetchImpl: async (url, init) => {
    requests.push({ url, ...init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  } }) };
}

test('configuration rejects unsafe callbacks and returns exact missing names without values', () => {
  assert.deepEqual(config.missing, []);
  for (const redirect of ['http://prep.example/api/nest?action=callback', 'https://prep.example/other?action=callback', 'https://prep.example/api/nest?action=callback&next=https://evil.example', 'https://user:pass@prep.example/api/nest?action=callback', 'https://localhost/api/nest?action=callback', 'https://prep.example/api/nest?action=callback#secret']) {
    assert.ok(nestConfig({ ...env, GOOGLE_NEST_REDIRECT_URI: redirect }).missing.includes('GOOGLE_NEST_REDIRECT_URI'));
  }
  assert.ok(nestConfig({ ...env, GOOGLE_NEST_PROJECT_ID: '../other' }).missing.includes('GOOGLE_NEST_PROJECT_ID'));
  assert.ok(nestConfig({ ...env, SURVEILLANCE_COOKIE_KEY: 'not-encryption-key' }).missing.includes('SURVEILLANCE_COOKIE_KEY'));
});
test('device normalization discards unrelated projects, duplicate records and secrets while reporting unknown connectivity honestly', () => {
  const list = normalizeNestDevices({ devices: [rawCamera, rawCamera, { ...rawCamera, name: 'enterprises/other/devices/camera-2' }, { ...rawCamera, name: 'enterprises/project-id/devices/../attack' }, { name: 'enterprises/project-id/devices/thermostat', traits: {} }, null, { ...rawCamera, name: 'enterprises/project-id/devices/camera-3', traits: { 'sdm.devices.traits.CameraLiveStream': { supportedProtocols: ['RTSP'] }, 'sdm.devices.traits.CameraEventImage': {}, accessToken: 'never-return-this' } }] }, config.projectId);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 'Driveway');
  assert.equal(list[0].room, 'Outside');
  assert.deepEqual(list[0].protocols, ['WEB_RTC', 'RTSP']);
  assert.equal(list[0].status, 'online');
  assert.equal(list[1].status, 'unknown');
  assert.equal(list[1].supportsLiveView, false);
  assert.equal(list[1].supportsEventImages, true);
  assert.equal(JSON.stringify(list).includes('never-return-this'), false);
  assert.throws(() => normalizeNestDevices({ devices: {} }, config.projectId));
});
test('OAuth uses PCM and fixed token endpoints with server-side credentials', async () => {
  const { api, requests } = setup([{ access_token: 'access-private', refresh_token: 'refresh-private', token_type: 'Bearer', scope: NEST_SCOPE }, { access_token: 'access-second', token_type: 'Bearer' }]);
  const url = new URL(api.authorizationUrl('nonce'));
  assert.equal(url.origin, 'https://nestservices.google.com');
  assert.equal(url.pathname, '/partnerconnections/project-id/auth');
  assert.equal(url.searchParams.get('scope'), NEST_SCOPE);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('redirect_uri'), env.GOOGLE_NEST_REDIRECT_URI);
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.equal((await api.exchange('code-private')).refreshToken, 'refresh-private');
  await api.refresh('refresh-private');
  for (const req of requests) {
    assert.equal(req.url, 'https://oauth2.googleapis.com/token');
    assert.equal(req.redirect, 'error');
    assert.equal(req.method, 'POST');
    assert.equal(new URLSearchParams(req.body).get('client_secret'), 'private-secret');
    assert.ok(req.signal instanceof AbortSignal);
  }
  assert.equal(new URLSearchParams(requests[0].body).get('code'), 'code-private');
  assert.equal(new URLSearchParams(requests[1].body).get('grant_type'), 'refresh_token');
});
test('camera API commands use fixed host, specific command names, and normalized stream response', async () => {
  const { api, requests } = setup([{ devices: [rawCamera] }, { results: { answerSdp: 'v=0\r\nanswer', mediaSessionId: 'stream-session', expiresAt: new Date(epoch + 300000).toISOString(), access_token: 'hidden' } }, {}]);
  await api.devices('access-private');
  const stream = await api.stream('access-private', 'camera-1', offer);
  assert.deepEqual(Object.keys(stream).sort(), ['answerSdp', 'expiresAt', 'mediaSessionId']);
  await api.stop('access-private', 'camera-1', stream.mediaSessionId);
  assert.equal(requests[0].url, 'https://smartdevicemanagement.googleapis.com/v1/enterprises/project-id/devices');
  assert.equal(requests[1].url, `${requests[0].url}/camera-1:executeCommand`);
  assert.equal(JSON.parse(requests[1].body).command, 'sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream');
  assert.equal(JSON.parse(requests[2].body).command, 'sdm.devices.commands.CameraLiveStream.StopWebRtcStream');
  assert.equal(requests[1].headers.Authorization, 'Bearer access-private');
  await assert.rejects(api.stream('access-private', '../../other', offer), { code: 'invalid_request' });
  assert.equal(requests.length, 3);
});
test('SDP requires receive-only audio, OPUS, proper media ordering and bounded length', () => {
  assert.equal(validateNestOffer(offer.slice(0, -2)), offer);
  for (const value of [undefined, {}, offer.replace('a=recvonly', 'a=sendrecv'), offer.replace('a=recvonly', 'a=recvonly\r\na=sendrecv'), offer.replace('a=recvonly', 'a=recvonly\r\na=recvonly'), offer.replace('a=recvonly', 'a=recvonly\r\na=inactive'), offer.replace('opus/48000', 'PCMU/8000'), offer.replace('m=audio', 'm=video'), offer + 'x'.repeat(30000)]) assert.throws(() => validateNestOffer(value));
});
test('provider status errors, malformed JSON, unsafe redirects and oversized bodies are sanitized', async () => {
  for (const res of [new Response('secret upstream body', { status: 500 }), new Response('{not json', { status: 200 }), new Response('secret', { status: 200, headers: { 'content-length': '1048577' } }), new Response(JSON.stringify({ text: 'x'.repeat(1048577) }), { status: 200 }), Error('redirect leaked-private-token')]) {
    const { api } = setup([res]);
    await assert.rejects(api.devices('access-private'), error => error.code === 'provider_unavailable' && !error.message.includes('secret') && !error.message.includes('token'));
  }
  const { api: expired } = setup([new Response('private token error', { status: 400 })]);
  await assert.rejects(expired.refresh('expired-token'), { code: 'reconnect_required' });
  const { api: rate } = setup([new Response('private', { status: 429 })]);
  await assert.rejects(rate.devices('access'), { code: 'rate_limited' });
});
test('invalid token and stale/malformed stream responses fail closed', async () => {
  for (const value of [{ access_token: 'token' }, { access_token: 'token', refresh_token: 'refresh', scope: 'unrelated-scope' }, { access_token: 'token', refresh_token: 'refresh', token_type: 5 }]) {
    const { api } = setup([value]);
    await assert.rejects(api.exchange('code'), { code: 'provider_unavailable' });
  }
  const { api } = setup([{ results: { answerSdp: 'v=0', mediaSessionId: 'id', expiresAt: new Date(epoch - 1000).toISOString() } }]);
  await assert.rejects(api.stream('access', 'camera-1', offer), { code: 'provider_unavailable' });
});
test('revocation is best-effort on its fixed endpoint and tokens stay out of URLs', async () => {
  const { api, requests } = setup([new Response('', { status: 200 }), Error('network failure')]);
  assert.equal(await api.revoke('refresh-private'), true);
  assert.equal(await api.revoke('refresh-private'), false);
  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/revoke');
  assert.equal(new URLSearchParams(requests[0].body).get('token'), 'refresh-private');
});
