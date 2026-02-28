/**
 * Simple in-memory cache for serverless functions.
 * Persists across warm invocations on the same Vercel instance.
 * Falls back gracefully — cache miss just means a fresh API call.
 */
const cache = new Map();

export function getCached(key, maxAgeMs = 30 * 60 * 1000) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  // Prevent unbounded growth
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}
