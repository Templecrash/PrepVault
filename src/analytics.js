import { analytics } from '@launchfury/analytics';
import { supabase, supabaseConfigured } from './supabase.js';

export const LAUNCHFURY_INGEST_HOST = 'https://launchfury.com';

const writeKey = import.meta.env.VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY;

export const analyticsEnabled = Boolean(writeKey);

if (analyticsEnabled) {
  analytics.init({
    writeKey,
    host: LAUNCHFURY_INGEST_HOST,
  });
}

let lastIdentifiedUserId = null;

export function track(event, properties) {
  if (!analyticsEnabled) return;
  try {
    analytics.capture(event, properties);
  } catch {
    /* analytics must never break the product */
  }
}

function identify(identityToken) {
  if (!analyticsEnabled || !identityToken) return;
  try {
    analytics.identify(identityToken);
  } catch {
    /* analytics must never break the product */
  }
}

export function resetAnalytics() {
  lastIdentifiedUserId = null;
  if (!analyticsEnabled) return;
  try {
    analytics.reset();
  } catch {
    /* analytics must never break the product */
  }
}

async function exchangeIdentity(accessToken) {
  const res = await fetch('/api/analytics/identity', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.token || null;
}

export async function identifyUser(user) {
  if (!analyticsEnabled || !supabaseConfigured || !user || user.isLocal) return;
  if (lastIdentifiedUserId === user.id) return;
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) return;
    const token = await exchangeIdentity(accessToken);
    if (token) {
      lastIdentifiedUserId = user.id;
      identify(token);
    }
  } catch {
    /* identity linking is best-effort; never block the product */
  }
}

export async function deleteAnalyticsIdentity() {
  if (!analyticsEnabled || !supabaseConfigured) return;
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) return;
    await fetch('/api/analytics/identity-delete', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* deletion is best-effort; never block the product */
  } finally {
    resetAnalytics();
  }
}
