import { handleCors, getUser } from '../../_lib/auth-middleware.js';
import { supabaseAdmin } from '../../_lib/supabase.js';
import { getCached, setCache } from '../../_lib/cache.js';

/**
 * GET /api/smart-home/nest/devices
 * Returns Nest device status (locks, thermostats, smoke detectors)
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const cacheKey = `nest_devices_${user.id}`;
  const cached = getCached(cacheKey, 2 * 60 * 1000);
  if (cached) return res.status(200).json(cached);

  try {
    const { data: tokenData } = await supabaseAdmin
      .from('smart_home_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'nest')
      .single();

    if (!tokenData?.access_token) {
      return res.status(401).json({ error: 'Not connected to Google Nest' });
    }

    // Check if token needs refresh
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      // Refresh token
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_NEST_CLIENT_ID,
          client_secret: process.env.GOOGLE_NEST_CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (refreshRes.ok) {
        const newTokens = await refreshRes.json();
        accessToken = newTokens.access_token;
        await supabaseAdmin.from('smart_home_tokens').update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id).eq('provider', 'nest');
      } else {
        return res.status(401).json({ error: 'Nest token expired. Please re-authenticate.' });
      }
    }

    // Fetch devices from Smart Device Management API
    const projectId = process.env.GOOGLE_NEST_PROJECT_ID;
    const devicesRes = await fetch(`https://smartdevicemanagement.googleapis.com/v1/enterprises/${projectId}/devices`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!devicesRes.ok) {
      if (devicesRes.status === 401) {
        return res.status(401).json({ error: 'Nest session expired' });
      }
      throw new Error(`Nest API error: ${devicesRes.status}`);
    }

    const devicesData = await devicesRes.json();

    const devices = (devicesData.devices || []).map(device => {
      const traits = device.traits || {};
      const type = device.type || '';

      if (type.includes('LOCK')) {
        return {
          n: device.parentRelations?.[0]?.displayName || traits['sdm.devices.traits.Info']?.customName || 'Lock',
          type: 'lock',
          status: traits['sdm.devices.traits.LockUnlock']?.lockedState === 'LOCKED' ? 'Locked' : 'Unlocked',
          bat: 'Good',
        };
      }
      if (type.includes('THERMOSTAT')) {
        const tempC = traits['sdm.devices.traits.Temperature']?.ambientTemperatureCelsius;
        const tempF = tempC ? Math.round(tempC * 9/5 + 32) + '°F' : 'N/A';
        const setC = traits['sdm.devices.traits.ThermostatTemperatureSetpoint']?.heatCelsius;
        const setF = setC ? Math.round(setC * 9/5 + 32) + '°F' : 'N/A';
        const humidity = traits['sdm.devices.traits.Humidity']?.ambientHumidityPercent;
        return {
          n: device.parentRelations?.[0]?.displayName || 'Thermostat',
          type: 'thermo',
          temp: tempF,
          set: setF,
          hum: humidity ? humidity + '%' : 'N/A',
          mode: traits['sdm.devices.traits.ThermostatMode']?.mode || 'Heat',
        };
      }
      if (type.includes('SMOKE') || type.includes('CO')) {
        return {
          n: device.parentRelations?.[0]?.displayName || 'Protect',
          type: 'smoke',
          bat: 'Good',
          co: traits['sdm.devices.traits.CarbonMonoxideLevel']?.coLevel || '0ppm',
        };
      }
      // Generic device
      return {
        n: device.parentRelations?.[0]?.displayName || 'Device',
        type: 'other',
        status: traits['sdm.devices.traits.Connectivity']?.status || 'Unknown',
      };
    });

    const result = { devices, fetchedAt: new Date().toISOString(), source: 'nest-live' };
    setCache(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Nest devices error:', err);
    return res.status(502).json({ error: 'Failed to fetch Nest devices', detail: err.message });
  }
}
