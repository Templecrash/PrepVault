import { OWNER_SIGN_OUT_EVENT } from './tracking-auth.js';
import { isLocalEdition } from './runtime-mode.js';

export const ACCOUNT_SESSION_EVENT = 'prepvault-account-session-change';

async function request(action, body, { signal } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 15_000);
  try {
    if (controller.signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    const response = await fetch(`/api/account?action=${action}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
    });
    const data = await response.json().catch(() => undefined);
    if (controller.signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data)) {
      const error = new Error(typeof data?.error === 'string' && data.error.length <= 240 ? data.error : 'Secure sign-in is unavailable. Please try again.');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('The sign-in connection timed out. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

function accountUser(user) {
  if (user === null) return null;
  if (!user || typeof user.id !== 'string' || !user.id || typeof user.email !== 'string' || !user.email || user.emailVerified !== true) {
    throw new Error('Your sign-in could not be verified. Please try again.');
  }
  const name = typeof user.name === 'string' ? user.name : '';
  // The identity is verified by Neon; the plan is still saved on this device.
  // authProvider prevents the legacy Supabase sync engine using a Neon user ID.
  return { id: user.id, email: user.email, name, authProvider: 'neon', isLocal: false, user_metadata: { display_name: name } };
}

export async function getAccountSession(options) {
  if (isLocalEdition()) return null;
  const data = await request('session', undefined, options);
  return accountUser(data.user);
}

export async function sendAccountCode(email, options) {
  const result = await request('send', { email: email.trim() }, options);
  if (result.success !== true) throw new Error('The code could not be sent. Please try again.');
  return result;
}

function notifySessionChanged() {
  if (typeof window === 'undefined') return;
  // Changing the shared provider cookie must immediately clear other private UI.
  window.dispatchEvent(new Event(OWNER_SIGN_OUT_EVENT));
  window.dispatchEvent(new Event(ACCOUNT_SESSION_EVENT));
}

export async function verifyAccountCode(email, otp, { name, ...options } = {}) {
  await request('verify', { email: email.trim(), otp: otp.trim(), ...(name ? { name: name.trim() } : {}) }, options);
  // The cookie has changed. Gate the previous workspace before any additional
  // network wait; the root independently restores the newly verified account.
  notifySessionChanged();
  const user = await getAccountSession(options);
  if (!user || user.email.toLowerCase() !== email.trim().toLowerCase()) throw new Error('Your sign-in could not be verified. Please request a new code.');
  return user;
}

export async function signOutAccount(options) {
  const result = await request('signOut', {}, options);
  if (result.success !== true) throw new Error('Sign-out could not be confirmed. Please try again.');
  notifySessionChanged();
  return result;
}
