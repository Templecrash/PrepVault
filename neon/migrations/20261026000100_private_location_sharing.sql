-- Isolated tracking storage for an existing Neon Postgres database.
-- Run as a migration/admin role after inspecting the destination database.
-- The application runtime receives only schema USAGE and function EXECUTE;
-- provision its restricted login separately, following neon/README.md.
-- Owner IDs are trusted identity-provider subjects verified and allowlisted by the API.
-- This migration neither changes public tables nor provisions credentials or users.
-- Each session stores only its latest fix. Every call clears expired fixes.

BEGIN;

CREATE SCHEMA IF NOT EXISTS prepvault;
REVOKE ALL ON SCHEMA prepvault FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA prepvault REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA prepvault REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE IF NOT EXISTS prepvault.private_location_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL CHECK (char_length(owner_id) BETWEEN 1 AND 512),
  owner_name text NOT NULL CHECK (char_length(owner_name) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  invitation_hash text NOT NULL UNIQUE CHECK (invitation_hash ~ '^[0-9a-f]{64}$'),
  publisher_hash text UNIQUE CHECK (publisher_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'sharing', 'stopped', 'revoked')),
  lat double precision CHECK (lat BETWEEN -90 AND 90),
  lng double precision CHECK (lng BETWEEN -180 AND 180),
  accuracy double precision CHECK (accuracy BETWEEN 0 AND 1000000),
  captured_at timestamptz,
  last_fix_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (status = 'sharing' OR (lat IS NULL AND lng IS NULL AND accuracy IS NULL)),
  CHECK ((lat IS NULL AND lng IS NULL AND accuracy IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL AND accuracy IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS private_location_sessions_owner ON prepvault.private_location_sessions(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS private_location_sessions_expiring ON prepvault.private_location_sessions(expires_at)
  WHERE status IN ('invited', 'sharing');
ALTER TABLE prepvault.private_location_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON prepvault.private_location_sessions FROM PUBLIC;

CREATE OR REPLACE FUNCTION prepvault.prepvault_tracking_action(
  p_action text,
  p_owner_id text DEFAULT NULL,
  p_owner_name text DEFAULT NULL,
  p_token_hash text DEFAULT NULL,
  p_new_token_hash text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_accuracy double precision DEFAULT NULL,
  p_captured_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_row prepvault.private_location_sessions%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Expiry always wins over a subsequent claim or publish. Clear the position itself,
  -- not just the field displayed by the frontend. Every state transition is conditional.
  UPDATE prepvault.private_location_sessions
  SET status = 'stopped', lat = NULL, lng = NULL, accuracy = NULL,
      captured_at = NULL, last_fix_at = NULL, updated_at = v_now
  WHERE expires_at <= v_now AND status IN ('invited', 'sharing');

  IF p_action IN ('list', 'create', 'revoke') AND (p_owner_id IS NULL OR char_length(p_owner_id) NOT BETWEEN 1 AND 512) THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_action = 'list' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'phone', s.phone, 'status', s.status,
      'expiresAt', s.expires_at, 'updatedAt', coalesce(s.captured_at, s.updated_at),
      'lat', s.lat, 'lng', s.lng, 'accuracy', s.accuracy
    )), '[]'::jsonb) INTO v_result FROM (
      SELECT * FROM prepvault.private_location_sessions WHERE owner_id = p_owner_id
      ORDER BY (status IN ('invited', 'sharing')) DESC, created_at DESC LIMIT 100
    ) s;
    RETURN jsonb_build_object('sessions', v_result);
  ELSIF p_action = 'create' THEN
    IF p_duration_minutes NOT IN (60, 240, 1440) OR p_duration_minutes IS NULL
       OR p_new_token_hash IS NULL OR p_new_token_hash !~ '^[0-9a-f]{64}$' THEN
      RETURN jsonb_build_object('error', 'unavailable');
    END IF;
    -- Serialize capacity checks for this owner, including concurrent server instances.
    PERFORM pg_advisory_xact_lock(hashtextextended('prepvault.tracking:' || p_owner_id, 0));
    IF (SELECT count(*) FROM prepvault.private_location_sessions
        WHERE owner_id = p_owner_id AND status IN ('invited', 'sharing') AND expires_at > v_now) >= 25 THEN
      RETURN jsonb_build_object('error', 'session_limit');
    END IF;
    INSERT INTO prepvault.private_location_sessions(owner_id, owner_name, name, phone, invitation_hash, expires_at)
    VALUES (p_owner_id, p_owner_name, p_name, coalesce(p_phone, ''), p_new_token_hash,
            v_now + make_interval(mins => p_duration_minutes)) RETURNING * INTO v_row;
    RETURN jsonb_build_object('session', jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'phone', v_row.phone, 'status', v_row.status,
      'expiresAt', v_row.expires_at, 'updatedAt', v_row.updated_at, 'lat', NULL, 'lng', NULL, 'accuracy', NULL
    ));
  ELSIF p_action = 'revoke' THEN
    UPDATE prepvault.private_location_sessions SET status = 'revoked', lat = NULL, lng = NULL,
      accuracy = NULL, captured_at = NULL, last_fix_at = NULL, updated_at = v_now
    WHERE id = p_session_id AND owner_id = p_owner_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
    RETURN jsonb_build_object('ok', true);
  ELSIF p_action = 'inspect' THEN
    SELECT * INTO v_row FROM prepvault.private_location_sessions
    WHERE invitation_hash = p_token_hash OR publisher_hash = p_token_hash;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  ELSIF p_action = 'start' THEN
    IF p_new_token_hash IS NULL OR p_new_token_hash !~ '^[0-9a-f]{64}$' THEN
      RETURN jsonb_build_object('error', 'unavailable');
    END IF;
    UPDATE prepvault.private_location_sessions SET status = 'sharing', publisher_hash = p_new_token_hash, updated_at = v_now
    WHERE invitation_hash = p_token_hash AND status = 'invited' AND expires_at > v_now RETURNING * INTO v_row;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'unavailable'); END IF;
  ELSIF p_action = 'update' THEN
    IF p_lat IS NULL OR p_lng IS NULL OR p_accuracy IS NULL OR p_captured_at IS NULL
       OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180
       OR p_accuracy NOT BETWEEN 0 AND 1000000
       OR p_captured_at < v_now - interval '60 seconds' OR p_captured_at > v_now + interval '5 seconds' THEN
      RETURN jsonb_build_object('error', 'invalid_location');
    END IF;
    UPDATE prepvault.private_location_sessions SET lat = p_lat, lng = p_lng, accuracy = p_accuracy,
      captured_at = p_captured_at, last_fix_at = v_now, updated_at = v_now
    WHERE publisher_hash = p_token_hash AND status = 'sharing' AND expires_at > v_now
      AND (last_fix_at IS NULL OR last_fix_at <= v_now - interval '3 seconds')
      AND (captured_at IS NULL OR captured_at < p_captured_at)
    RETURNING * INTO v_row;
    IF FOUND THEN RETURN jsonb_build_object('updatedAt', v_row.updated_at); END IF;
    IF EXISTS (SELECT 1 FROM prepvault.private_location_sessions
      WHERE publisher_hash = p_token_hash AND status = 'sharing' AND expires_at > v_now) THEN
      RETURN jsonb_build_object('error', 'throttled');
    END IF;
    RETURN jsonb_build_object('error', 'unavailable');
  ELSIF p_action = 'stop' THEN
    UPDATE prepvault.private_location_sessions SET status = 'stopped', lat = NULL, lng = NULL,
      accuracy = NULL, captured_at = NULL, last_fix_at = NULL, updated_at = v_now
    WHERE publisher_hash = p_token_hash AND status = 'sharing' AND expires_at > v_now RETURNING * INTO v_row;
    IF NOT FOUND THEN
      SELECT * INTO v_row FROM prepvault.private_location_sessions
      WHERE publisher_hash = p_token_hash AND status IN ('stopped', 'revoked');
      IF NOT FOUND THEN RETURN jsonb_build_object('error', 'unavailable'); END IF;
    END IF;
    RETURN jsonb_build_object('ok', true);
  ELSE
    RETURN jsonb_build_object('error', 'unavailable');
  END IF;

  -- Token holders can inspect metadata but can never retrieve location coordinates.
  v_result := jsonb_build_object('name', v_row.name, 'ownerName', v_row.owner_name,
    'expiresAt', v_row.expires_at, 'status', v_row.status);
  IF p_action = 'start' THEN RETURN jsonb_build_object('session', v_result); END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION prepvault.prepvault_tracking_action(text, text, text, text, text, uuid, text, text, integer, double precision, double precision, double precision, timestamptz)
  FROM PUBLIC;

COMMIT;
