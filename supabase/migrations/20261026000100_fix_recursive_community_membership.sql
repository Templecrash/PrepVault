-- Apply to an existing PrepVault Supabase database as the postgres role.
-- Prerequisite: the base PrepVault schema has already been installed.
-- Idempotent: replaces only the membership SELECT policy and its private helper.
-- No data is changed; membership INSERT/DELETE and other policies are untouched.
-- The helper derives identity from auth.uid(), never from a caller parameter.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#avoid-recursive-policies

BEGIN;

-- BEGIN PREPVAULT MEMBERSHIP RLS FIX
-- Keep this schema out of the Supabase Data API's exposed schemas.
CREATE SCHEMA IF NOT EXISTS prepvault_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA prepvault_private FROM PUBLIC, anon;
REVOKE CREATE ON SCHEMA prepvault_private FROM authenticated;
GRANT USAGE ON SCHEMA prepvault_private TO authenticated;

-- Run as the trusted owner to avoid re-entering community_members RLS.
-- No caller-supplied user ID: only the current JWT user's memberships are returned.
CREATE OR REPLACE FUNCTION prepvault_private.current_user_community_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT membership.community_id
  FROM public.community_members AS membership
  WHERE membership.user_id = (SELECT auth.uid());
$function$;
ALTER FUNCTION prepvault_private.current_user_community_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION prepvault_private.current_user_community_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prepvault_private.current_user_community_ids() TO authenticated;

DROP POLICY IF EXISTS "Members can read own community" ON public.community_members;
CREATE POLICY "Members can read own community" ON public.community_members
  FOR SELECT TO authenticated
  USING (community_id IN (SELECT prepvault_private.current_user_community_ids()));
-- END PREPVAULT MEMBERSHIP RLS FIX

COMMIT;
