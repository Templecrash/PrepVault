import { handlePublicFeedRequest } from './_lib/public-feed.js';
import { loadPreparednessBriefing } from './_lib/preparedness-news.js';

export function createLocationBriefingHandler({ load = loadPreparednessBriefing, now = Date.now } = {}) {
  let cache = null; let pending = null;
  return async (req, res) => {
    if (handlePublicFeedRequest(req, res)) return;
    const query = req.query || Object.fromEntries(new URL(req.url, 'https://prepvault.invalid').searchParams);
    if (Object.keys(query).length) return res.status(400).json({ error: 'This briefing uses a fixed set of public sources.' });
    if (cache?.expires > now()) return res.status(200).json(cache.data);
    try {
      // Coalesce concurrent refreshes so one user cannot multiply provider requests.
      if (!pending) pending = load().then(data => { cache = { data, expires: now() + (data.sources.every(source => source.status === 'unavailable') ? 120_000 : 600_000) }; return data; }).finally(() => { pending = null; });
      return res.status(200).json(await pending);
    } catch { return res.status(502).json({ error: 'The briefing could not be checked. Open official sources and try again shortly.' }); }
  };
}
export default createLocationBriefingHandler();
