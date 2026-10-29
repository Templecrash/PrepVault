import { handlePublicFeedRequest } from './_lib/public-feed.js';
import { loadPreparednessBriefing } from './_lib/preparedness-news.js';
import { briefingLocationKey, readBriefingLocation } from './_lib/briefing-location.js';

export function createLocationBriefingHandler({ load = loadPreparednessBriefing, now = Date.now } = {}) {
  const cache = new Map(); const pending = new Map();
  let refreshWindow = { startedAt: now(), count: 0 };
  return async (req, res) => {
    if (handlePublicFeedRequest(req, res)) return;
    let location;
    try {
      const params = new URL(req.url || '/', 'https://prepvault.invalid').searchParams;
      if ([...new Set(params.keys())].some(key => params.getAll(key).length > 1)) throw new Error('Provide each location field only once.');
      location = readBriefingLocation(req.query || Object.fromEntries(params));
    } catch (error) { return res.status(400).json({ error: error.message }); }
    const key = briefingLocationKey(location); const time = now();
    for (const [entryKey, entry] of cache) if (entry.expires <= time) cache.delete(entryKey);
    const forRequest = data => ({ ...data, coverageContext: location });
    if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return res.status(200).json(forRequest(hit.data)); }
    try {
      // Bound both live work and distinct area refreshes; query variants cannot
      // turn this public endpoint into an unbounded provider proxy.
      if (!pending.has(key)) {
        if (time - refreshWindow.startedAt >= 60_000) refreshWindow = { startedAt: time, count: 0 };
        if (pending.size >= 4 || refreshWindow.count >= 16) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Several areas are refreshing. Try this location again in a minute.' }); }
        refreshWindow.count++;
        pending.set(key, load({ location }).then(data => {
          cache.set(key, { data, expires: now() + (data.sources.every(source => source.status === 'unavailable') ? 120_000 : 600_000) });
          while (cache.size > 32) cache.delete(cache.keys().next().value);
          return data;
        }).finally(() => { pending.delete(key); }));
      }
      return res.status(200).json(forRequest(await pending.get(key)));
    } catch { return res.status(502).json({ error: 'The briefing could not be checked. Open official sources and try again shortly.' }); }
  };
}
export default createLocationBriefingHandler();
