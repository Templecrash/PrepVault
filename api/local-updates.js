import { handlePublicFeedRequest } from './_lib/public-feed.js';
import { briefingLocationKey, readBriefingLocation } from './_lib/briefing-location.js';
import { loadLocalUpdates, localUpdateArea } from './_lib/local-updates.js';

export function createLocalUpdatesHandler({ load = loadLocalUpdates, now = Date.now } = {}) {
  const cache = new Map(); const pending = new Map();
  let window = { startedAt: now(), count: 0 };
  return async function localUpdatesHandler(req, res) {
    if (handlePublicFeedRequest(req, res)) return;
    let location;
    try {
      const params = new URL(req.url || '/api/local-updates', 'https://prepvault.invalid').searchParams;
      if ([...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) throw Error();
      location = readBriefingLocation(req.query || Object.fromEntries(params));
      if (!location) throw Error();
    } catch { return res.status(400).json({ error: 'Choose a valid city, region and country to check local updates.', code: 'invalid_location' }); }
    // All Toronto spelling/case variants share the same two public requests.
    const key = localUpdateArea(location) || briefingLocationKey(location);
    const time = now();
    for (const [entryKey, entry] of cache) if (entry.expires <= time) cache.delete(entryKey);
    const forRequest = data => ({ ...data, location });
    if (cache.has(key)) return res.status(200).json(forRequest(cache.get(key).data));
    try {
      if (!pending.has(key)) {
        if (time - window.startedAt >= 60_000) window = { startedAt: time, count: 0 };
        if (pending.size >= 4 || window.count >= 16) {
          res.setHeader('Retry-After', '60');
          return res.status(429).json({ error: 'Local updates are refreshing. Try again in a minute.', code: 'rate_limited' });
        }
        window.count++;
        pending.set(key, Promise.resolve().then(() => load({ location, now })).then(data => {
          const failed = data.sources.every(source => source.status === 'unavailable');
          cache.set(key, { data, expires: now() + (failed ? 30_000 : 120_000) });
          while (cache.size > 64) cache.delete(cache.keys().next().value);
          return data;
        }).finally(() => pending.delete(key)));
      }
      return res.status(200).json(forRequest(await pending.get(key)));
    } catch { return res.status(502).json({ error: 'Local updates could not be checked. Open official sources for current information.', code: 'unavailable' }); }
  };
}
export default createLocalUpdatesHandler();
