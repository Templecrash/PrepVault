import { Buffer } from 'node:buffer';
import { assertAuthOrigin } from './_lib/neon-owner-auth.js';
import { authenticateAccount } from './_lib/account-auth.js';
import { validateRouteRequest } from '../src/offline-route.js';
import { requestProviderRoute, RouteProviderError } from './_lib/route-provider.js';
import { searchMapPlaces, validateMapSearchQuery } from './_lib/map-geocoder.js';

export function createRoutingHandler({ authenticate = authenticateAccount, calculate = requestProviderRoute, search = searchMapPlaces, now = Date.now, reportFailure = details => console.warn('Maps service failure', details) } = {}) {
  let busy = false; let lastRequest = 0; const cache = new Map(); const quota = new Map();
  let searchBusy = false; let lastSearch = -Infinity; const searchCache = new Map(); const searchQuota = new Map();
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    let searching = false;
    try {
      assertAuthOrigin(req);
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST to calculate a route.' });
      const account = await authenticate(req); if (!account) return res.status(401).json({ error: 'Sign in to your account to search places and calculate private routes.' });
      if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') return res.status(400).json({ error: 'Send a small JSON route request.' });
      if (Number(req.headers['content-length']) > 16000) return res.status(413).json({ error: 'Too many route details.' });
      let body = req.body;
      if (Buffer.isBuffer(body)) body = body.toString('utf8');
      if (typeof body === 'string') { if (Buffer.byteLength(body) > 16000) return res.status(413).json({ error: 'Too many route details.' }); try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid route details.' }); } }
      if (body !== undefined && Buffer.byteLength(JSON.stringify(body)) > 16000) return res.status(413).json({ error: 'Too many route details.' });
      if (body?.action === 'search') {
        searching = true;
        let query; try { query = validateMapSearchQuery(body.query); } catch (error) { return res.status(400).json({ error: error.message }); }
        const key = JSON.stringify([account.id, query.toLocaleLowerCase('en')]);
        for (const [k, row] of searchCache) if (row.expires <= now()) searchCache.delete(k);
        let results = searchCache.get(key)?.results;
        if (!results) {
          const day = new Date(now()).toISOString().slice(0, 10);
          for (const [id, usage] of searchQuota) if (usage.day !== day) searchQuota.delete(id);
          const usage = searchQuota.get(account.id);
          if (searchBusy || now() - lastSearch < 1100 || (usage?.count ?? 0) >= 120 || (!usage && searchQuota.size >= 100)) {
            res.setHeader('Retry-After', '2');
            return res.status(429).json({ error: 'Map search limit reached. Wait before searching again, or enter coordinates.' });
          }
          searchBusy = true; lastSearch = now(); searchQuota.set(account.id, { day, count: (usage?.count ?? 0) + 1 });
          try { results = await search(query); } finally { searchBusy = false; }
          if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value);
          searchCache.set(key, { results, expires: now() + 3600_000 });
        }
        const current = await authenticate(req); if (!current || current.id !== account.id) return res.status(401).json({ error: 'Sign in again to view these map results.' });
        return res.status(200).json({ results });
      }
      let input; try { input = validateRouteRequest(body, { providerLimits: true }); } catch (error) { return res.status(400).json({ error: error.message }); }
      const key = JSON.stringify([account.id, input]);
      for (const [k, row] of cache) if (row.expires <= now()) cache.delete(k);
      let route = cache.get(key)?.route;
      if (!route) {
        const day = new Date(now()).toISOString().slice(0, 10); const usage = quota.get(account.id);
        if (busy || now() - lastRequest < 1100 || (usage?.day === day && usage.count >= 60)) { res.setHeader('Retry-After', '2'); return res.status(429).json({ error: 'Route service limit reached. Wait before another calculation, or use a saved route.' }); }
        busy = true; lastRequest = now(); quota.set(account.id, { day, count: usage?.day === day ? usage.count + 1 : 1 });
        try { route = await calculate(input); } finally { busy = false; }
        if (cache.size >= 30) cache.delete(cache.keys().next().value);
        cache.set(key, { route, expires: now() + 3600_000 });
      }
      const current = await authenticate(req); if (!current || current.id !== account.id) return res.status(401).json({ error: 'Sign in again to view this route.' });
      return res.status(200).json({ route });
    } catch (error) {
      if ([401, 403].includes(error.status)) return res.status(error.status).json({ error: 'Sign in on this site to calculate a private route.' });
      const failure = error instanceof RouteProviderError ? error : new RouteProviderError('unavailable');
      // Log only bounded error categories, never route coordinates, names, URLs or raw provider errors.
      reportFailure({ action: searching ? 'search' : 'route', code: failure.code, providerStatus: failure.providerStatus, providerCode: failure.providerCode });
      if (failure.status === 429) res.setHeader('Retry-After', '60');
      return res.status(searching ? 503 : failure.status).json({ error: searching ? 'Address search is unavailable. Try again shortly, or enter coordinates.' : failure.message });
    }
  };
}
export default createRoutingHandler();
