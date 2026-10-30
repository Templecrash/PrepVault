// The legacy Nest flow did not bind OAuth state to a verified user and its UI
// sent passwords to an OAuth redirect. Keep every old route fail-closed.
export default function retiredNest(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(410).json({
    error: 'Google Nest is not connected in PrepVault. Use Google Home to view or control your devices.',
    code: 'integration_unavailable',
  });
}
