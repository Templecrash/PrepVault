const ENDPOINT = '/api/surveillance';
const PHOTO_LIMIT = 4 * 1024 * 1024;
const text = (value, limit = 240) => typeof value === 'string' ? value.slice(0, limit) : '';
const identifier = value => (typeof value === 'string' || typeof value === 'number') && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(String(value)) ? String(value) : '';
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const percentage = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const alarmStatus = value => ['armed_away', 'armed_stay', 'disarmed', 'ready', 'not_ready', 'entry_delay', 'exit_delay', 'alarm', 'mixed'].includes(value) ? value : 'unknown';

export function normalizeSurveillance(data) {
  if (!data || typeof data.reveal?.connected !== 'boolean') throw new Error('Your surveillance connection could not be checked. Please try again.');
  const reveal = data.reveal;
  const eyezon = data.eyezon || {};
  return {
    reveal: {
      configured: reveal.configured === true, connected: reveal.connected, accountEmail: text(reveal.accountEmail, 254),
      cameras: reveal.connected && Array.isArray(reveal.cameras) ? reveal.cameras.slice(0, 1000).filter(camera => camera && identifier(camera.id)).map(camera => ({
        id: identifier(camera.id), name: text(camera.name) || 'Unnamed camera', model: text(camera.model), location: text(camera.location),
        status: ['online', 'offline'].includes(camera.status) ? camera.status : 'unknown',
        batteryPercent: percentage(camera.batteryPercent), signalPercent: percentage(camera.signalPercent),
        signalLabel: text(camera.signalLabel, 80), lastSeenAt: timestamp(camera.lastSeenAt),
      })) : [],
      photos: reveal.connected && Array.isArray(reveal.photos) ? reveal.photos.slice(0, 1000).filter(photo => photo && identifier(photo.id) && identifier(photo.cameraId)).map(photo => ({
        id: identifier(photo.id), cameraId: identifier(photo.cameraId), capturedAt: timestamp(photo.capturedAt), receivedAt: timestamp(photo.receivedAt),
      })) : [],
      checkedAt: timestamp(reveal.checkedAt), error: text(reveal.error),
      hasMore: reveal.hasMore === true, limit: Number.isInteger(reveal.limit) && reveal.limit > 0 && reveal.limit <= 1000 ? reveal.limit : 100,
    },
    eyezon: {
      configured: eyezon.configured === true, connected: eyezon.connected === true,
      accountEmail: text(eyezon.accountEmail, 254), checkedAt: timestamp(eyezon.checkedAt), error: text(eyezon.error),
      systems: eyezon.connected === true && Array.isArray(eyezon.systems) ? eyezon.systems.slice(0, 100).filter(system => system && identifier(system.id)).map(system => ({
        id: identifier(system.id), name: text(system.name) || 'Unnamed alarm system', model: text(system.model),
        connection: text(system.connection), status: alarmStatus(system.status), reportedAt: text(system.reportedAt),
        partitions: Array.isArray(system.partitions) ? system.partitions.slice(0, 100).filter(partition => partition && identifier(partition.id)).map(partition => ({
          id: identifier(partition.id), status: alarmStatus(partition.status), label: text(partition.label) || `Partition ${identifier(partition.id)}`, reportedStatus: text(partition.reportedStatus),
        })) : [],
      })) : [],
    },
    fetchedAt: timestamp(data.fetchedAt),
  };
}

async function request(path, body, { signal } = {}, photo = false) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 65_000);
  const checkCancelled = () => { if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { Accept: photo ? 'image/jpeg, image/png, image/webp, image/gif' : 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
    });
    checkCancelled();
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      checkCancelled();
      const error = new Error(text(data?.error) || 'Surveillance is unavailable. Please try again.');
      error.status = response.status;
      error.code = text(data?.code, 80);
      throw error;
    }
    if (photo) {
      const type = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) throw new Error('This photo could not be displayed.');
      if (Number(response.headers.get('Content-Length')) > PHOTO_LIMIT) throw new Error('This photo is too large to display here. Open it in REVEAL.');
      const blob = await response.blob();
      checkCancelled();
      if (blob.size > PHOTO_LIMIT) throw new Error('This photo is too large to display here. Open it in REVEAL.');
      return blob;
    }
    const data = await response.json().catch(() => null);
    checkCancelled();
    return normalizeSurveillance(data);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('The surveillance connection timed out. Please try again.');
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error instanceof TypeError) throw new Error('Could not reach surveillance. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export function getSurveillance(options) { return request(ENDPOINT, undefined, options); }
export function connectReveal(email, password, options) { return request(ENDPOINT, { action: 'connect-reveal', email: email.trim(), password }, options); }
export function disconnectReveal(options) { return request(ENDPOINT, { action: 'disconnect-reveal' }, options); }
export function connectEyezon(email, password, options) { return request(ENDPOINT, { action: 'connect-eyezon', email: email.trim(), password }, options); }
export function disconnectEyezon(options) { return request(ENDPOINT, { action: 'disconnect-eyezon' }, options); }
export function fetchSurveillancePhoto(cameraId, photoId, options) {
  if (!identifier(cameraId) || !identifier(photoId)) return Promise.reject(new Error('This photo could not be found.'));
  const query = new URLSearchParams({ action: 'photo', cameraId: identifier(cameraId), photoId: identifier(photoId) });
  return request(`${ENDPOINT}?${query}`, undefined, options, true);
}
