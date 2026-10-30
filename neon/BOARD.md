# Anonymous community board

Apply `migrations/20261027000100_anonymous_board.sql` as the migration owner, first on an isolated branch. It creates only `prepvault_board` tables, indexes and its action function. Existing application and authentication schemas remain unchanged. This is an additive migration and can be reapplied.

Create a restricted SQL login (not a Neon API-created role, which may inherit `neon_superuser`). It needs no role memberships, table privileges, database creation, role creation or RLS bypass. Keep its password in a server-only environment secret. Grant only:

```sql
GRANT USAGE ON SCHEMA prepvault_board TO prepvault_board_runtime;
GRANT EXECUTE ON FUNCTION prepvault_board.board_action(text,jsonb,text,text,boolean)
  TO prepvault_board_runtime;
```

Set `BOARD_DATABASE_URL` to that login's pooled connection string and `BOARD_COOKIE_SECRET` to an independent random secret of 32 or more characters. The public API must never use the tracking or database-owner connection. Verify both that the action function works and that direct access to messages and private tracking tables is denied. The function uses a fixed empty search path, RLS-enabled tables and explicit public-safe response fields. Inputs use bound SQL values. Its identity keys and moderator boolean are trusted server assertions, never accepted from the browser.

The test branch `dev-prepvault-board-20261027` expires on 2026-11-03. Its branch-specific Vercel preview environment and ignored `.env.board.local` use separate credentials; recreate the isolated branch and update those values before further testing after expiration. Production uses the existing `blueprint-db` main branch with its separate restricted role. No test conversations are inserted into production.

## Identity and privacy

No registration, display name, phone, email or precise location is collected for posting. A signed random host-only HttpOnly/Secure/SameSite=Strict cookie lasts 30 days. A purpose-specific HMAC derives the browser's author key and public `Neighbor` alias. Neither the cookie nor the full author key is returned in JSON. The same browser can remove its own posts while the cookie remains valid. Expiry, clearing cookies or changing the signing secret ends that control; this is disclosed in the UI. This is pseudonymous public communication, not a promise of network-level untraceability.

Country/region choices and post text are public. Posts stay until removed by their browser owner or hidden by the host. Removal clears that post's body and title and leaves a tombstone; other people's replies remain visible through an existing thread view. Hiding a root conversation prevents public access to it and its replies. Moderator-hidden contents remain available to the database owner; they are not public. Provider backups and operational logs have their own retention. Do not log request bodies, cookies or full network addresses in application code.

Anonymous reports are idempotent per message/browser. Reports do not automatically hide content, preventing vote brigading. The verified workspace owner can review reported text and hide posts or dismiss reports; reporter identifiers are not returned. All moderation actions revalidate the existing Neon owner session and owner allowlist.

## Abuse limits

Shared atomic database counters enforce 300 requests/network/minute and 120/browser/minute. Posts and replies share limits of 20/network/minute, 6/browser/minute, 120/network/hour and 40/browser/hour. Reports allow 30/network/minute and 10/browser/minute. Network identifiers are daily HMACs of Vercel's trusted client IP header, with IPv6 grouped by /64; raw addresses are not stored in the board tables. Counter rows older than two days are deleted during subsequent requests; provider log/backup retention is separate. Cookie resets do not reset the daily network bucket.

The API enforces same-origin JSON, bounded bodies/text, valid country/region combinations, UUIDs and bounded pagination. It fails closed if storage, signing configuration or required owner authentication is unavailable. There is no file upload or notification delivery. These controls limit ordinary abuse; the host should monitor reports and platform usage as the public board grows.

## Verification

`tests/board-api.test.js`, `tests/board-database.test.js` and `tests/message-board.test.js` cover signed/expired/ambiguous cookies, origin enforcement, invalid regions and text, owner isolation, restricted DB privileges, reports, removed-thread replies, concurrent rate limits, pagination and exclusion of private app fields from transport. Browser tests use an isolated Neon branch and two anonymous visitors; production validation reads the empty public board and checks owner moderation without seeding public test posts.
