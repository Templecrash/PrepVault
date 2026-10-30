import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationPublisher, positionToFix } from '../src/location-publisher.js';

const BASE = Date.parse('2026-10-26T12:00:00Z');
const expiration = new Date(BASE + 60_000).toISOString();
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(transport) {
  let time = BASE;
  let received, failed, interval;
  let watches = 0, cleared = 0;
  const calls = [], states = [], credentials = [];
  const geo = {
    watchPosition(success, error) { received = success; failed = error; watches += 1; return watches; },
    clearWatch() { cleared += 1; },
    getCurrentPosition(success) { success({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: time }); },
  };
  const controller = createLocationPublisher({
    geolocation: geo,
    now: () => time,
    every(fn) { interval = fn; return 1; },
    cancelEvery() { interval = null; },
    async request(action, payload, accessToken, options) {
      calls.push({ action, payload, accessToken, options });
      if (transport) return transport(action, payload);
      if (action === 'start') return { token: 'publisher' };
      if (action === 'update') return { updatedAt: new Date(time).toISOString() };
      return {};
    },
    onChange: state => states.push(state),
    onToken: credential => credentials.push(credential),
  });
  return {
    controller, calls, states, credentials,
    watches: () => watches, cleared: () => cleared,
    fail: error => failed(error),
    fix: () => received({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: time }),
    advance(ms) { time += ms; interval?.(); },
  };
}

test('does not collect GPS or claim an invitation until explicit start and a valid fix', async () => {
  const t = setup();
  assert.equal(t.watches(), 0);
  assert.deepEqual(t.calls, []);
  t.controller.start({ token: 'invitation', kind: 'invitation' }, expiration);
  assert.equal(t.watches(), 1);
  assert.deepEqual(t.calls, []);
  t.fix();
  await tick();
  assert.deepEqual(t.calls.map(call => call.action), ['start', 'update']);
  assert.deepEqual(t.calls[1].payload, { token: 'publisher', lat: 0, lng: 0, accuracy: 8, capturedAt: new Date(BASE).toISOString() });
  assert.equal(t.states.at(-1).phase, 'sharing');
});

test('permission denial publishes nothing and permits an explicit retry', async () => {
  const t = setup();
  t.controller.start({ token: 'invitation', kind: 'invitation' }, expiration);
  t.fail({ code: 1 });
  assert.equal(t.cleared(), 1);
  assert.equal(t.states.at(-1).phase, 'permission-denied');
  assert.deepEqual(t.calls, []);
  t.controller.start({ token: 'invitation', kind: 'invitation' }, expiration);
  t.fix();
  await tick();
  assert.deepEqual(t.calls.map(call => call.action), ['start', 'update']);
});

test('stopping during invitation claim prevents the first upload and revokes the issued publisher', async () => {
  let finishClaim;
  const t = setup(action => action === 'start' ? new Promise(resolve => { finishClaim = resolve; }) : {});
  t.controller.start({ token: 'invitation', kind: 'invitation' }, expiration);
  t.fix();
  const stopping = t.controller.stop();
  finishClaim({ token: 'publisher' });
  await stopping;
  assert.deepEqual(t.calls.map(call => call.action), ['start', 'stop']);
  assert.equal(t.calls[1].payload.token, 'publisher');
  assert.equal(t.credentials.at(-1), null);
  assert.equal(t.states.at(-1).phase, 'stopped');
});

test('stop clears the GPS watch and no subsequent callbacks can upload', async () => {
  const t = setup();
  t.controller.start({ token: 'publisher', kind: 'publisher' }, expiration);
  t.fix();
  await tick();
  await t.controller.stop();
  t.fix();
  t.advance(10_000);
  await tick();
  assert.deepEqual(t.calls.map(call => call.action), ['update', 'stop']);
  assert.equal(t.cleared(), 1);
});

test('expired invitations never start GPS; an active session stops at expiry', async () => {
  const t = setup();
  t.controller.start({ token: 'invitation', kind: 'invitation' }, new Date(BASE).toISOString());
  assert.equal(t.watches(), 0);
  assert.equal(t.states.at(-1).phase, 'ended');
  t.controller.start({ token: 'publisher', kind: 'publisher' }, expiration);
  t.fix();
  await tick();
  t.advance(60_000);
  await tick();
  assert.deepEqual(t.calls.map(call => call.action), ['update', 'stop']);
  assert.equal(t.states.at(-1).phase, 'expired');
});

test('transport failure keeps stop retryable while GPS remains off', async () => {
  let offline = true;
  const t = setup(action => {
    if (action === 'stop' && offline) throw new Error('network failure');
    return { updatedAt: new Date(BASE).toISOString() };
  });
  t.controller.start({ token: 'publisher', kind: 'publisher' }, expiration);
  t.fix();
  await tick();
  await t.controller.stop();
  assert.equal(t.states.at(-1).phase, 'stop-failed');
  assert.equal(t.cleared(), 1);
  offline = false;
  await t.controller.stop();
  assert.equal(t.states.at(-1).phase, 'stopped');
});

test('stationary phone obtains a fresh fix and throttles rapid watch callbacks', async () => {
  const t = setup();
  t.controller.start({ token: 'publisher', kind: 'publisher' }, expiration);
  t.fix(); t.fix(); t.fix();
  await tick();
  assert.equal(t.calls.length, 1);
  t.advance(10_000);
  await tick();
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[1].payload.capturedAt, new Date(BASE + 10_000).toISOString());
});

test('leaving an unused controller does not erase the invitation; active leave requests keepalive stop', async () => {
  const t = setup();
  t.controller.leave();
  await tick();
  assert.deepEqual(t.credentials, []);
  t.controller.start({ token: 'publisher', kind: 'publisher' }, expiration);
  t.fix();
  await tick();
  t.controller.leave();
  await tick();
  assert.equal(t.calls.at(-1).action, 'stop');
  assert.equal(t.calls.at(-1).options.keepalive, true);
  assert.equal(t.credentials.at(-1), null);
});

test('accepts equator coordinates but rejects invalid, stale and future fixes', () => {
  const position = { coords: { latitude: 0, longitude: 0, accuracy: 0 }, timestamp: BASE };
  assert.equal(positionToFix(position, BASE).lat, 0);
  assert.equal(positionToFix({ ...position, timestamp: BASE - 46_000 }, BASE), null);
  assert.equal(positionToFix({ ...position, timestamp: BASE + 6_000 }, BASE), null);
  assert.equal(positionToFix({ ...position, coords: { ...position.coords, latitude: 91 } }, BASE), null);
  assert.equal(positionToFix({ ...position, coords: { ...position.coords, accuracy: -1 } }, BASE), null);
});

test('revoked publisher stops collection without retrying or keeping its credential', async () => {
  const t = setup(() => { const error = new Error('Sharing ended'); error.status = 410; throw error; });
  t.controller.start({ token: 'publisher', kind: 'publisher' }, expiration);
  t.fix();
  await tick();
  assert.equal(t.states.at(-1).phase, 'ended');
  assert.equal(t.credentials.at(-1), null);
  assert.equal(t.cleared(), 1);
  t.advance(10_000);
  t.fix();
  await tick();
  assert.equal(t.calls.length, 1);
});

test('page exit during claim stops the resulting publisher without uploading', async () => {
  let finishClaim;
  const t = setup(action => action === 'start' ? new Promise(resolve => { finishClaim = resolve; }) : {});
  t.controller.start({ token: 'invitation', kind: 'invitation' }, expiration);
  t.fix();
  t.controller.leave();
  finishClaim({ token: 'publisher' });
  await tick();
  assert.deepEqual(t.calls.map(call => call.action), ['start', 'stop']);
  assert.equal(t.calls.at(-1).options.keepalive, true);
});
