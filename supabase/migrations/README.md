# Existing database updates

For an existing PrepVault database, run `20261026000100_fix_recursive_community_membership.sql` in the project's Supabase SQL Editor as the `postgres` role, or apply it through the project's normal migration process after reviewing the SQL. No remote database changes are performed by the application or this repository update. The base schema must already exist. The migration is transactional and safe to run again.

New databases receive the same fix from `supabase-schema.sql`; do not rerun that whole bootstrap file on an existing database because its other policy/index declarations are not idempotent.

This resolves the membership policy querying its own protected table. A private, stable function returns only membership IDs belonging to `auth.uid()`. It has no user-ID argument, uses an empty search path and schema-qualified names, and is owned by the trusted `postgres` role. Only `authenticated` receives execute permission. The replacement SELECT policy still lets members see the roster of communities they belong to. Membership insert/delete rules and all other policies remain unchanged.

Keep `prepvault_private` out of the Data API's exposed schemas. Apply as `postgres` so the helper has the intended trusted owner and can bypass the recursive table policy. Do not grant ownership of the helper/schema or CREATE on that schema to application roles.

Run `npm test` for source regression checks. Those checks confirm the security-critical SQL structure and that new/existing installs match; they do not execute PostgreSQL. After applying on a local or staging database, verify with separate authenticated member and nonmember accounts: a member can read their community's roster and messages, a nonmember cannot, unauthenticated requests return no rows, and submitting another user's ID cannot create a membership or message. Verify these authorization cases before production rollout.

The approach follows [Supabase's recursive-policy guidance](https://supabase.com/docs/guides/database/postgres/row-level-security#avoid-recursive-policies) and [function security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

## Private location sharing

Apply `20261026000200_private_location_sharing.sql` as the trusted `postgres` role to the same Supabase project used for the app's login. Both new and existing databases need this migration. It creates a separate, server-only location store; community membership does not grant access to it. Do not grant browser roles table or RPC permissions.

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the frontend's cloud login, and `SUPABASE_URL` (or the same `VITE_SUPABASE_URL`) plus **server-only** `SUPABASE_SERVICE_ROLE_KEY` for the Vercel function. Never prefix the service-role key with `VITE_`. Rebuild the preview after changing frontend variables. Local-only accounts cannot use private remote tracking. Missing configuration or migration returns a clear 503 rather than a simulated successful share.

In Your people → Tracker, sign in and create a named invitation with an international phone number. Copy it or open the phone's text-message composer; the app does not send SMS automatically. The recipient opens `/share-location#token=…`, explicitly allows GPS, and shares only their latest fix. Claiming exchanges the one-use invitation for a publish-only token. The owner can see positions from their own invitations only, polling every 10 seconds. Stop, revoke and expiry prevent further publication. Closed/backgrounded mobile pages may stop delivering updates; the tracker labels older fixes and hides positions older than five minutes.

The server clears expired coordinates on subsequent tracking requests. The migration includes SQL for optional scheduled cleanup of idle sessions and removal of old invitation metadata. Configure that cleanup in the database scheduler if physical erasure during idle periods is required. Positions are not written to household backups or localStorage; publisher credentials stay in the recipient tab's sessionStorage.

`npm test` now executes this migration in PGlite PostgreSQL and checks database grants, owner isolation, claim/stop/revoke/expiry, stale fixes, and capacity limits, alongside HTTP authentication/validation and browser GPS lifecycle tests. Before enabling the hosted feature, verify it with two consenting devices against the configured Supabase project. Preview deployment alone does not apply SQL or provision credentials.
