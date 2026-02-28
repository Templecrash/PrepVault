import { handleCors, getUser } from '../../_lib/auth-middleware.js';
import { supabaseAdmin } from '../../_lib/supabase.js';
import { getCached, setCache } from '../../_lib/cache.js';

/**
 * GET /api/smart-home/tactacam/cameras
 * Returns list of cameras with status, battery, signal, captures
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Check cache (5 min)
  const cacheKey = `tactacam_cameras_${user.id}`;
  const cached = getCached(cacheKey, 5 * 60 * 1000);
  if (cached) return res.status(200).json(cached);

  try {
    // Fetch stored token
    const { data: tokenData } = await supabaseAdmin
      .from('smart_home_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'tactacam')
      .single();

    if (!tokenData?.access_token) {
      return res.status(401).json({ error: 'Not connected to Tactacam. Please authenticate first.' });
    }

    // Fetch cameras from Tactacam API
    const camerasRes = await fetch('https://api.reveal.tactacam.com/v1/cameras', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!camerasRes.ok) {
      if (camerasRes.status === 401) {
        return res.status(401).json({ error: 'Tactacam session expired. Please re-authenticate.' });
      }
      throw new Error(`Tactacam API error: ${camerasRes.status}`);
    }

    const camerasData = await camerasRes.json();

    const cameras = (camerasData.cameras || camerasData || []).map(cam => ({
      id: cam.id || cam.cameraId,
      name: cam.name || cam.cameraName || 'Camera',
      model: cam.model || cam.cameraModel || 'Reveal',
      status: cam.online ? 'online' : 'offline',
      battery: cam.batteryPercent || cam.battery || 0,
      signal: Math.min(5, Math.ceil((cam.signalStrength || cam.signal || 0) / 20)),
      captures: cam.photoCount || cam.captures || 0,
      last: cam.lastPhoto?.description || cam.lastEvent || 'No recent activity',
      location: cam.location || cam.locationName || '',
      activity: (cam.recentPhotos || cam.events || []).slice(0, 3).map(e => ({
        t: new Date(e.timestamp || e.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        desc: e.description || e.type || 'Motion detected',
      })),
    }));

    const result = { cameras, fetchedAt: new Date().toISOString(), source: 'tactacam-live' };
    setCache(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Tactacam cameras error:', err);
    return res.status(502).json({ error: 'Failed to fetch cameras', detail: err.message });
  }
}
