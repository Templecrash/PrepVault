const TIMEOUT_MS = 65_000;
const abortError = () => new DOMException('The Survival LLM request was cancelled.', 'AbortError');

async function advisorRequest(body, { signal } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw abortError();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, TIMEOUT_MS);
  try {
    const response = await fetch('/api/advisor', {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw abortError();
    const data = await response.json().catch(() => null);
    if (controller.signal.aborted) throw abortError();
    if (!response.ok || !data || typeof data !== 'object') {
      const error = new Error(typeof data?.error === 'string' && data.error.length <= 300
        ? data.error : 'Survival LLM is unavailable. Please try again.');
      error.status = response.status;
      error.code = typeof data?.code === 'string' ? data.code : undefined;
      throw error;
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error('Survival LLM took too long to respond. Please try again.');
    }
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function getAdvisorStatus(options) {
  const data = await advisorRequest(undefined, options);
  if (typeof data.configured !== 'boolean') throw new Error('The Survival LLM connection could not be checked. Please try again.');
  return { configured: data.configured };
}

export async function askAdvisor(messages, context, options) {
  // Keep recent completed exchanges and the newest question within the API limit.
  // A fresh context object is serialized for every request, including retries.
  const history = messages.slice(-19).map(({ role, content }) => ({ role, content }));
  let characters = history.reduce((total, message) => total + message.content.length, 0);
  const payloadBytes = () => new TextEncoder().encode(JSON.stringify({ messages: history, context })).length;
  while (history.length > 1 && (characters > 60000 || history[0].role === 'assistant' || payloadBytes() > 256 * 1024)) {
    characters -= history.shift().content.length;
  }
  const data = await advisorRequest({ messages: history, context }, options);
  if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Survival LLM returned an empty reply. Please try again.');
  return data.reply;
}
