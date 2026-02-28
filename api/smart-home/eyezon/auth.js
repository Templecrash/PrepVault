import { handleCors, getUser } from '../../_lib/auth-middleware.js';
import { supabaseAdmin } from '../../_lib/supabase.js';

/**
 * POST /api/smart-home/eyezon/auth
 * Body: { email, password }
 * Authenticates with EyezOn EnvisaLink API
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    // EyezOn API authentication
    const authRes = await fetch('https://www.eyez-on.com/EZMOBILE/service.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'login',
        user: email,
        password: password,
      }),
    });

    if (!authRes.ok) {
      return res.status(401).json({ error: 'EyezOn authentication failed' });
    }

    const authData = await authRes.text();
    // EyezOn returns session info — parse accordingly
    const sessionMatch = authData.match(/session["\s:=]+["']?([a-zA-Z0-9]+)/i);
    const sessionId = sessionMatch?.[1] || authData.trim();

    if (!sessionId || authData.toLowerCase().includes('error') || authData.toLowerCase().includes('invalid')) {
      return res.status(401).json({ error: 'Invalid EyezOn credentials' });
    }

    // Store session
    await supabaseAdmin.from('smart_home_tokens').upsert({
      user_id: user.id,
      provider: 'eyezon',
      access_token: sessionId,
      email: email,
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

    return res.status(200).json({ success: true, email });
  } catch (err) {
    console.error('EyezOn auth error:', err);
    return res.status(502).json({ error: 'Failed to connect to EyezOn', detail: err.message });
  }
}
