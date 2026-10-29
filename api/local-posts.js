import process from 'node:process';
import { authenticateNeonOwner, assertAuthOrigin } from './_lib/neon-owner-auth.js';
import { briefingLocationKey } from './_lib/briefing-location.js';
import { fetchLocalPosts, LocalPostsError, localPostsToken, readLocalPostsQuery } from './_lib/local-posts.js';

const CACHE_MS = 10 * 60 * 1000;
const signedOut = () => new LocalPostsError(401, 'unauthorized', 'Sign in as the workspace owner to load X posts.');
const limited = () => new LocalPostsError(429, 'rate_limited', 'The local search limit has been reached. Wait ten minutes before loading another area.');

function queryFor(req) {
  if (req.query) return req.query;
  const params = new URL(req.url || '/api/local-posts', 'https://unused.invalid').searchParams;
  return Object.fromEntries([...new Set(params.keys())].map(key => [key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key)]));
}

export function createLocalPostsHandler({ env = process.env, authenticate = authenticateNeonOwner, fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map(); const pending = new Map();
  const searches = [];
  const token = localPostsToken(env);

  return async function localPostsHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Vary', 'Origin, Cookie');
    try {
      assertAuthOrigin(req);
      const owner = await authenticate(req);
      if (typeof owner?.id !== 'string' || !owner.id || owner.id.length > 512) throw signedOut();
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        throw new LocalPostsError(405, 'method_not_allowed', 'Use GET to check or load local posts.');
      }
      const { action, location } = readLocalPostsQuery(queryFor(req));
      if (action === 'status') return res.status(200).json({ configured: Boolean(token) });
      if (!token) throw new LocalPostsError(503, 'needs_connection', 'X search needs a server connection before posts can be loaded.');
      const time = now();
      for (const [key, value] of cache) if (value.expires <= time) cache.delete(key);
      while (searches.length && searches[0].time <= time - CACHE_MS) searches.shift();
      const key = JSON.stringify([owner.id, briefingLocationKey(location)]);
      let result = cache.get(key)?.data;
      if (!result) {
        let task = pending.get(key);
        if (!task) {
          // These bounds reduce accidental spend in one warm instance. They
          // are not a distributed budget; X's account spending limit is final.
          if (pending.size >= 4 || searches.length >= 20 || searches.filter(entry => entry.owner === owner.id).length >= 6) throw limited();
          searches.push({ owner: owner.id, time });
          task = fetchLocalPosts(location, { token, fetchImpl, now }).then(data => {
            // Cache the public source result before releasing the shared task,
            // avoiding a second charged call while owner revalidation waits.
            // Access to this owner-keyed entry still requires both auth checks.
            cache.set(key, { data, expires: now() + CACHE_MS });
            while (cache.size > 32) cache.delete(cache.keys().next().value);
            return data;
          });
          pending.set(key, task);
          // Both branches handle cleanup without creating an unobserved
          // rejecting promise when the upstream request fails.
          task.then(() => pending.delete(key), () => pending.delete(key));
        }
        result = await task;
      }
      // Revalidate even cached/coalesced responses so a session revoked while
      // waiting never receives a successful private response.
      const fresh = await authenticate(req);
      if (!fresh || fresh.id !== owner.id) throw signedOut();
      // Return the exact normalized tuple the current caller requested, even
      // when the cached key folded case for deduplication.
      return res.status(200).json({ ...result, location });
    } catch (error) {
      const known = error instanceof LocalPostsError;
      const authStatus = [401, 403].includes(error?.status) ? error.status : null;
      const status = known ? error.status : authStatus || 503;
      if (status === 429) res.setHeader('Retry-After', '600');
      return res.status(status).json({ code: known ? error.code : authStatus ? 'unauthorized' : 'unavailable',
        error: known ? error.message : authStatus ? 'Sign in on this site as the workspace owner.' : 'Local posts are temporarily unavailable. Try again later.' });
    }
  };
}

export default createLocalPostsHandler();
