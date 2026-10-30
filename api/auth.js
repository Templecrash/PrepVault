import { createNeonOwnerAuth } from './_lib/neon-owner-auth.js';

// Vercel rewrite: /api/auth/:path* -> /api/auth?path=:path*
export default function auth(req, res) {
  return createNeonOwnerAuth().handle(req, res);
}
