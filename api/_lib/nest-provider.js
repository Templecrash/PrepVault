import process from 'node:process';
import { NestError, opaqueString } from './nest-session.js';

export const NEST_SCOPE = 'https://www.googleapis.com/auth/sdm.service';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SDM_URL = 'https://smartdevicemanagement.googleapis.com/v1';
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const unavailable = () => new NestError(502, 'provider_unavailable', 'Google Nest is temporarily unavailable. Try again.');
const invalid = message => new NestError(400, 'invalid_request', message);

export function nestConfig(env = process.env) {
  const missing = [];
  if (!opaqueString(env.GOOGLE_NEST_CLIENT_ID, 512)) missing.push('GOOGLE_NEST_CLIENT_ID');
  if (!opaqueString(env.GOOGLE_NEST_CLIENT_SECRET, 512)) missing.push('GOOGLE_NEST_CLIENT_SECRET');
  if (!safeId(env.GOOGLE_NEST_PROJECT_ID)) missing.push('GOOGLE_NEST_PROJECT_ID');
  let redirect;
  try {
    redirect = new URL(env.GOOGLE_NEST_REDIRECT_URI);
    if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.pathname !== '/api/nest' || redirect.search !== '?action=callback' || /^(localhost|127\.|\[::1\])/.test(redirect.hostname)) throw Error();
  } catch { missing.push('GOOGLE_NEST_REDIRECT_URI'); }
  if (!/^[a-f\d]{64}$/i.test(env.SURVEILLANCE_COOKIE_KEY || '')) missing.push('SURVEILLANCE_COOKIE_KEY');
  return { missing, clientId: env.GOOGLE_NEST_CLIENT_ID, clientSecret: env.GOOGLE_NEST_CLIENT_SECRET, projectId: env.GOOGLE_NEST_PROJECT_ID, redirectUri: redirect?.href, origin: redirect?.origin };
}

export function normalizeNestDevices(payload, projectId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (payload.devices !== undefined && !Array.isArray(payload.devices))) throw unavailable();
  const prefix = `enterprises/${projectId}/devices/`;
  const devices = []; const seen = new Set();
  for (const raw of (payload.devices || []).slice(0, 200)) {
    const id = typeof raw?.name === 'string' && raw.name.startsWith(prefix) ? raw.name.slice(prefix.length) : '';
    const traits = raw?.traits;
    if (!safeId(id) || seen.has(id) || !traits || typeof traits !== 'object' || Array.isArray(traits)) continue;
    const live = traits['sdm.devices.traits.CameraLiveStream'];
    if (!live || typeof live !== 'object') continue;
    const protocols = Array.isArray(live.supportedProtocols) ? [...new Set(live.supportedProtocols.filter(value => ['WEB_RTC', 'RTSP'].includes(value)))] : [];
    // eslint-disable-next-line no-control-regex -- Strip provider-controlled display text control bytes.
    const text = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 160) : '';
    const room = Array.isArray(raw.parentRelations) ? text(raw.parentRelations.find(value => value?.displayName)?.displayName) : '';
    const status = traits['sdm.devices.traits.Connectivity']?.status;
    devices.push({ id, name: text(traits['sdm.devices.traits.Info']?.customName) || room || 'Nest camera', room,
      status: status === 'ONLINE' ? 'online' : status === 'OFFLINE' ? 'offline' : 'unknown', protocols,
      supportsLiveView: protocols.includes('WEB_RTC'), supportsEventImages: !!traits['sdm.devices.traits.CameraEventImage'] });
    seen.add(id);
  }
  return devices;
}

export function validateNestOffer(value) {
  // eslint-disable-next-line no-control-regex -- SDP allows CR/LF but no other control bytes.
  if (typeof value !== 'string' || value.length > 28000 || !value.startsWith('v=0') || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw invalid('Create a fresh camera stream offer.');
  const sections = value.split(/\r?\nm=/).slice(1);
  const audioDirections = sections[0]?.match(/^a=(?:sendrecv|sendonly|recvonly|inactive)\r?$/gm) || [];
  if (sections.length !== 3 || !sections[0].startsWith('audio ') || !sections[1].startsWith('video ') || !sections[2].startsWith('application ') ||
      audioDirections.length !== 1 || audioDirections[0].trim() !== 'a=recvonly' || !/a=rtpmap:\d+ opus\/48000/i.test(sections[0])) throw invalid('Create a receive-only camera stream offer.');
  return value.endsWith('\n') ? value : `${value}\r\n`;
}
export const validNestDeviceId = safeId;

export function createNestProvider({ config, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  async function json(url, init) {
    let response;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error', cache: 'no-store' });
      if (!response.ok) {
        if ([400, 401, 403].includes(response.status) && url === TOKEN_URL) throw new NestError(409, 'reconnect_required', 'Reconnect Google Nest to continue.');
        if (response.status === 429) throw new NestError(429, 'rate_limited', 'Google Nest is busy. Please wait a minute.');
        throw unavailable();
      }
      if (Number(response.headers.get('content-length')) > 1048576) throw unavailable();
      const reader = response.body?.getReader();
      let text = '';
      if (reader) {
        const decoder = new TextDecoder(); let count = 0;
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            count += value.byteLength; if (count > 1048576) { await reader.cancel(); throw unavailable(); }
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } finally { reader.releaseLock(); }
      } else { text = await response.text(); if (text.length > 1048576) throw unavailable(); }
      const result = JSON.parse(text);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw unavailable();
      return result;
    } catch (error) { if (error instanceof NestError) throw error; throw unavailable(); }
    finally { clearTimeout(timer); }
  }
  async function token(params, needsRefresh) {
    const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params });
    const data = await json(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (!opaqueString(data.access_token, 8192) || (needsRefresh && !opaqueString(data.refresh_token)) ||
        (data.token_type && (typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer')) ||
        (data.scope && !String(data.scope).split(' ').includes(NEST_SCOPE))) throw unavailable();
    return { accessToken: data.access_token, ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}) };
  }
  async function command(accessToken, deviceId, name, params) {
    if (!safeId(deviceId)) throw invalid('Choose a connected Nest camera.');
    return json(`${SDM_URL}/enterprises/${encodeURIComponent(config.projectId)}/devices/${encodeURIComponent(deviceId)}:executeCommand`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `sdm.devices.commands.CameraLiveStream.${name}`, params }),
    });
  }
  return {
    authorizationUrl(nonce) {
      const url = new URL(`https://nestservices.google.com/partnerconnections/${encodeURIComponent(config.projectId)}/auth`);
      url.search = new URLSearchParams({ redirect_uri: config.redirectUri, access_type: 'offline', prompt: 'consent', client_id: config.clientId, response_type: 'code', scope: NEST_SCOPE, state: nonce }).toString();
      return url.href;
    },
    exchange(code) { return token({ code, redirect_uri: config.redirectUri, grant_type: 'authorization_code' }, true); },
    refresh(refreshToken) { return token({ refresh_token: refreshToken, grant_type: 'refresh_token' }, false); },
    async devices(accessToken) {
      const data = await json(`${SDM_URL}/enterprises/${encodeURIComponent(config.projectId)}/devices`, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
      return normalizeNestDevices(data, config.projectId);
    },
    async stream(accessToken, deviceId, offerSdp) {
      const data = await command(accessToken, deviceId, 'GenerateWebRtcStream', { offerSdp: validateNestOffer(offerSdp) });
      const result = data.results;
      if (!result || typeof result.answerSdp !== 'string' || !result.answerSdp.startsWith('v=0') || result.answerSdp.length > 65536 ||
          !opaqueString(result.mediaSessionId, 1024) || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= now() || Date.parse(result.expiresAt) > now() + 3600000) throw unavailable();
      return { answerSdp: result.answerSdp, mediaSessionId: result.mediaSessionId, expiresAt: new Date(result.expiresAt).toISOString() };
    },
    async stop(accessToken, deviceId, mediaSessionId) { await command(accessToken, deviceId, 'StopWebRtcStream', { mediaSessionId }); },
    async revoke(refreshToken) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetchImpl('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken }).toString(), signal: controller.signal, redirect: 'error' });
        return response.ok;
      } catch { return false; } finally { clearTimeout(timer); }
    },
  };
}
