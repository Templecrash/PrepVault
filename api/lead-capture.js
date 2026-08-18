import { handleCors } from './_lib/auth-middleware.js';
import { supabaseAdmin } from './_lib/supabase.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/lead-capture
 * Body: { email }
 * Stores a lead-magnet email signup (e.g. Crisis Binder download) in the
 * lead_captures table. Writes only via the service role — no client access.
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Email capture is not configured yet' });
  }

  try {
    const { error } = await supabaseAdmin
      .from('lead_captures')
      .upsert({ email, source: 'crisis-binder' }, { onConflict: 'email', ignoreDuplicates: true });

    if (error) {
      console.error('Lead capture error:', error);
      return res.status(500).json({ error: 'Failed to save your email', detail: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Lead capture error:', err);
    return res.status(502).json({ error: 'Failed to save your email', detail: err.message });
  }
}
