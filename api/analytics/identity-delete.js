import { getUser, handleCors } from '../_lib/auth-middleware.js';

const INGEST_HOST = 'https://launchfury.com';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const serverKey = process.env.LAUNCHFURY_ANALYTICS_SERVER_KEY;
  if (!serverKey) return res.status(500).json({ error: 'Analytics identity service not configured' });

  try {
    const response = await fetch(`${INGEST_HOST}/api/analytics/identity/delete`, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${serverKey}`,
      },
      body: JSON.stringify({ user_id: user.id }),
    });

    if (!response.ok) throw new Error(`LaunchFury identity delete error: ${response.status}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Analytics identity delete error:', err);
    return res.status(502).json({ error: 'Failed to delete analytics identity' });
  }
}
