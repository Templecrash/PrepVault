import { sanitizeAdvisorContext } from './advisor-context.js';

const TIMEOUT_MS = 35_000;
// Leave room for a cold model startup (up to 570s) plus inference (240s),
// while stopping before the server's 15-minute job expiration.
const JOB_TIMEOUT_MS = 14 * 60_000;
const safeText = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const abortError = () => new DOMException('The Survival LLM request was cancelled.', 'AbortError');
const validJobId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,160}$/.test(value);

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
  return { configured: data.configured, model: safeText(data.model, 160),
    libraryArticles: Number.isSafeInteger(data.libraryArticles) && data.libraryArticles >= 0 ? data.libraryArticles : 0,
    error: safeText(data.error, 300) };
}

export function normalizeAdvisorAnswer(value) {
  if (typeof value?.reply !== 'string' || !value.reply.trim() || value.reply.length > 32000) throw new Error('Survival LLM returned an empty reply or an invalid answer. Please try again.');
  const sources = (Array.isArray(value.sources) ? value.sources : []).filter(source => source && typeof source === 'object' && !Array.isArray(source)).slice(0, 8).map(source => {
    let url = '';
    try {
      const parsed = typeof source.url === 'string' && source.url.length <= 2048 ? new URL(source.url) : null;
      if (parsed && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed.href;
    } catch { /* Some library articles do not have a public URL. */ }
    return { title: safeText(source.title, 300), source: safeText(source.source, 300), url,
      license: safeText(source.license, 2000), excerpt: safeText(source.excerpt, 5000) };
  });
  return { reply: value.reply, model: safeText(value.model, 160), sources };
}

function waitForPoll(signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const cancel = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, 5000);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

function cancelJob(jobId) {
  // Best effort on close/Stop; the server also imposes an independent job timeout.
  void fetch('/api/advisor', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, action: 'cancel' }) }).catch(() => {});
}

function createAdvisorJob(body, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!signal) return advisorRequest(body);
  return new Promise((resolve, reject) => {
    let abandoned = false;
    const cancel = () => { abandoned = true; reject(abortError()); };
    signal.addEventListener('abort', cancel, { once: true });
    // Stop dismisses the UI immediately, but the server may already be
    // creating a job. Keep this one request alive, with its 35-second bound,
    // so a late job ID can be cancelled instead of losing track of the work.
    void advisorRequest(body).then(data => {
      signal.removeEventListener('abort', cancel);
      if (abandoned) {
        if (data.status === 'pending' && validJobId(data.jobId)) cancelJob(data.jobId);
        return;
      }
      resolve(data);
    }, error => {
      signal.removeEventListener('abort', cancel);
      if (!abandoned) reject(error);
    });
  });
}

export async function askAdvisor(messages, context, options = {}) {
  // Keep recent completed exchanges and the newest question within the API limit.
  // A fresh context object is serialized for every request, including retries.
  context = sanitizeAdvisorContext(context);
  const history = messages.slice(-19).map(({ role, content }) => ({ role, content }));
  let characters = history.reduce((total, message) => total + message.content.length, 0);
  const payloadBytes = () => new TextEncoder().encode(JSON.stringify({ messages: history, context })).length;
  while (history.length > 1 && (characters > 60000 || history[0].role === 'assistant' || payloadBytes() > 256 * 1024)) {
    characters -= history.shift().content.length;
  }
  let jobId;
  try {
    let data = await createAdvisorJob({ messages: history, context }, options.signal);
    const started = Date.now();
    if (data.status === 'pending') {
      if (!validJobId(data.jobId)) throw new Error('Survival LLM returned an invalid job. Please try again.');
      jobId = data.jobId;
    }
    if (options.signal?.aborted) throw abortError();
    while (data.status === 'pending') {
      if (Date.now() - started >= JOB_TIMEOUT_MS) throw new Error('Your private server took too long to answer. Please try again.');
      options.onProgress?.(Date.now() - started < 30000 ? 'Waiting for your private server…' : 'Still waiting for your answer. The model may be starting after idle…');
      await waitForPoll(options.signal);
      data = await advisorRequest({ jobId }, options);
    }
    const answer = normalizeAdvisorAnswer(data);
    jobId = null;
    return answer;
  } finally { if (jobId) cancelJob(jobId); }
}
