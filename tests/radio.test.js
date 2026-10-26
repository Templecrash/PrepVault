import test from 'node:test';
import assert from 'node:assert/strict';
import { RadioPlayback, RADIO_STATIONS, normalizeStreamUrl, readSavedStations, resolveStation } from '../src/radio.js';

const STREAM_A = 'https://radio.example/first.mp3';
const STREAM_B = 'https://radio.example/second.mp3';

// HTMLMediaElement events remain independent from play() resolving. This lets
// the tests catch UI states that claim audible playback before media arrives.
class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.calls = [];
    this.handlers = new Map();
    this.paused = true;
    this.readyState = 0;
    this.volume = 1;
    this._src = '';
    this.crossOriginWrites = 0;
    this.playImpl = () => Promise.resolve();
  }
  set src(value) { this._src = value; this.calls.push(['src', value]); }
  get src() { return this._src; }
  set crossOrigin(value) { this.crossOriginWrites += 1; this._crossOrigin = value; }
  get crossOrigin() { return this._crossOrigin; }
  addEventListener(event, handler) {
    const handlers = this.handlers.get(event) || new Set();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    super.addEventListener(event, handler);
  }
  removeEventListener(event, handler) {
    this.handlers.get(event)?.delete(handler);
    super.removeEventListener(event, handler);
  }
  play() { this.calls.push(['play']); this.paused = false; return this.playImpl(); }
  pause() { this.calls.push(['pause']); this.paused = true; this.dispatchEvent(new Event('pause')); }
  removeAttribute(name) { this.calls.push(['removeAttribute', name]); if (name === 'src') this._src = ''; }
  load() { this.calls.push(['load']); this.readyState = 0; }
  event(name) { this.dispatchEvent(new Event(name)); }
  playing() { this.paused = false; this.readyState = 2; this.event('playing'); }
  get listenerCount() { return [...this.handlers.values()].reduce((total, handlers) => total + handlers.size, 0); }
}

function setup(t, timeout = 1000) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audio = new FakeAudio();
  const states = [];
  const player = new RadioPlayback(audio, state => states.push(state), timeout);
  t.after(() => { player.dispose(); t.mock.timers.reset(); });
  return { audio, player, states, last: () => states.at(-1) };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settlePromises() { await Promise.resolve(); await Promise.resolve(); }

test('radio calls play synchronously during the user gesture without requesting CORS', t => {
  const { audio, player, last } = setup(t);
  let inGesture = true;
  audio.playImpl = () => { assert.equal(inGesture, true); return Promise.resolve(); };
  player.start(STREAM_A, 0);
  inGesture = false;
  assert.equal(audio.calls.filter(([method]) => method === 'play').length, 1);
  assert.equal(audio.src, STREAM_A);
  assert.equal(audio.preload, 'none');
  assert.equal(audio.volume, 0);
  assert.equal(audio.crossOriginWrites, 0);
  assert.deepEqual(last(), { status: 'connecting', error: '' });
});

test('radio reports playing only after an actual ready, unpaused playing event', async t => {
  const { audio, player, last } = setup(t);
  player.start(STREAM_A);
  await settlePromises();
  assert.equal(last().status, 'connecting', 'play() resolution alone is not proof of playback');
  audio.event('playing');
  assert.equal(last().status, 'connecting', 'an empty media buffer is not playing');
  audio.readyState = 2;
  audio.paused = true;
  audio.event('playing');
  assert.equal(last().status, 'connecting', 'a paused media element is not playing');
  audio.playing();
  assert.deepEqual(last(), { status: 'playing', error: '' });
  t.mock.timers.tick(5000);
  assert.equal(last().status, 'playing', 'successful playback cancels connection timeout');
});

test('pause releases the stream, listeners and timeout instead of merely hiding playback', t => {
  const { audio, player, states, last } = setup(t);
  player.start(STREAM_A);
  audio.playing();
  player.pause();
  assert.deepEqual(last(), { status: 'paused', error: '' });
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
  assert.equal(audio.listenerCount, 0);
  assert.deepEqual(audio.calls.slice(-3), [['pause'], ['removeAttribute', 'src'], ['load']]);
  const count = states.length;
  t.mock.timers.tick(5000);
  audio.playing();
  audio.event('error');
  assert.equal(states.length, count, 'released listeners and timers cannot change paused state');
});

test('volume updates preserve silence and clamp values to the media element range', t => {
  const { audio, player } = setup(t);
  player.start(STREAM_A, 0);
  assert.equal(audio.volume, 0);
  for (const [input, expected] of [[0.35, 0.35], ['0.8', 0.8], [2, 1], [-1, 0], [0, 0], ['invalid', 0]]) {
    player.setVolume(input);
    assert.equal(audio.volume, expected);
  }
  assert.equal(audio.calls.filter(([method]) => method === 'play').length, 1, 'changing volume does not restart the station');
});

test('a rejected play promise from an old station cannot stop a newer station', async t => {
  const { audio, player, last } = setup(t);
  const old = deferred();
  audio.playImpl = () => old.promise;
  player.start(STREAM_A);
  const oldPlayingHandler = [...audio.handlers.get('playing')][0];
  audio.playImpl = () => Promise.resolve();
  player.start(STREAM_B);
  audio.playing();
  old.reject(Object.assign(new Error('Old request blocked'), { name: 'NotAllowedError' }));
  await settlePromises();
  oldPlayingHandler();
  assert.equal(audio.src, STREAM_B);
  assert.equal(audio.paused, false);
  assert.equal(last().status, 'playing');
  assert.equal(audio.calls.filter(([method]) => method === 'pause').length, 2, 'old rejection must not release current source');
});

test('a rejected play promise after stop cannot restore an error or restart audio', async t => {
  const { audio, player, states, last } = setup(t);
  const pending = deferred();
  audio.playImpl = () => pending.promise;
  player.start(STREAM_A);
  player.stop();
  const count = states.length;
  pending.reject(new Error('Cancelled media request'));
  await settlePromises();
  t.mock.timers.tick(5000);
  assert.equal(states.length, count);
  assert.deepEqual(last(), { status: 'idle', error: '' });
  assert.equal(audio.src, '');
});

test('connection timeout reports failure and releases stalled audio', t => {
  const { audio, player, last } = setup(t);
  player.start(STREAM_A);
  t.mock.timers.tick(999);
  assert.equal(last().status, 'connecting');
  t.mock.timers.tick(1);
  assert.equal(last().status, 'error');
  assert.match(last().error, /taking too long/i);
  assert.equal(audio.src, '');
  assert.equal(audio.paused, true);
  assert.equal(audio.listenerCount, 0);
});

test('buffering has a fresh timeout and recovered playback cancels it', t => {
  const { audio, player, last } = setup(t);
  player.start(STREAM_A);
  audio.playing();
  audio.event('waiting');
  assert.equal(last().status, 'buffering');
  t.mock.timers.tick(900);
  audio.playing();
  t.mock.timers.tick(2000);
  assert.equal(last().status, 'playing');
  audio.event('stalled');
  assert.equal(last().status, 'buffering');
  t.mock.timers.tick(1000);
  assert.equal(last().status, 'error');
});

test('current autoplay rejection explains the browser block and releases media', async t => {
  const { audio, player, last } = setup(t);
  audio.playImpl = () => Promise.reject(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' }));
  player.start(STREAM_A);
  await settlePromises();
  assert.equal(last().status, 'error');
  assert.match(last().error, /browser blocked playback/i);
  assert.equal(audio.src, '');
  assert.equal(audio.listenerCount, 0);
});

test('synchronous media failure and error events both surface errors', t => {
  const { audio, player, last } = setup(t);
  audio.playImpl = () => { throw new Error('No media decoder'); };
  player.start(STREAM_A);
  assert.equal(last().status, 'error');
  assert.equal(audio.src, '');
  audio.playImpl = () => Promise.resolve();
  player.start(STREAM_B);
  audio.error = { code: 4, message: 'Source not supported' };
  audio.event('error');
  assert.equal(last().status, 'error');
  assert.match(last().error, /could not play/i);
  assert.equal(audio.src, '');
});

test('ended streams expose a reconnect action and unexpected pauses cannot time out later', t => {
  const { audio, player, last } = setup(t);
  player.start(STREAM_A);
  audio.playing();
  audio.event('ended');
  assert.equal(last().status, 'error');
  assert.match(last().error, /reconnect/i);
  player.start(STREAM_A);
  audio.pause();
  assert.equal(last().status, 'paused');
  t.mock.timers.tick(5000);
  assert.equal(last().status, 'paused');
});

test('dispose is silent, releases resources and prevents future playback', async t => {
  const { audio, player, states } = setup(t);
  const pending = deferred();
  audio.playImpl = () => pending.promise;
  player.start(STREAM_A);
  const count = states.length;
  player.dispose();
  pending.reject(new Error('Disposed request'));
  player.start(STREAM_B);
  await settlePromises();
  t.mock.timers.tick(5000);
  assert.equal(states.length, count);
  assert.equal(audio.listenerCount, 0);
  assert.equal(audio.src, '');
  assert.equal(audio.calls.filter(([method]) => method === 'play').length, 1);
});

test('invalid stream input stops the previous source and never calls play again', t => {
  const { audio, player, last } = setup(t);
  player.start(STREAM_A);
  player.start('http://insecure.example/audio');
  assert.equal(last().status, 'error');
  assert.match(last().error, /HTTPS/);
  assert.equal(audio.src, '');
  assert.equal(audio.calls.filter(([method]) => method === 'play').length, 1);
});

test('stream URL validation normalizes HTTPS and rejects unsupported or credentialed URLs', () => {
  assert.equal(normalizeStreamUrl('  HTTPS://RADIO.EXAMPLE/live?channel=1  '), 'https://radio.example/live?channel=1');
  for (const value of ['', null, undefined, '/stream.mp3', 'not a URL', 'http://radio.example/audio', 'javascript:alert(1)', 'data:audio/mp3;base64,AA==', 'https://name:secret@radio.example/live']) {
    assert.throws(() => normalizeStreamUrl(value), /HTTPS/);
  }
});

test('saved custom stations restore independently from the built-in station list', () => {
  const data = [{ id: 'custom-local', name: 'My hometown station', url: '  https://radio.example/live  ', type: 'custom', region: 'My town' }];
  const saved = readSavedStations({ getItem: () => JSON.stringify(data) });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].url, 'https://radio.example/live');
  assert.equal(resolveStation('custom-local', saved).name, 'My hometown station');
  assert.equal(resolveStation('deleted-custom', saved), RADIO_STATIONS[0]);
  assert.equal(resolveStation(RADIO_STATIONS[0].id, saved), RADIO_STATIONS[0]);
});

test('corrupt saved stations are filtered without discarding valid custom stations', () => {
  const data = [null, { id: 'missing-url', name: 'No URL' }, { id: 'insecure', name: 'HTTP', url: 'http://radio.example/live' }, { id: '', name: 'Blank ID', url: STREAM_A }, { id: 'blank-name', name: '  ', url: STREAM_A }, { id: '  ', name: 'Whitespace ID', url: STREAM_A }, { id: 'good', name: 'Good', url: STREAM_A }, { id: 'good', name: 'Duplicate', url: STREAM_B }];
  const saved = readSavedStations({ getItem: () => JSON.stringify(data) });
  assert.deepEqual(saved.map(station => station.id), ['good']);
  assert.equal(saved[0].url, STREAM_A);
  for (const value of ['not JSON', '{}', 'null', '42']) assert.deepEqual(readSavedStations({ getItem: () => value }), []);
  assert.deepEqual(readSavedStations({ getItem: () => { throw new Error('Storage denied'); } }), []);
});

test('station catalog has unique usable IDs and valid HTTPS stream and source links', () => {
  assert.ok(RADIO_STATIONS.length > 0);
  assert.equal(new Set(RADIO_STATIONS.map(station => station.id)).size, RADIO_STATIONS.length);
  for (const station of RADIO_STATIONS) {
    assert.ok(station.id.trim());
    assert.ok(station.name.trim());
    assert.equal(normalizeStreamUrl(station.url), station.url);
    assert.equal(new URL(station.source).protocol, 'https:');
  }
});
