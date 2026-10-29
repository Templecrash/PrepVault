import process from 'node:process';
import { Buffer } from 'node:buffer';
import { AdvisorError, validateAdvisorInput } from './advisor-service.js';
import { createHostedSurvivalTickets, SURVIVAL_ORIGIN, validSurvivalOwner } from './hosted-survival-tickets.js';

const safeText = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const unavailable = () => new AdvisorError(503, 'server_unavailable', 'The private Survival LLM server is unavailable. Please try again.');
export function validateSurvivalJobId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(value)) throw new AdvisorError(400, 'invalid_job', 'Choose a valid Survival LLM request.');
  return value;
}

export function survivalServerUrl(env) {
  const value = env.SURVIVAL_SERVER_URL;
  let url;
  try { url = new URL(value); } catch { return null; }
  // Only the provisioned Modal gateway can receive private app context. A
  // request cannot supply a host, path, credential, model, or provider override.
  // Modal serves both app.modal.run and app.region.modal.run origins.
  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const modalHost = new RegExp(`^${label}(?:\\.${label})?\\.modal\\.run$`);
  if (typeof value !== 'string' || !/^https:\/\/[a-z0-9.-]+\/?$/i.test(value) ||
      url.protocol !== 'https:' || !modalHost.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  return url.origin;
}

export function normalizeHostedSurvivalAnswer(value) {
  if (typeof value?.reply !== 'string' || !value.reply.trim() || value.reply.length > 32000) throw unavailable();
  const sources = (Array.isArray(value.sources) ? value.sources : []).filter(source => source && typeof source === 'object' && !Array.isArray(source)).slice(0, 8).map(source => {
    let url = '';
    try {
      const parsed = typeof source.url === 'string' && source.url.length <= 2048 ? new URL(source.url) : null;
      if (parsed && ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed.href;
    } catch { /* A library source may not have a public URL. */ }
    return { title: safeText(source.title, 300), source: safeText(source.source, 300), url, license: safeText(source.license, 2000), excerpt: safeText(source.excerpt, 5000) };
  });
  return { reply: value.reply.trim(), model: safeText(value.model, 120), sources };
}

async function readResponse(response) {
  if (Number(response.headers?.get('content-length')) > 256 * 1024 || !response.body) throw unavailable();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) throw unavailable();
      chunks.push(Buffer.from(value));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw unavailable();
    return data;
  } catch { throw unavailable(); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function remoteFailure(data, status) {
  if (status === 429 || data?.code === 'request_in_progress') return new AdvisorError(429, 'server_busy', 'Your private server is busy. Please wait and try again.', 5);
  if (data?.code === 'context_too_large') return new AdvisorError(413, 'context_too_large', 'This conversation and app context exceed the model’s input budget. Start a new chat or narrow the assessment.');
  if (['job_not_found', 'job_expired', 'not_found'].includes(data?.code)) return new AdvisorError(404, 'job_expired', 'This Survival LLM request has expired. Please ask again.');
  if (['timeout', 'inference_timeout'].includes(data?.code)) return new AdvisorError(504, 'timeout', 'The private model took too long to respond. Please try again.');
  return unavailable();
}

export function createHostedSurvivalService({ env = process.env, fetch: request = globalThis.fetch, now = Date.now, tickets = createHostedSurvivalTickets({ env, now }) } = {}) {
  const owners = new Map();
  const isConfigured = () => Boolean(survivalServerUrl(env) && tickets.isConfigured());
  function takeSlot(owner, purpose) {
    if (!validSurvivalOwner(owner)) throw new AdvisorError(401, 'unauthorized', 'Sign in to use Survival LLM.');
    const timestamp = now();
    for (const [id, state] of owners) if (!state.inFlight && timestamp >= state.resetAt) owners.delete(id);
    let state = owners.get(owner.id);
    if (!state) {
      if (owners.size >= 64) throw new AdvisorError(429, 'busy', 'Survival LLM is busy. Please try again shortly.', 60);
      state = { chat: 0, control: 0, inFlight: 0, chatInFlight: false, resetAt: timestamp + 60_000 };
      owners.set(owner.id, state);
    }
    if (timestamp >= state.resetAt) { state.chat = 0; state.control = 0; state.resetAt = timestamp + 60_000; }
    const key = purpose === 'chat' ? 'chat' : 'control';
    if (state[key] >= (key === 'chat' ? 6 : 60)) throw new AdvisorError(429, 'rate_limited', 'Please pause before trying again.', Math.max(1, Math.ceil((state.resetAt - timestamp) / 1000)));
    if (state.inFlight >= 3 || (key === 'chat' && state.chatInFlight)) throw new AdvisorError(429, 'request_in_progress', 'Wait for the current server request to finish.', 1);
    state[key]++; state.inFlight++;
    if (key === 'chat') state.chatInFlight = true;
    return () => { state.inFlight--; if (key === 'chat') state.chatInFlight = false; };
  }
  async function perform(purpose, payload, owner, { timeoutMs = 25_000 } = {}) {
    const release = takeSlot(owner, purpose);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(25_000, Math.max(1000, Number(timeoutMs) || 25_000)));
    try {
      const server = survivalServerUrl(env);
      if (!isConfigured() || !server) throw new AdvisorError(503, 'not_configured', 'The private Survival LLM server is not connected.');
      const serialized = JSON.stringify(payload);
      const response = await request(`${server}/${purpose}`, {
        method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SURVIVAL_ORIGIN },
        body: JSON.stringify({ ticket: tickets.issue(serialized, purpose, owner), payload: serialized }),
      });
      const data = await readResponse(response);
      if (controller.signal.aborted) throw new AdvisorError(504, 'timeout', 'The private server took too long to respond. Please try again.');
      if (!response.ok || data.status === 'error') throw remoteFailure(data, response.status);
      if (purpose === 'status') {
        if (typeof data.configured !== 'boolean' || (data.library !== undefined && (!data.library || typeof data.library !== 'object' || Array.isArray(data.library)))) throw unavailable();
        return { configured: data.configured, engine: 'Survival LLM', transport: 'hosted', model: safeText(data.model, 120),
          libraryArticles: Number.isSafeInteger(data.library?.articles) && data.library.articles >= 0 ? data.library.articles : 0,
          error: data.configured ? '' : 'The private model and reference library are still being prepared.' };
      }
      if (purpose === 'cancel') {
        if (data.status !== 'cancelled') throw unavailable();
        return { status: 'cancelled', jobId: payload.jobId };
      }
      if (purpose === 'chat' && response.status === 202) return { status: 'pending', jobId: validateSurvivalJobId(data.jobId) };
      if (purpose === 'result' && data.status === 'pending') return { status: 'pending', jobId: payload.jobId };
      if (purpose === 'result' && data.status !== 'done') throw unavailable();
      return normalizeHostedSurvivalAnswer(data);
    } catch (error) {
      if (controller.signal.aborted) throw new AdvisorError(504, 'timeout', 'The private server took too long to respond. Please try again.');
      if (error instanceof AdvisorError) throw error;
      throw unavailable();
    } finally { clearTimeout(timeout); release(); }
  }
  return {
    isConfigured,
    async status(owner) {
      if (!validSurvivalOwner(owner)) throw new AdvisorError(401, 'unauthorized', 'Sign in to use Survival LLM.');
      if (!isConfigured()) return { configured: false, engine: 'Survival LLM', transport: 'hosted', model: '', libraryArticles: 0, error: 'The private Survival LLM server is not connected.' };
      return perform('status', {}, owner);
    },
    assess: (input, owner) => perform('chat', validateAdvisorInput(input), owner),
    result: (jobId, owner) => perform('result', { jobId: validateSurvivalJobId(jobId) }, owner),
    cancel: (jobId, owner, options) => perform('cancel', { jobId: validateSurvivalJobId(jobId) }, owner, options),
  };
}
