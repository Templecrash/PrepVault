# Existing database updates

For an existing PrepVault database, run `20261026000100_fix_recursive_community_membership.sql` in the project's Supabase SQL Editor as the `postgres` role, or apply it through the project's normal migration process after reviewing the SQL. No remote database changes are performed by the application or this repository update. The base schema must already exist. The migration is transactional and safe to run again.

New databases receive the same fix from `supabase-schema.sql`; do not rerun that whole bootstrap file on an existing database because its other policy/index declarations are not idempotent.

This resolves the membership policy querying its own protected table. A private, stable function returns only membership IDs belonging to `auth.uid()`. It has no user-ID argument, uses an empty search path and schema-qualified names, and is owned by the trusted `postgres` role. Only `authenticated` receives execute permission. The replacement SELECT policy still lets members see the roster of communities they belong to. Membership insert/delete rules and all other policies remain unchanged.

Keep `prepvault_private` out of the Data API's exposed schemas. Apply as `postgres` so the helper has the intended trusted owner and can bypass the recursive table policy. Do not grant ownership of the helper/schema or CREATE on that schema to application roles.

Run `npm test` for source regression checks. Those checks confirm the security-critical SQL structure and that new/existing installs match; they do not execute PostgreSQL. After applying on a local or staging database, verify with separate authenticated member and nonmember accounts: a member can read their community's roster and messages, a nonmember cannot, unauthenticated requests return no rows, and submitting another user's ID cannot create a membership or message. Verify these authorization cases before production rollout.

The approach follows [Supabase's recursive-policy guidance](https://supabase.com/docs/guides/database/postgres/row-level-security#avoid-recursive-policies) and [function security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).
