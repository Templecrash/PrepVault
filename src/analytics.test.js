import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@launchfury/analytics', () => ({
  analytics: {
    init: mocks.init,
    capture: mocks.capture,
    identify: mocks.identify,
    reset: mocks.reset,
  },
}));

vi.mock('./supabase.js', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

async function loadAnalytics() {
  return import('./analytics.js');
}

beforeEach(() => {
  vi.resetModules();
  mocks.init.mockClear();
  mocks.capture.mockClear();
  mocks.identify.mockClear();
  mocks.reset.mockClear();
  mocks.getSession.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('analytics module', () => {
  it('is disabled without a write key and never initializes the SDK', async () => {
    vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', '');
    const mod = await loadAnalytics();

    expect(mod.analyticsEnabled).toBe(false);
    expect(mocks.init).not.toHaveBeenCalled();

    mod.track('some_event');
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('initializes once with the production write key and ingest host', async () => {
    vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', 'test-write-key');
    const mod = await loadAnalytics();

    expect(mod.analyticsEnabled).toBe(true);
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.init).toHaveBeenCalledWith({
      writeKey: 'test-write-key',
      host: 'https://launchfury.com',
    });
  });

  it('track() forwards events with properties to the SDK', async () => {
    vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', 'test-write-key');
    const mod = await loadAnalytics();

    mod.track('item_added', { category: 'water' });
    expect(mocks.capture).toHaveBeenCalledWith('item_added', { category: 'water' });
  });

  it('resetAnalytics() clears session and identity state', async () => {
    vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', 'test-write-key');
    const mod = await loadAnalytics();

    mod.resetAnalytics();
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it('identifyUser() exchanges the app user id for a signed identity token', async () => {
    vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', 'test-write-key');
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'app-jwt' } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'identity-token' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadAnalytics();
    await mod.identifyUser({ id: 'user-123', email: 'a@example.com' });

    expect(fetchMock).toHaveBeenCalledWith('/api/analytics/identity', {
      method: 'POST',
      headers: { authorization: 'Bearer app-jwt' },
    });
    expect(mocks.identify).toHaveBeenCalledWith('identity-token');
  });

  it('identifyUser() skips local-only (non-Supabase) users', async () => {
    vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', 'test-write-key');
    const mod = await loadAnalytics();

    await mod.identifyUser({ id: 'local-1', email: 'a@example.com', isLocal: true });

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.identify).not.toHaveBeenCalled();
  });

  it('identifyUser() only links a given user once', async () => {
    vi.stubEnv('VITE_LAUNCHFURY_ANALYTICS_WRITE_KEY', 'test-write-key');
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'app-jwt' } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'identity-token' }),
    }));

    const mod = await loadAnalytics();
    await mod.identifyUser({ id: 'user-123', email: 'a@example.com' });
    await mod.identifyUser({ id: 'user-123', email: 'a@example.com' });

    expect(mocks.identify).toHaveBeenCalledTimes(1);
  });
});
