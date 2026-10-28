const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value);
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const photoTime = photo => time(photo.receivedAt) ?? time(photo.capturedAt) ?? -Infinity;

/** Every known camera gets a card; absent photos never imply a healthy camera. */
export function latestCameraPhotos(reveal) {
  if (!reveal?.connected) return [];
  const photos = new Map();
  const source = Array.isArray(reveal.latestPhotos) ? reveal.latestPhotos : reveal.photos;
  for (const photo of Array.isArray(source) ? source : []) {
    if (!photo || !validId(photo.id) || !validId(photo.cameraId)) continue;
    const previous = photos.get(photo.cameraId);
    if (!previous || photoTime(photo) > photoTime(previous)) photos.set(photo.cameraId, {
      id: photo.id, cameraId: photo.cameraId,
      capturedAt: time(photo.capturedAt) === null ? null : photo.capturedAt,
      receivedAt: time(photo.receivedAt) === null ? null : photo.receivedAt,
    });
  }
  const seen = new Set();
  return (Array.isArray(reveal.cameras) ? reveal.cameras : []).flatMap(camera => {
    if (!camera || !validId(camera.id) || seen.has(camera.id)) return [];
    seen.add(camera.id);
    return [{ camera: {
      id: camera.id, name: typeof camera.name === 'string' && camera.name ? camera.name : 'Unnamed camera',
      status: ['online', 'offline'].includes(camera.status) ? camera.status : 'unknown',
      batteryPercent: Number.isFinite(camera.batteryPercent) ? camera.batteryPercent : null,
    }, photo: photos.get(camera.id) || null }];
  });
}

export function surveillanceIsStale(service, now = Date.now()) {
  const checked = time(service?.checkedAt);
  return Boolean(service?.error) || checked === null || checked > now + 60_000 || now - checked > 5 * 60_000;
}

/** Abortable owner-first reads. No credentials or provider data are persisted. */
export function createOverviewSurveillanceLoader({ getOwner, getFeed, onChange }) {
  let revision = 0;
  let pending = null;
  let disposed = false;
  let state = { phase: 'checking', ownerId: null, data: null, error: '', busy: false };
  const publish = next => { state = next; if (!disposed) onChange(state); };
  const cancel = () => { revision += 1; pending?.abort(); pending = null; };
  const clear = (phase = 'signed-out', error = '') => {
    cancel();
    publish({ phase, ownerId: null, data: null, error, busy: false });
  };
  return {
    clear,
    offline() {
      cancel();
      publish({ ...state, phase: 'offline', busy: false, error: 'Offline. Camera images and alarm states cannot be refreshed.' });
    },
    async refresh({ reset = false } = {}) {
      if (disposed || (pending && !reset)) return;
      if (reset) clear('checking');
      const controller = new AbortController();
      pending = controller;
      const currentRevision = ++revision;
      const valid = () => !disposed && !controller.signal.aborted && currentRevision === revision;
      publish({ ...state, phase: state.data ? 'ready' : 'checking', busy: true, error: '' });
      let owner;
      try {
        owner = await getOwner({ signal: controller.signal });
        if (!valid()) return;
        if (!owner) { clear(); return; }
        if (state.ownerId && state.ownerId !== owner.id) publish({ phase: 'checking', ownerId: null, data: null, error: '', busy: true });
        const data = await getFeed({ signal: controller.signal });
        if (!valid()) return;
        publish({ phase: 'ready', ownerId: owner.id, data, error: '', busy: false });
      } catch (error) {
        if (!valid()) return;
        if (error.status === 401 || error.status === 403) { clear('signed-out', 'Sign in to open your private camera and alarm overview.'); return; }
        const canKeep = owner && owner.id === state.ownerId;
        publish({ phase: 'unavailable', ownerId: canKeep ? state.ownerId : null, data: canKeep ? state.data : null, error: error.message || 'The private surveillance connection could not be checked.', busy: false });
      } finally {
        if (currentRevision === revision) pending = null;
      }
    },
    destroy() { disposed = true; cancel(); state = { phase: 'signed-out', ownerId: null, data: null, error: '', busy: false }; },
  };
}
