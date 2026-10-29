const ENDPOINT = '/api/nest';
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const control = char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127;
const text = (value, max = 240) => typeof value === 'string' ? [...value].filter(char => !control(char)).join('').slice(0, max) : '';
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && ![...value].some(char => control(char) || char === ' ');
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const cancelled = () => new DOMException('Cancelled', 'AbortError');

export function normalizeNestDevices(data) {
  if (!data || typeof data.configured !== 'boolean' || typeof data.connected !== 'boolean' || !Array.isArray(data.devices)) throw new Error('The Google Nest connection could not be checked. Try again.');
  const seen = new Set();
  return {
    configured: data.configured, connected: data.configured && data.connected,
    missingConfig: Array.isArray(data.missingConfig) ? data.missingConfig.filter(value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value)).slice(0, 20) : [],
    devices: data.configured && data.connected ? data.devices.slice(0, 200).filter(device => {
      if (!device || !safeId(device.id) || seen.has(device.id)) return false;
      seen.add(device.id); return true;
    }).map(device => {
      const protocols = Array.isArray(device.protocols) ? [...new Set(device.protocols.filter(value => ['WEB_RTC', 'RTSP'].includes(value)))] : [];
      return { id: device.id, name: text(device.name, 160) || 'Nest camera', room: text(device.room, 160),
        status: ['online', 'offline'].includes(device.status) ? device.status : 'unknown', protocols,
        supportsLiveView: device.supportsLiveView === true && protocols.includes('WEB_RTC'), supportsEventImages: device.supportsEventImages === true };
    }) : [],
    checkedAt: timestamp(data.checkedAt),
  };
}

export function validateNestAuthorizationUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Google sign-in could not be opened. Try again.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'nestservices.google.com' || url.port || url.username || url.password || url.hash || !/^\/partnerconnections\/[A-Za-z0-9_-]{1,256}\/auth$/.test(url.pathname)) throw new Error('Google sign-in could not be opened. Try again.');
  return url.href;
}

async function request(body, { signal, keepalive = false } = {}) {
  if (signal?.aborted) throw cancelled();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 45_000);
  const check = () => { if (controller.signal.aborted) throw cancelled(); };
  try {
    const response = await fetch(body ? ENDPOINT : `${ENDPOINT}?action=devices`, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body), keepalive } : {}), signal: controller.signal,
    });
    check();
    const data = await response.json().catch(() => null);
    check();
    if (!response.ok) {
      const error = new Error(text(data?.error) || 'Google Nest is unavailable. Try again.');
      error.status = response.status; error.code = text(data?.code, 80); throw error;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Google Nest returned an incomplete response. Try again.');
    return data;
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    if (controller.signal.aborted) throw new Error('The Google Nest connection timed out. Try again.');
    if (error instanceof TypeError) throw new Error('Could not reach Google Nest. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export async function getNestDevices(options) { return normalizeNestDevices(await request(undefined, options)); }
export async function startNestConnection(options) { return validateNestAuthorizationUrl((await request({ action: 'start' }, options)).authorizationUrl); }
export async function finalizeNestConnection(options) {
  const result = await request({ action: 'finalize' }, options);
  if (result.connected !== true) throw new Error('Google Nest could not finish connecting. Try again.');
  return { connected: true };
}
export async function disconnectNest(options) {
  const result = await request({ action: 'disconnect' }, options);
  if (result.connected !== false) throw new Error('Google Nest could not be disconnected. Try again.');
  return { connected: false, revoked: result.revoked === true };
}
export async function startNestStream(deviceId, offerSdp, options) {
  if (!safeId(deviceId) || typeof offerSdp !== 'string' || !offerSdp.startsWith('v=0') || offerSdp.length > 28000) throw new Error('Create a fresh camera stream and try again.');
  const data = await request({ action: 'stream', deviceId, offerSdp: offerSdp.endsWith('\n') ? offerSdp : `${offerSdp}\r\n` }, options);
  const expiry = timestamp(data.expiresAt);
  if (typeof data.answerSdp !== 'string' || !data.answerSdp.startsWith('v=0') || data.answerSdp.length > 65536 || !opaque(data.mediaSessionId) || !expiry || Date.parse(expiry) <= Date.now() || Date.parse(expiry) > Date.now() + 3600000) throw new Error('Google Nest could not start a live view. Try again.');
  return { answerSdp: data.answerSdp, mediaSessionId: data.mediaSessionId, expiresAt: expiry };
}
export async function stopNestStream(deviceId, mediaSessionId, options) {
  if (!safeId(deviceId) || !opaque(mediaSessionId)) throw new Error('The camera session could not be stopped.');
  await request({ action: 'stop', deviceId, mediaSessionId }, options);
}

// Google's offer requires audio, video, then application, with no local capture.
export function configureNestPeer(peer, receiver = globalThis.RTCRtpReceiver) {
  const audio = peer.addTransceiver('audio', { direction: 'recvonly' });
  const codecs = receiver?.getCapabilities?.('audio')?.codecs?.filter(codec => codec.mimeType?.toLowerCase() === 'audio/opus');
  if (codecs?.length && typeof audio.setCodecPreferences === 'function') audio.setCodecPreferences(codecs);
  peer.addTransceiver('video', { direction: 'recvonly' });
  peer.createDataChannel('dataSendChannel');
}

export function waitForNestIce(peer, signal, timeoutMs = 8000) {
  if (signal?.aborted) return Promise.reject(cancelled());
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const finish = error => { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', change); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const change = () => { if (peer.iceGatheringState === 'complete') finish(); };
    const abort = () => finish(cancelled());
    peer.addEventListener('icegatheringstatechange', change);
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(), timeoutMs);
    change();
  });
}
