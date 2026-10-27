import { authenticateNeonOwner, assertAuthOrigin } from './neon-owner-auth.js';
import { TrackingError } from './tracking-service.js';

// Retire the old guessed provider endpoints. In particular, no response from
// an HTML login page may ever be interpreted as an authenticated alarm state.
export default async function retiredSurveillance(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    assertAuthOrigin(req);
    if (!await authenticateNeonOwner(req)) return res.status(401).json({ error: 'Use private owner sign-in.', code: 'unauthorized' });
    return res.status(410).json({ error: 'Open Surveillance to manage your cameras and alarm connection.', code: 'moved' });
  } catch (error) {
    return res.status(error instanceof TrackingError ? error.status : 503).json({ error: 'Open Surveillance using private owner sign-in.', code: 'unavailable' });
  }
}
