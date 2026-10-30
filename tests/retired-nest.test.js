import test from 'node:test';
import assert from 'node:assert/strict';
import auth from '../api/smart-home/nest/auth.js';
import callback from '../api/smart-home/nest/callback.js';
import devices from '../api/smart-home/nest/devices.js';

function response() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('retired Nest routes never read credentials, exchange OAuth codes or return synthetic devices', async () => {
  const req = new Proxy({}, { get() { throw new Error('Retired route must not consume credentials or OAuth state.'); } });
  for (const handler of [auth, callback, devices]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 410);
    assert.equal(res.body.code, 'integration_unavailable');
    assert.match(res.body.error, /Google Nest is not connected/);
    assert.equal(res.body.devices, undefined);
    assert.equal(res.headers['set-cookie'], undefined);
    assert.equal(res.headers.location, undefined);
    assert.match(res.headers['cache-control'], /private, no-store/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  }
});
