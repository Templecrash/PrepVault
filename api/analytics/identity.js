import { getUser, handleCors } from '../_lib/auth-middleware.js';

const INGEST_HOST = 'https://launchfury.com';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const serverKey = process.env.LAUNCHFURY_ANALYTICS_SERVER_KEY;
  if (!serverKey) return res.status(500).json({ error: 'Analytics identity service not configured' });

  try {
    const response = await fetch(`${INGEST_HOST}/api/analytics/identity`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${serverKey}`,
      },
      body: JSON.stringify({ user_id: user.id }),
    });

    if (response.status === 410) return res.status(410).json({ error: 'Analytics identity has been deleted' });
    if (!response.ok) throw new Error(`LaunchFury identity error: ${response.status}`);

    const { token } = await response.json();
    if (!token) return res.status(502).json({ error: 'No identity token returned' });
    return res.status(200).json({ token });
  } catch (err) {
    console.error('Analytics identity error:', err);
    return res.status(502).json({ error: 'Failed to connect analytics identity' });
  }
}
