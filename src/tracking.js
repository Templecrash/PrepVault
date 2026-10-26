export const TRACKING_POLL_MS = 10_000;
export const TRACKING_VISIBLE_MS = 5 * 60_000;

export function normalizePhone(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function trackingStatus(session, now = Date.now()) {
  if (Date.parse(session.expiresAt) <= now) return 'Expired';
  if (session.status === 'revoked') return 'Removed';
  if (session.status === 'stopped') return 'Stopped';
  if (session.status === 'invited') return 'Invitation ready';
  const age = now - Date.parse(session.updatedAt);
  if (!Number.isFinite(age) || !hasCoordinates(session)) return 'Waiting for location';
  if (age <= 45_000) return 'Live';
  return age <= TRACKING_VISIBLE_MS ? 'Last seen' : 'Signal lost';
}

export function hasCoordinates(session) {
  return Number.isFinite(session.lat) && Math.abs(session.lat) <= 90
    && Number.isFinite(session.lng) && Math.abs(session.lng) <= 180;
}

export function visiblePosition(session, now = Date.now()) {
  return session.status === 'sharing' && Date.parse(session.expiresAt) > now
    && hasCoordinates(session) && Number.isFinite(Date.parse(session.updatedAt))
    && now - Date.parse(session.updatedAt) <= TRACKING_VISIBLE_MS;
}

export function invitationLink(token, origin) {
  return new URL(`/share-location#token=${encodeURIComponent(token)}`, origin).href;
}

export function smsLink(phone, message, userAgent = '') {
  if (!normalizePhone(phone)) return null;
  const separator = /iPad|iPhone|iPod/.test(userAgent) ? '&' : '?';
  return `sms:${normalizePhone(phone)}${separator}body=${encodeURIComponent(message)}`;
}

export async function trackingRequest(action, payload = {}, accessToken, options = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 15_000);
  try {
    const response = await fetch('/api/tracking', {
      method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ ...payload, action }),
      signal: controller.signal,
      ...(options.keepalive ? { keepalive: true } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const error = new Error(data?.error || 'Location sharing is unavailable. Please try again.');
      error.status = response.status;
      error.retryAfter = Number(response.headers.get('Retry-After')) || 3;
      throw error;
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) throw new Error('The connection timed out. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
