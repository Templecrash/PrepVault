# Private tracking on Neon

This uses the existing Neon Postgres database. Inspect its schemas and tables first, then apply `migrations/20261026000100_private_location_sharing.sql` as a migration/admin role. The migration creates only the `prepvault` schema, its tracking table and its action function. It does not migrate, replace or read unrelated application data, create credentials, or depend on Supabase Auth.

## Separate the runtime from migrations

Provision a dedicated application login through the database's secure credential flow. It must not own the database, schema, table or function, have elevated role attributes, or inherit membership in the migration/admin role. Do not use the database owner's connection string in the deployed tracking API. Keep the login's connection string in a server-only environment variable; never use a `VITE_` variable, commit it, or send it to the browser.

For a login named `prepvault_tracking_api`, grant exactly the following after the migration. Substitute the actual provisioned role name if different:

```sql
GRANT USAGE ON SCHEMA prepvault TO prepvault_tracking_api;
GRANT EXECUTE ON FUNCTION prepvault.prepvault_tracking_action(
  text, text, text, text, text, uuid, text, text, integer,
  double precision, double precision, double precision, timestamptz
) TO prepvault_tracking_api;
```

No table grants are needed. The fixed action function runs with its migration owner's privileges and an empty search path. Table row-level security is enabled, public access is revoked, and the runtime cannot select or change the table directly. On a shared existing database, also inspect inherited and `PUBLIC` privileges on unrelated schemas: granting the two permissions above does not revoke permissions the login already receives elsewhere. Revoke unnecessary privileges from the new role without changing other applications' access.

Verify with the runtime connection that calling the action function succeeds and direct table access fails. `tests/neon-tracking-database.test.js` executes this migration in Postgres-compatible PGlite and checks restricted-role access, isolation from unrelated data, owner scoping, one-time claims, stop/revoke, expiry and valid recent fixes.

## Identity and capabilities

Set `TRACKING_DATABASE_URL` to the restricted runtime connection. Configure `NEON_AUTH_BASE_URL`, a random `NEON_AUTH_COOKIE_SECRET` of at least 32 characters, and `TRACKING_OWNER_EMAIL` as server-only environment variables. `TRACKING_OWNER_ID` optionally pins the verified user subject as an additional check. Configure the exact application origin in Neon's trusted domains; do not allow all Vercel domains.

The `/api/auth/*` rewrite routes to a narrow first-party proxy: email OTP send/sign-in, session lookup and sign-out only. Password sign-up, user changes and arbitrary upstream paths are unavailable through this app. Every tracking owner request revalidates the opaque session with Neon and requires its verified email to match the configured owner. OTP login is the only browser sign-in flow and no authentication token is kept in local storage. Neon handles code delivery, expiry and rate limiting.

The API must verify the owner's managed authentication session and restrict it to the configured owner before calling `list`, `create` or `revoke`. Pass its verified opaque identity subject as `p_owner_id`; never accept an owner ID from a request body. Database owner IDs are text so they support managed identity providers without UUID coercion. Authentication and the owner allowlist are server responsibilities: the database connection itself is trusted to call the function for the authenticated owner.

Recipient actions use one-time invitation tokens and separate publisher tokens. Only SHA-256 hashes enter the database. Recipients can publish their own latest fix and stop sharing; they cannot read any positions. A phone number addresses the invitation and does not locate a device. The recipient page and its API must be reachable without the owner's Vercel session, while owner actions remain protected by application authentication.

## Retention

Each session keeps at most its latest position. Stop and revocation erase it immediately; every action also clears positions whose sharing window has expired. This request-time cleanup does not execute while the application is idle. If physical deletion at expiry is required during idle periods, schedule the following with a separately privileged maintenance connection. Never grant maintenance access to the browser or the tracking runtime:

```sql
UPDATE prepvault.private_location_sessions
SET status = 'stopped', lat = NULL, lng = NULL, accuracy = NULL,
    captured_at = NULL, last_fix_at = NULL, updated_at = now()
WHERE expires_at <= now() AND status IN ('invited', 'sharing');

DELETE FROM prepvault.private_location_sessions
WHERE expires_at < now() - interval '7 days';
```

The database provider's own backup retention is separate from these live-table operations.
