import { handleCors, getUser } from '../../_lib/auth-middleware.js';
import { supabaseAdmin } from '../../_lib/supabase.js';

/**
 * POST /api/smart-home/tactacam/auth
 * Body: { email, password }
 * Authenticates with Tactacam Reveal API and stores token
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    // Tactacam Reveal API authentication
    // Note: Tactacam's API may change — this uses the known endpoints
    const authRes = await fetch('https://api.reveal.tactacam.com/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!authRes.ok) {
      const errData = await authRes.json().catch(() => ({}));
      return res.status(401).json({ error: errData.message || 'Tactacam authentication failed' });
    }

    const authData = await authRes.json();

    // Store token in smart_home_tokens table
    await supabaseAdmin.from('smart_home_tokens').upsert({
      user_id: user.id,
      provider: 'tactacam',
      access_token: authData.token || authData.accessToken,
      refresh_token: authData.refreshToken || null,
      email: email,
      expires_at: authData.expiresAt || new Date(Date.now() + 24 * 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

    return res.status(200).json({ success: true, email });
  } catch (err) {
    console.error('Tactacam auth error:', err);
    return res.status(502).json({ error: 'Failed to connect to Tactacam', detail: err.message });
  }
}
