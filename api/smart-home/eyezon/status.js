import { handleCors, getUser } from '../../_lib/auth-middleware.js';
import { supabaseAdmin } from '../../_lib/supabase.js';
import { getCached, setCache } from '../../_lib/cache.js';

/**
 * GET /api/smart-home/eyezon/status
 * Returns alarm status and zone states
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const cacheKey = `eyezon_status_${user.id}`;
  const cached = getCached(cacheKey, 2 * 60 * 1000); // 2 min cache
  if (cached) return res.status(200).json(cached);

  try {
    const { data: tokenData } = await supabaseAdmin
      .from('smart_home_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'eyezon')
      .single();

    if (!tokenData?.access_token) {
      return res.status(401).json({ error: 'Not connected to EyezOn' });
    }

    // Fetch partition/zone status from EyezOn
    const statusRes = await fetch('https://www.eyez-on.com/EZMOBILE/service.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'status',
        session: tokenData.access_token,
      }),
    });

    if (!statusRes.ok) {
      return res.status(502).json({ error: 'EyezOn status fetch failed' });
    }

    const statusData = await statusRes.text();

    // Parse EyezOn response (format varies by firmware version)
    // Return in standardized format
    const result = {
      provider: 'EyezOn',
      status: statusData.includes('Armed') ? (statusData.includes('Away') ? 'Armed (Away)' : 'Armed (Home)') : 'Disarmed',
      zones: [], // Parsed from statusData
      fetchedAt: new Date().toISOString(),
      source: 'eyezon-live',
    };

    // Try to parse zones from response
    try {
      const zoneMatches = statusData.matchAll(/zone["\s:=]+(\d+)[^}]*name["\s:=]+"([^"]+)"[^}]*status["\s:=]+"([^"]+)"/gi);
      for (const match of zoneMatches) {
        result.zones.push({ n: match[2], s: match[3].toLowerCase() });
      }
    } catch { /* zone parsing failed, return empty zones */ }

    setCache(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('EyezOn status error:', err);
    return res.status(502).json({ error: 'Failed to fetch alarm status', detail: err.message });
  }
}
