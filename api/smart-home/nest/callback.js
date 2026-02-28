import { supabaseAdmin } from '../../_lib/supabase.js';

/**
 * GET /api/smart-home/nest/callback
 * OAuth callback handler for Google Nest
 * Exchanges authorization code for access + refresh tokens
 */
export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/?nest_error=' + encodeURIComponent(error));
  }

  if (!code) {
    return res.redirect('/?nest_error=no_code');
  }

  const clientId = process.env.GOOGLE_NEST_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_NEST_CLIENT_SECRET;
  const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/smart-home/nest/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errData = await tokenRes.json().catch(() => ({}));
      console.error('Nest token exchange error:', errData);
      return res.redirect('/?nest_error=token_exchange_failed');
    }

    const tokens = await tokenRes.json();

    // We need to identify the user — use the state parameter or JWT
    // For now, store with a pending state that the frontend will claim
    const pendingId = 'pending_' + Date.now();

    await supabaseAdmin.from('smart_home_tokens').insert({
      user_id: state || pendingId, // state should contain user_id
      provider: 'nest',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      email: 'google-nest',
      expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Redirect back to app with success
    return res.redirect('/?nest_connected=true');
  } catch (err) {
    console.error('Nest callback error:', err);
    return res.redirect('/?nest_error=' + encodeURIComponent(err.message));
  }
}
