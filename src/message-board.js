const ACTION_FIELDS = {
  session: [], list: ['country', 'region', 'cursor'], thread: ['id', 'cursor'],
  create: ['title', 'body', 'country', 'region'], reply: ['threadId', 'body'],
  report: ['id', 'reason'], remove: ['id'], moderation: ['cursor'], moderate: ['id', 'decision'],
};

// Only explicit board fields cross this boundary. Household/account state is
// never accepted by this transport, even if a caller supplies extra properties.
export async function boardRequest(action, payload = {}, { signal, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  if (!Object.hasOwn(ACTION_FIELDS, action)) throw new Error('Choose a valid board action.');
  const body = { action };
  for (const key of ACTION_FIELDS[action]) if (payload[key] !== undefined) body[key] = payload[key];
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetchImpl('/api/board', {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data)) {
      const error = new Error(typeof data?.error === 'string' ? data.error : 'The community board is unavailable. Please try again.');
      error.status = response.status;
      error.code = data?.code;
      error.retryAfter = Number(response.headers.get('Retry-After')) || null;
      throw error;
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('The connection timed out. Your message was not confirmed. Refresh the board before trying again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export function mergeBoardPage(previous, next, field) {
  const seen = new Map();
  for (const item of [...(previous?.[field] || []), ...(next?.[field] || [])]) seen.set(item.id, item);
  return { ...previous, ...next, [field]: [...seen.values()] };
}

export function boardTimestamp(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Time unavailable';
}
