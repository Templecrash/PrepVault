const FIX_MAX_AGE_MS = 45_000;

export function locationErrorMessage(error) {
  if (error?.code === 1) return 'Location access was declined. Allow location access for this site in your browser, then try again.';
  if (error?.code === 2) return 'Your phone cannot find its location yet. Move somewhere with a clearer signal and try again.';
  if (error?.code === 3) return 'Finding your location took too long. Keep this page open and try again.';
  return error?.message || 'The location update could not be sent. We will retry while this page is open.';
}

export function positionToFix(position, now = Date.now()) {
  const { latitude: lat, longitude: lng, accuracy } = position?.coords || {};
  const timestamp = position?.timestamp;
  if (![lat, lng, accuracy, timestamp].every(Number.isFinite)
    || lat < -90 || lat > 90 || lng < -180 || lng > 180 || accuracy < 0
    || timestamp > now + 5_000 || now - timestamp > FIX_MAX_AGE_MS) return null;
  return { lat, lng, accuracy, capturedAt: new Date(timestamp).toISOString() };
}

// The controller has no storage and never requests GPS before start().
// Keeping the transport injectable makes consent and cancellation testable.
export function createLocationPublisher({
  geolocation, request, onChange, onToken,
  now = Date.now, every = setInterval, cancelEvery = clearInterval,
}) {
  let active = false;
  let generation = 0;
  let watchId = null;
  let timer = null;
  let credential = null;
  let expiresAt = 0;
  let latestFix = null;
  let lastPublishedAt = null;
  let lastAttemptAt = -Infinity;
  let pending = null;
  let locating = false;

  const emit = update => onChange?.(update);
  const saveToken = value => { credential = value; onToken?.(value); };
  const stopLocal = () => {
    active = false;
    generation += 1;
    if (watchId !== null) geolocation?.clearWatch(watchId);
    watchId = null;
    if (timer !== null) cancelEvery(timer);
    timer = null;
    locating = false;
    latestFix = null;
  };

  async function stopRemote(value, options) {
    if (!value || value.kind !== 'publisher') return;
    try { await request('stop', { token: value.token }, undefined, options); }
    catch (error) { if (![404, 410].includes(error.status)) throw error; }
  }

  async function stop(reason = 'stopped') {
    stopLocal();
    emit({ phase: 'stopping', error: '' });
    // If claiming was in flight, let it disclose its new token before stopping.
    // No subsequent GPS update can pass the generation check below.
    if (pending) await pending;
    try {
      await stopRemote(credential);
      saveToken(null);
      emit({ phase: reason, error: '' });
    } catch {
      emit({ phase: 'stop-failed', error: 'Location collection has stopped on this phone. We could not remove the last shared position yet. Reconnect and retry; the sharing link will also expire automatically.' });
    }
  }

  function terminal(error) {
    stopLocal();
    saveToken(null);
    emit({ phase: 'ended', error: error?.message || 'This sharing session has ended. Ask for a new invitation to share again.' });
  }

  function flush() {
    if (!active || pending || !latestFix || now() - lastAttemptAt < 9_000) return;
    if (now() >= expiresAt) { void stop('expired'); return; }
    if (now() - Date.parse(latestFix.capturedAt) > FIX_MAX_AGE_MS || latestFix.capturedAt === lastPublishedAt) return;
    const run = generation;
    const fix = latestFix;
    lastAttemptAt = now();
    pending = (async () => {
      try {
        if (credential.kind === 'invitation') {
          const result = await request('start', { token: credential.token });
          saveToken({ token: result.token, kind: 'publisher' });
        }
        if (!active || run !== generation) return;
        const result = await request('update', { token: credential.token, ...fix });
        if (!active || run !== generation) return;
        lastPublishedAt = fix.capturedAt;
        emit({ phase: 'sharing', error: '', lastSent: result.updatedAt, accuracy: fix.accuracy });
      } catch (error) {
        if (!active || run !== generation) return;
        if ([404, 410].includes(error.status)) { terminal(error); return; }
        emit({ phase: 'connecting', error: locationErrorMessage(error) });
      }
    })().finally(() => { pending = null; });
  }

  function receive(position, run) {
    if (!active || run !== generation) return;
    const fix = positionToFix(position, now());
    if (!fix) { emit({ error: 'Your phone returned an old or incomplete location. Waiting for a fresh position.' }); return; }
    latestFix = fix;
    flush();
  }

  function failed(error, run) {
    if (!active || run !== generation) return;
    if (error?.code === 1) {
      stopLocal();
      emit({ phase: 'permission-denied', error: locationErrorMessage(error) });
      // A previously granted permission can be revoked during an active session.
      // Clear that shared position too, while retaining a failed stop for retry.
      if (credential?.kind === 'publisher') void stop();
      return;
    }
    emit({ phase: 'locating', error: locationErrorMessage(error) });
  }

  function start(value, expiration) {
    if (active || pending) return;
    if (!geolocation) { emit({ phase: 'unsupported', error: 'Location sharing is not available in this browser. Open the link in a current browser on your phone.' }); return; }
    expiresAt = Date.parse(expiration);
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) { terminal({ message: 'This sharing link has expired. Ask for a new invitation.' }); return; }
    credential = value;
    latestFix = null;
    lastPublishedAt = null;
    lastAttemptAt = -Infinity;
    active = true;
    const run = ++generation;
    emit({ phase: 'locating', error: '' });
    try {
      watchId = geolocation.watchPosition(position => receive(position, run), error => failed(error, run), {
        enableHighAccuracy: true, timeout: 20_000, maximumAge: 0,
      });
    } catch {
      stopLocal();
      emit({ phase: 'unsupported', error: 'Your browser could not start location sharing. Check its location permission and try again.' });
      return;
    }
    timer = every(() => {
      if (!active || run !== generation) return;
      if (now() >= expiresAt) { void stop('expired'); return; }
      flush();
      // Browsers may only invoke a watch callback after movement. Request a
      // fresh timestamp periodically so a stationary phone is not shown stale.
      if (!locating && (!latestFix || now() - Date.parse(latestFix.capturedAt) >= 10_000)) {
        locating = true;
        geolocation.getCurrentPosition(position => { locating = false; receive(position, run); }, error => { locating = false; failed(error, run); }, {
          enableHighAccuracy: true, timeout: 20_000, maximumAge: 0,
        });
      }
    }, 10_000);
  }

  function leave() {
    stopLocal();
    // Page-exit delivery is best effort. Expiration remains the server boundary.
    // If the claim completes before teardown, also clear that newly issued token.
    const finish = () => {
      if (credential?.kind !== 'publisher') return Promise.resolve();
      return stopRemote(credential, { keepalive: true }).then(() => saveToken(null)).catch(() => {});
    };
    if (pending) void pending.then(finish);
    else void finish();
  }

  return { start, stop, leave };
}
