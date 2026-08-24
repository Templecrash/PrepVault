import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const analyticsMock = {
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
};

vi.mock('@launchfury/analytics', () => ({
  analytics: analyticsMock,
}));

async function loadAnalytics() {
  vi.resetModules();
  return await import('./analytics.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', 'lf_test_browser_key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

describe('initAnalytics', () => {
  it('initializes once with the browser write key and canonical ingest host', async () => {
    const { initAnalytics } = await loadAnalytics();
    initAnalytics();
    initAnalytics();
    expect(analyticsMock.init).toHaveBeenCalledTimes(1);
    expect(analyticsMock.init).toHaveBeenCalledWith({
      writeKey: 'lf_test_browser_key',
      host: 'https://launchfury.com',
      environment: 'prod',
    });
  });

  it('does nothing when no write key is configured', async () => {
    vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', '');
    const { initAnalytics, track } = await loadAnalytics();
    initAnalytics();
    expect(analyticsMock.init).not.toHaveBeenCalled();
    track('signup_completed', { mode: 'local' });
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });
});

describe('track', () => {
  it('captures an event with properties', async () => {
    const { initAnalytics, track } = await loadAnalytics();
    initAnalytics();
    track('login_completed', { mode: 'local' });
    expect(analyticsMock.capture).toHaveBeenCalledWith('login_completed', { mode: 'local' });
  });
});

describe('identifyAuthenticatedUser', () => {
  it('exchanges the session token and identifies with the returned token', async () => {
    const { initAnalytics, identifyAuthenticatedUser } = await loadAnalytics();
    initAnalytics();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'lf_signed_identity_token', expires_at: '2026-08-25T00:00:00Z' }),
    });
    await identifyAuthenticatedUser('user-access-token');
    expect(fetch).toHaveBeenCalledWith('/api/analytics/identity', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer user-access-token' }),
    }));
    expect(analyticsMock.identify).toHaveBeenCalledWith('lf_signed_identity_token');
  });

  it('does not identify when the identity was deleted (410)', async () => {
    const { initAnalytics, identifyAuthenticatedUser } = await loadAnalytics();
    initAnalytics();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({}) });
    await identifyAuthenticatedUser('user-access-token');
    expect(analyticsMock.identify).not.toHaveBeenCalled();
  });
});

describe('resetAnalytics', () => {
  it('resets identity on logout', async () => {
    const { initAnalytics, resetAnalytics } = await loadAnalytics();
    initAnalytics();
    resetAnalytics();
    expect(analyticsMock.reset).toHaveBeenCalled();
  });
});

describe('deleteAnalyticsIdentity', () => {
  it('calls the product deletion route', async () => {
    const { deleteAnalyticsIdentity } = await loadAnalytics();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await deleteAnalyticsIdentity('user-access-token');
    expect(fetch).toHaveBeenCalledWith('/api/analytics/identity/delete', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ authorization: 'Bearer user-access-token' }),
    }));
  });
});
