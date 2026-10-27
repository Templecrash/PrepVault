const AUTH_PATHS = {
  session: 'get-session',
  send: 'email-otp/send-verification-otp',
  verify: 'sign-in/email-otp',
  signOut: 'sign-out',
};

export const OWNER_SIGN_OUT_EVENT = 'prepvault-owner-signout';

async function authRequest(action, body, { signal } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 15_000);
  try {
    const response = await fetch(`/api/auth/${AUTH_PATHS[action]}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => undefined);
    if (!response.ok || data === undefined) {
      const message = typeof data?.error === 'string' && data.error.length <= 240
        ? data.error : 'Secure sign-in is unavailable. Please try again.';
      const error = new Error(message);
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

export async function getTrackingOwner(options) {
  let data;
  try { data = await authRequest('session', undefined, options); }
  catch (error) { if (error.status === 401) return null; throw error; }
  if (!data?.user) return null;
  const { id, email, name } = data.user;
  if (typeof id !== 'string' || !id || typeof email !== 'string' || !email) {
    throw new Error('Your sign-in could not be verified. Please try again.');
  }
  return { id, email, name: typeof name === 'string' ? name : '' };
}

export function sendTrackingSignInCode(email, options) {
  return authRequest('send', { email: email.trim(), type: 'sign-in' }, options);
}

export async function verifyTrackingSignInCode(email, otp, options) {
  await authRequest('verify', { email: email.trim(), otp: otp.trim() }, options);
  // Only the protected session endpoint decides whether this is the owner.
  const owner = await getTrackingOwner(options);
  if (!owner) throw new Error('Your sign-in could not be verified. Please request a new code.');
  return owner;
}

export async function signOutTrackingOwner(options) {
  const result = await authRequest('signOut', {}, options);
  // Close any other private surfaces only after sign-out has completed.
  // Their unmount cleanup may abort the controller passed to this request.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OWNER_SIGN_OUT_EVENT));
  return result;
}
