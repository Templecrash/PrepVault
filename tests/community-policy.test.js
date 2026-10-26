import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261026000100_fix_recursive_community_membership.sql', import.meta.url), 'utf8');
const fixBlock = sql => sql.match(/-- BEGIN PREPVAULT MEMBERSHIP RLS FIX\n([\s\S]*?)\n-- END PREPVAULT MEMBERSHIP RLS FIX/)?.[1];

// Source guards complement a database RLS test; they do not execute PostgreSQL.
test('fresh schema and existing-database migration install the same membership rule', () => {
  assert.ok(fixBlock(schema));
  assert.equal(fixBlock(schema), fixBlock(migration));
  assert.match(migration, /\nBEGIN;[\s\S]*\nCOMMIT;/);
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS prepvault_private/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION/);
  assert.match(migration, /DROP POLICY IF EXISTS "Members can read own community"/);
});

test('membership helper is caller-scoped with trusted ownership and a fixed search path', () => {
  const helper = fixBlock(migration);
  assert.match(helper, /FUNCTION prepvault_private\.current_user_community_ids\(\)/);
  assert.match(helper, /RETURNS SETOF uuid\s+LANGUAGE sql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(helper, /FROM public\.community_members AS membership\s+WHERE membership\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(helper, /ALTER FUNCTION prepvault_private\.current_user_community_ids\(\) OWNER TO postgres/);
  assert.match(helper, /REVOKE ALL ON FUNCTION prepvault_private\.current_user_community_ids\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(helper, /GRANT EXECUTE ON FUNCTION prepvault_private\.current_user_community_ids\(\) TO authenticated/);
  assert.doesNotMatch(helper, /GRANT (?:ALL|CREATE).*TO (?:PUBLIC|anon|authenticated)/);
});

test('membership SELECT policy does not recursively read its protected table', () => {
  const policy = migration.match(/CREATE POLICY "Members can read own community"[\s\S]*?;/)?.[0];
  assert.ok(policy);
  assert.match(policy, /FOR SELECT TO authenticated/);
  assert.match(policy, /USING \(community_id IN \(SELECT prepvault_private\.current_user_community_ids\(\)\)\)/);
  assert.doesNotMatch(policy, /FROM (?:public\.)?community_members/);
  const allPolicies = migration.match(/(?:CREATE|DROP) POLICY[^;]*;/g);
  assert.equal(allPolicies.length, 2, 'the migration must only replace one policy');
  assert.doesNotMatch(migration, /(?:DISABLE ROW LEVEL SECURITY|BYPASSRLS|GRANT[^;]*(?:INSERT|UPDATE|DELETE))/i);
});
