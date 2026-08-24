import { getUser, handleCors } from '../_lib/auth-middleware.js';

const INGEST_HOST = 'https://launchfury.com';

/**
 * Delete the LaunchFury analytics identity link for an authenticated app user.
 * The app user id is derived from the authenticated Supabase session, never
 * from the request body. Safe to call from any account-deletion flow.
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'DELETE') {
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
    const upstream = await fetch(`${INGEST_HOST}/api/analytics/identity/delete`, {
      method: 'DELETE',
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
      return res.status(upstream.status).json({ error: 'Identity deletion failed' });
    }

    return res.status(204).end();
  } catch (err) {
    console.error('Analytics identity deletion error:', err.message);
    return res.status(502).json({ error: 'Identity deletion unavailable' });
  }
}
