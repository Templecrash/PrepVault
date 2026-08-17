import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('../_lib/auth-middleware.js', () => ({
  getUser: mocks.getUser,
  handleCors: () => false,
}));

import identityHandler from './identity.js';
import identityDeleteHandler from './identity-delete.js';

function makeRes() {
  const res = {
    _status: 200,
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._body = body;
      return res;
    },
  };
  return res;
}

beforeEach(() => {
  mocks.getUser.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('api/analytics/identity', () => {
  it('returns 401 when the request is not authenticated', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = makeRes();
    await identityHandler({ method: 'POST' }, res);
    expect(res._body).toEqual({ error: 'Unauthorized' });
    expect(res._status).toBe(401);
  });

  it('returns 500 when the server key is not configured', async () => {
    vi.stubEnv('LAUNCHFURY_ANALYTICS_SERVER_KEY', '');
    mocks.getUser.mockResolvedValue({ id: 'user-123' });
    const res = makeRes();
    await identityHandler({ method: 'POST' }, res);
    expect(res._body).toEqual({ error: 'Analytics identity service not configured' });
    expect(res._status).toBe(500);
  });

  it('exchanges the app user id for a token and returns only the token', async () => {
    vi.stubEnv('LAUNCHFURY_ANALYTICS_SERVER_KEY', 'server-secret');
    mocks.getUser.mockResolvedValue({ id: 'user-123' });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ token: 'identity-token' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await identityHandler({ method: 'POST' }, res);

    expect(fetchMock).toHaveBeenCalledWith('https://launchfury.com/api/analytics/identity', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer server-secret',
      },
      body: JSON.stringify({ user_id: 'user-123' }),
    });
    expect(res._body).toEqual({ token: 'identity-token' });
    expect(res._status).toBe(200);
  });
});

describe('api/analytics/identity-delete', () => {
  it('rejects non-DELETE methods', async () => {
    const res = makeRes();
    await identityDeleteHandler({ method: 'GET' }, res);
    expect(res._body).toEqual({ error: 'Method not allowed' });
    expect(res._status).toBe(405);
  });

  it('returns 401 when the request is not authenticated', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = makeRes();
    await identityDeleteHandler({ method: 'DELETE' }, res);
    expect(res._body).toEqual({ error: 'Unauthorized' });
    expect(res._status).toBe(401);
  });

  it('calls the LaunchFury identity deletion endpoint with the server key', async () => {
    vi.stubEnv('LAUNCHFURY_ANALYTICS_SERVER_KEY', 'server-secret');
    mocks.getUser.mockResolvedValue({ id: 'user-123' });
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await identityDeleteHandler({ method: 'DELETE' }, res);

    expect(fetchMock).toHaveBeenCalledWith('https://launchfury.com/api/analytics/identity/delete', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer server-secret',
      },
      body: JSON.stringify({ user_id: 'user-123' }),
    });
    expect(res._body).toEqual({ ok: true });
    expect(res._status).toBe(200);
  });
});
