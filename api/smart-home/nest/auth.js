import { handleCors } from '../../_lib/auth-middleware.js';

/**
 * GET /api/smart-home/nest/auth
 * Redirects to Google OAuth consent screen for Nest Device Access
 * Requires: GOOGLE_NEST_CLIENT_ID env var
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const clientId = process.env.GOOGLE_NEST_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google Nest client ID not configured' });
  }

  const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/smart-home/nest/callback`;
  const projectId = process.env.GOOGLE_NEST_PROJECT_ID || '';

  const scopes = [
    'https://www.googleapis.com/auth/sdm.service',
  ].join(' ');

  const authUrl = `https://nestservices.google.com/partnerconnections/${projectId}/auth?` +
    `redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&client_id=${clientId}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}`;

  return res.redirect(302, authUrl);
}
