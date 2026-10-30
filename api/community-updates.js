import { handlePublicFeedRequest } from './_lib/public-feed.js';
import { briefingLocationKey, readBriefingLocation } from './_lib/briefing-location.js';
import { loadCommunityUpdates } from './_lib/community-updates.js';

export function createCommunityUpdatesHandler({ load = loadCommunityUpdates, now = Date.now } = {}) {
  const cache = new Map(); const pending = new Map(); let window = { at: now(), count: 0 };
  return async (req, res) => {
    if (handlePublicFeedRequest(req, res)) return;
    let location;
    try {
      const params = new URL(req.url || '/api/community-updates', 'https://unused.invalid').searchParams;
      if ([...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) throw Error();
      location = readBriefingLocation(req.query || Object.fromEntries(params));
      if (!location) throw Error();
    } catch { return res.status(400).json({ error: 'Choose a valid city, region and country.', code: 'invalid_location' }); }
    const key = briefingLocationKey(location); const time = now();
    for (const [id, entry] of cache) if (entry.expires <= time) cache.delete(id);
    if (cache.has(key)) return res.status(200).json({ ...cache.get(key).data, location });
    try {
      if (!pending.has(key)) {
        if (time - window.at >= 60000) window = { at: time, count: 0 };
        if (pending.size >= 4 || window.count >= 16) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Public reports are refreshing. Try again in a minute.' }); }
        window.count++;
        pending.set(key, Promise.resolve().then(() => load({ location, now })).then(data => {
          cache.set(key, { data, expires: now() + (data.sources.every(source => source.status === 'unavailable') ? 60000 : 600000) });
          while (cache.size > 64) cache.delete(cache.keys().next().value);
          return data;
        }).finally(() => pending.delete(key)));
      }
      return res.status(200).json({ ...await pending.get(key), location });
    } catch { return res.status(502).json({ error: 'Public reports could not be checked. Open the source searches for current results.' }); }
  };
}
export default createCommunityUpdatesHandler();
