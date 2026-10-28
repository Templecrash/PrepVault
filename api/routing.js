import { Buffer } from 'node:buffer';
import { authenticateNeonOwner, assertAuthOrigin } from './_lib/neon-owner-auth.js';
import { validateRouteRequest } from '../src/offline-route.js';
import { requestProviderRoute } from './_lib/route-provider.js';

export function createRoutingHandler({ authenticate = authenticateNeonOwner, calculate = requestProviderRoute, now = Date.now } = {}) {
  let busy = false; let lastRequest = 0; const cache = new Map(); const quota = new Map();
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      assertAuthOrigin(req);
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST to calculate a route.' });
      const owner = await authenticate(req); if (!owner) return res.status(401).json({ error: 'Sign in with your owner account to calculate private routes.' });
      if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') return res.status(400).json({ error: 'Send a small JSON route request.' });
      if (Number(req.headers['content-length']) > 16000) return res.status(413).json({ error: 'Too many route details.' });
      let body = req.body;
      if (Buffer.isBuffer(body)) body = body.toString('utf8');
      if (typeof body === 'string') { if (Buffer.byteLength(body) > 16000) return res.status(413).json({ error: 'Too many route details.' }); try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid route details.' }); } }
      if (body !== undefined && Buffer.byteLength(JSON.stringify(body)) > 16000) return res.status(413).json({ error: 'Too many route details.' });
      let input; try { input = validateRouteRequest(body); } catch (error) { return res.status(400).json({ error: error.message }); }
      const key = JSON.stringify([owner.id, input]);
      for (const [k, row] of cache) if (row.expires <= now()) cache.delete(k);
      let route = cache.get(key)?.route;
      if (!route) {
        const day = new Date(now()).toISOString().slice(0, 10); const usage = quota.get(owner.id);
        if (busy || now() - lastRequest < 1100 || (usage?.day === day && usage.count >= 60)) { res.setHeader('Retry-After', '2'); return res.status(429).json({ error: 'Route service limit reached. Wait before another calculation, or use a saved route.' }); }
        busy = true; lastRequest = now(); quota.set(owner.id, { day, count: usage?.day === day ? usage.count + 1 : 1 });
        try { route = await calculate(input); } finally { busy = false; }
        if (cache.size >= 30) cache.delete(cache.keys().next().value);
        cache.set(key, { route, expires: now() + 3600_000 });
      }
      const current = await authenticate(req); if (!current || current.id !== owner.id) return res.status(401).json({ error: 'Sign in again to view this route.' });
      return res.status(200).json({ route });
    } catch (error) { return res.status([401, 403].includes(error.status) ? error.status : 503).json({ error: [401, 403].includes(error.status) ? 'Sign in on this site to calculate a private route.' : 'The routing service could not find or return this route. Try shorter legs or fewer avoidance areas. Saved routes remain available.' }); }
  };
}
export default createRoutingHandler();
