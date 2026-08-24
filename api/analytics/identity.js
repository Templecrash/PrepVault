import { getUser, handleCors } from '../_lib/auth-middleware.js';

const INGEST_HOST = 'https://launchfury.com';

/**
 * Exchange an authenticated app user id for a signed LaunchFury analytics
 * identity token. The app user id is derived from the authenticated Supabase
 * session, never from the request body, and the token is the only value
 * returned to the browser.
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const serverKey = process.env.LAUNCHFURY_ANALYTICS_SERVER_KEY;
  if (!serverKey) {
    return res.status(500).json({ error: 'Analytics not configured' });
  }

  const user = await getUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const upstream = await fetch(`${INGEST_HOST}/api/analytics/identity`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${serverKey}`,
      },
      body: JSON.stringify({ user_id: user.id }),
    });

    if (upstream.status === 410) {
      return res.status(410).json({ error: 'Identity deleted' });
    }
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Identity exchange failed' });
    }

    const data = await upstream.json();
    return res.status(200).json({ token: data.token, expires_at: data.expires_at });
  } catch (err) {
    console.error('Analytics identity exchange error:', err.message);
    return res.status(502).json({ error: 'Identity exchange unavailable' });
  }
}
