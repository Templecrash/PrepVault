// Public station streams are listed with their broadcaster/source page.
export const RADIO_STATIONS = [
  { id: 'noaa-buffalo', name: 'NOAA Weather · Buffalo KEB98', type: 'weather', region: 'Buffalo, New York · weatherUSA relay', frequency: '162.550 MHz', url: 'https://radio.weatherusa.net/NWR/KEB98.mp3', source: 'https://www.weatherusa.net/radio' },
  { id: 'wnyc-fm', name: 'WNYC 93.9 FM · News & public radio', type: 'news', region: 'New York, United States', url: 'https://fm939.wnyc.org/wnycfm', source: 'https://www.wnyc.org/audio-other-formats/' },
  { id: 'kexp-seattle', name: 'KEXP 90.3 FM · Seattle', type: 'music', region: 'Seattle, United States', url: 'https://kexp.streamguys1.com/kexp160.aac', source: 'https://kexp.org/streaming-urls/' },
  { id: 'jazz-fm-toronto', name: 'JAZZ.FM91 · Toronto', type: 'music', region: 'Toronto, Canada', url: 'https://jazzfm91.streamb.live/SB00009', source: 'https://jazz.fm/streaming/' },
];

export function normalizeStreamUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete HTTPS audio stream URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS stream URL without a username or password.');
  return url.href;
}

export function readSavedStations(storage) {
  try {
    const saved = JSON.parse(storage.getItem('prepvault-user-channels') || '[]');
    if (!Array.isArray(saved)) return [];
    const ids = new Set();
    return saved.flatMap(station => {
      if (!station || typeof station.id !== 'string' || typeof station.name !== 'string' || typeof station.url !== 'string' || !station.id.trim() || !station.name.trim() || ids.has(station.id.trim())) return [];
      try {
        const url = normalizeStreamUrl(station.url);
        ids.add(station.id.trim());
        return [{ ...station, id: station.id.trim(), name: station.name.trim(), url }];
      } catch { return []; }
    });
  } catch { return []; }
}

export function resolveStation(id, saved = [], stations = RADIO_STATIONS) {
  return [...stations, ...saved].find(station => station.id === id) || stations[0];
}

function playbackError(error) {
  if (error?.name === 'NotAllowedError') return 'Your browser blocked playback. Press Play radio to allow audio.';
  return 'This stream could not play. Retry or choose another station.';
}

// Calls play() inside the user's click, never in a React effect. A plain media
// element can play cross-origin audio without requiring the server to allow CORS.
export class RadioPlayback {
  constructor(audio, onState, timeoutMs = 20000) {
    this.audio = audio;
    this.onState = onState;
    this.timeoutMs = timeoutMs;
    this.generation = 0;
    this.listeners = [];
    this.wantsPlayback = false;
    this.disposed = false;
  }
  emit(status, error = '') { if (!this.disposed) this.onState({ status, error }); }
  clearTimer() { clearTimeout(this.timer); this.timer = null; }
  release() {
    this.clearTimer();
    for (const [event, handler] of this.listeners) this.audio.removeEventListener(event, handler);
    this.listeners = [];
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
  start(value, volume = 0.5) {
    if (this.disposed) return;
    let url;
    try { url = normalizeStreamUrl(value); } catch (error) { this.stop('error', error.message); return; }
    const generation = ++this.generation;
    this.release();
    this.wantsPlayback = true;
    const current = () => !this.disposed && this.wantsPlayback && this.generation === generation;
    const fail = message => { if (current()) this.stop('error', message); };
    const armTimeout = () => { this.clearTimer(); this.timer = setTimeout(() => fail('This station is taking too long to respond. Retry or choose another station.'), this.timeoutMs); };
    const listen = (event, handler) => { this.listeners.push([event, handler]); this.audio.addEventListener(event, handler); };
    listen('playing', () => { if (current() && !this.audio.paused && this.audio.readyState >= 2) { this.clearTimer(); this.emit('playing'); } });
    for (const event of ['waiting', 'stalled']) listen(event, () => { if (current()) { this.emit('buffering'); armTimeout(); } });
    listen('error', () => fail(playbackError(this.audio.error)));
    listen('ended', () => fail('The station ended its stream. Press Play radio to reconnect.'));
    listen('pause', () => { if (current() && this.audio.paused) { this.wantsPlayback = false; this.clearTimer(); this.emit('paused'); } });
    this.audio.preload = 'none';
    this.audio.src = url;
    this.setVolume(volume);
    this.emit('connecting');
    armTimeout();
    try {
      Promise.resolve(this.audio.play()).catch(error => {
        if (current()) fail(playbackError(error));
      });
    } catch (error) { fail(playbackError(error)); }
  }
  setVolume(value) { this.audio.volume = Math.max(0, Math.min(1, Number(value) || 0)); }
  stop(status = 'idle', error = '') {
    ++this.generation;
    this.wantsPlayback = false;
    this.release();
    this.emit(status, error);
  }
  pause() { this.stop('paused'); }
  dispose() { this.disposed = true; this.stop(); }
}
