import { analytics } from '@launchfury/analytics';

const INGEST_HOST = 'https://launchfury.com';

function writeKey() {
  return import.meta.env.VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY;
}

let initialized = false;

export function initAnalytics() {
  if (initialized || !writeKey()) return;
  initialized = true;
  analytics.init({
    writeKey: writeKey(),
    host: INGEST_HOST,
    environment: 'prod',
  });
}

export function track(event, properties = undefined) {
  if (!initialized || !writeKey()) return;
  analytics.capture(event, properties);
}

export async function identifyAuthenticatedUser(accessToken) {
  if (!initialized || !writeKey() || !accessToken) return;
  try {
    const res = await fetch('/api/analytics/identity', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.status === 410 || !res.ok) return;
    const { token } = await res.json();
    if (token) analytics.identify(token);
  } catch {
    // Identity exchange is best-effort; never break the app.
  }
}

export function resetAnalytics() {
  if (!initialized) return;
  analytics.reset();
}

export async function deleteAnalyticsIdentity(accessToken) {
  if (!accessToken) return;
  try {
    await fetch('/api/analytics/identity/delete', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Identity deletion is best-effort; never break the app.
  }
}
