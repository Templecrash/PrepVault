// Public weather/news reads do not depend on legacy Supabase authentication.
export function handlePublicFeedRequest(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Use GET for this feed.', code: 'method_not_allowed' });
    return true;
  }
  return false;
}

export function readFeedCoordinates(query, required = false) {
  const hasLat = query.lat !== undefined;
  const hasLng = query.lng !== undefined;
  if (!hasLat && !hasLng && !required) return null;
  if (!hasLat || !hasLng || typeof query.lat !== 'string' || typeof query.lng !== 'string' || !query.lat.trim() || !query.lng.trim()) throw new Error('Provide a valid latitude and longitude.');
  const lat = Number(query.lat); const lng = Number(query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Provide a valid latitude and longitude.');
  return { lat, lng };
}
