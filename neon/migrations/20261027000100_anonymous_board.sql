-- Anonymous public community board; deliberately separate from private workspace data.
-- Apply as migration owner. Grant runtime only schema USAGE + board_action EXECUTE.
BEGIN;
CREATE SCHEMA IF NOT EXISTS prepvault_board;
REVOKE ALL ON SCHEMA prepvault_board FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA prepvault_board REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA prepvault_board REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE IF NOT EXISTS prepvault_board.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES prepvault_board.messages(id),
  author_key text NOT NULL CHECK (author_key ~ '^[a-f0-9]{64}$'),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  body text NOT NULL CHECK (char_length(body) <= 4000),
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  region text NOT NULL DEFAULT '' CHECK (char_length(region) <= 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed','hidden')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (thread_id IS NULL OR char_length(body) <= 2000)
);
CREATE INDEX IF NOT EXISTS board_threads_recent ON prepvault_board.messages(created_at DESC,id DESC) WHERE thread_id IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS board_threads_region ON prepvault_board.messages(country,region,created_at DESC,id DESC) WHERE thread_id IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS board_replies_recent ON prepvault_board.messages(thread_id,created_at,id) WHERE thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS prepvault_board.reports (
  message_id uuid NOT NULL REFERENCES prepvault_board.messages(id),
  reporter_key text NOT NULL CHECK (reporter_key ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (reason IN ('spam','unsafe','personal','other')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  PRIMARY KEY (message_id, reporter_key)
);
CREATE INDEX IF NOT EXISTS board_reports_open ON prepvault_board.reports(message_id) WHERE resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS prepvault_board.rate_limits (
  key text NOT NULL CHECK (char_length(key) <= 100),
  bucket timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key,bucket)
);
CREATE INDEX IF NOT EXISTS board_rate_expiry ON prepvault_board.rate_limits(bucket);
ALTER TABLE prepvault_board.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepvault_board.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepvault_board.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA prepvault_board FROM PUBLIC;

CREATE OR REPLACE FUNCTION prepvault_board.board_action(
  p_action text, p_input jsonb, p_author_key text, p_network_key text, p_owner boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_id uuid;
  v_row prepvault_board.messages%ROWTYPE;
  v_root prepvault_board.messages%ROWTYPE;
  v_rows jsonb;
  v_thread jsonb;
  v_cursor jsonb := NULL;
  v_at timestamptz;
  v_cursor_id uuid;
  v_country text := coalesce(p_input->>'country','');
  v_region text := coalesce(p_input->>'region','');
  v_key text;
  v_bucket timestamptz;
  v_limit integer;
  v_hits integer;
  v_limits jsonb;
  v_limit_row jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('session','list','thread','create','reply','report','remove','moderation','moderate')
    OR p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
    OR p_author_key IS NULL OR p_author_key !~ '^[a-f0-9]{64}$'
    OR p_network_key IS NULL OR p_network_key !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error','invalid_request');
  END IF;
  IF p_action IN ('moderation','moderate') AND p_owner IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;
  -- Bounded shared DB counters serialize concurrent requests across API instances.
  -- Only keyed daily HMAC network identifiers are retained, never raw addresses.
  DELETE FROM prepvault_board.rate_limits WHERE bucket < v_now - interval '2 days';
  v_limits := jsonb_build_array(
    jsonb_build_array('read-net:' || p_network_key, 'minute', 300),
    jsonb_build_array('read-author:' || p_author_key, 'minute', 120)
  );
  IF p_action IN ('create','reply') THEN
    v_limits := v_limits || jsonb_build_array(
      jsonb_build_array('post-net:' || p_network_key, 'minute', 20),
      jsonb_build_array('post-author:' || p_author_key, 'minute', 6),
      jsonb_build_array('post-hour-net:' || p_network_key, 'hour', 120),
      jsonb_build_array('post-hour-author:' || p_author_key, 'hour', 40)
    );
  ELSIF p_action = 'report' THEN
    v_limits := v_limits || jsonb_build_array(
      jsonb_build_array('report-net:' || p_network_key, 'minute', 30),
      jsonb_build_array('report-author:' || p_author_key, 'minute', 10)
    );
  END IF;
  FOR v_limit_row IN SELECT value FROM jsonb_array_elements(v_limits) LOOP
    v_key := v_limit_row->>0;
    v_bucket := date_trunc(v_limit_row->>1,v_now);
    v_limit := (v_limit_row->>2)::integer;
    INSERT INTO prepvault_board.rate_limits(key,bucket,hits) VALUES(v_key,v_bucket,1)
      ON CONFLICT(key,bucket) DO UPDATE SET hits = least(prepvault_board.rate_limits.hits + 1,1000000)
      RETURNING hits INTO v_hits;
    IF v_hits > v_limit THEN RETURN jsonb_build_object('error','throttled'); END IF;
  END LOOP;

  IF p_input->'cursor' IS NOT NULL AND p_input->'cursor' <> 'null'::jsonb THEN
    BEGIN
      v_at := (p_input->'cursor'->>'at')::timestamptz;
      v_cursor_id := (p_input->'cursor'->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
      RETURN jsonb_build_object('error','invalid_request');
    END;
    IF v_at IS NULL OR v_cursor_id IS NULL THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
  END IF;
  IF p_action = 'session' THEN RETURN jsonb_build_object('ok',true); END IF;

  IF p_action = 'list' THEN
    IF (v_country <> '' AND v_country !~ '^[A-Z]{2}$') OR char_length(v_region) > 100 OR (v_country = '' AND v_region <> '') THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'title',m.title,'body',m.body,'country',m.country,'region',m.region,
      'alias','Neighbor ' || upper(substr(m.author_key,1,8)), 'createdAt',m.created_at,
      'replyCount',(SELECT count(*) FROM prepvault_board.messages r WHERE r.thread_id=m.id AND r.status='active'),
      'owned',m.author_key=p_author_key,'removed',false
    ) ORDER BY m.created_at DESC,m.id DESC),'[]'::jsonb) INTO v_rows FROM (
      SELECT * FROM prepvault_board.messages WHERE thread_id IS NULL AND status='active'
        AND (v_country='' OR country=v_country) AND (v_region='' OR region=v_region)
        AND (v_at IS NULL OR (created_at,id)<(v_at,v_cursor_id))
        ORDER BY created_at DESC,id DESC LIMIT 31
    ) m;
    IF jsonb_array_length(v_rows)>30 THEN v_rows:=v_rows-30; v_cursor:=jsonb_build_object('at',v_rows->29->>'createdAt','id',v_rows->29->>'id'); END IF;
    RETURN jsonb_build_object('threads',v_rows,'nextCursor',v_cursor);
  END IF;

  IF p_action = 'moderation' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'threadId',coalesce(m.thread_id,m.id),'title',m.title,'body',m.body,
      'country',m.country,'region',m.region,'alias','Neighbor ' || upper(substr(m.author_key,1,8)),
      'createdAt',m.created_at,'hidden',m.status='hidden',
      'reportCount',(SELECT count(*) FROM prepvault_board.reports r WHERE r.message_id=m.id AND r.resolved_at IS NULL),
      'reasons',(SELECT jsonb_agg(DISTINCT r.reason) FROM prepvault_board.reports r WHERE r.message_id=m.id AND r.resolved_at IS NULL)
    ) ORDER BY m.created_at DESC,m.id DESC),'[]'::jsonb) INTO v_rows FROM (
      SELECT m.* FROM prepvault_board.messages m WHERE EXISTS(SELECT 1 FROM prepvault_board.reports r WHERE r.message_id=m.id AND r.resolved_at IS NULL)
        AND (v_at IS NULL OR (m.created_at,m.id)<(v_at,v_cursor_id))
        ORDER BY m.created_at DESC,m.id DESC LIMIT 31
    ) m;
    IF jsonb_array_length(v_rows)>30 THEN v_rows:=v_rows-30; v_cursor:=jsonb_build_object('at',v_rows->29->>'createdAt','id',v_rows->29->>'id'); END IF;
    RETURN jsonb_build_object('reports',v_rows,'nextCursor',v_cursor);
  END IF;

  IF p_action = 'create' THEN
    IF jsonb_typeof(p_input->'title') IS DISTINCT FROM 'string' OR char_length(btrim(p_input->>'title')) NOT BETWEEN 1 AND 120
      OR jsonb_typeof(p_input->'body') IS DISTINCT FROM 'string' OR char_length(btrim(p_input->>'body')) NOT BETWEEN 1 AND 4000
      OR v_country !~ '^[A-Z]{2}$' OR char_length(v_region)>100 THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
    INSERT INTO prepvault_board.messages(author_key,title,body,country,region)
      VALUES(p_author_key,btrim(p_input->>'title'),btrim(p_input->>'body'),v_country,v_region) RETURNING id INTO v_id;
    RETURN jsonb_build_object('id',v_id);
  END IF;

  BEGIN v_id := coalesce(p_input->>'id',p_input->>'threadId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('error','invalid_request'); END;
  SELECT * INTO v_row FROM prepvault_board.messages WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  IF p_action = 'remove' THEN
    IF v_row.author_key <> p_author_key THEN RETURN jsonb_build_object('error','forbidden'); END IF;
    UPDATE prepvault_board.messages SET status='removed',body='',title=CASE WHEN thread_id IS NULL THEN 'Removed thread' ELSE '' END WHERE id=v_id;
    UPDATE prepvault_board.reports SET resolved_at=v_now WHERE message_id=v_id AND resolved_at IS NULL;
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action = 'moderate' THEN
    IF p_input->>'decision' NOT IN ('hide','dismiss') OR p_input->>'decision' IS NULL THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
    IF p_input->>'decision'='hide' THEN UPDATE prepvault_board.messages SET status='hidden' WHERE id=v_id; END IF;
    UPDATE prepvault_board.reports SET resolved_at=v_now WHERE message_id=v_id AND resolved_at IS NULL;
    RETURN jsonb_build_object('ok',true);
  END IF;

  IF v_row.thread_id IS NOT NULL THEN
    SELECT * INTO v_root FROM prepvault_board.messages WHERE id=v_row.thread_id;
    IF NOT FOUND OR v_root.status = 'hidden' THEN RETURN jsonb_build_object('error','not_found'); END IF;
  END IF;
  IF p_action = 'report' THEN
    IF v_row.status <> 'active' THEN RETURN jsonb_build_object('error','not_found'); END IF;
    IF p_input->>'reason' NOT IN ('spam','unsafe','personal','other') OR p_input->>'reason' IS NULL THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
    INSERT INTO prepvault_board.reports(message_id,reporter_key,reason) VALUES(v_id,p_author_key,p_input->>'reason') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok',true);
  END IF;
  IF v_row.thread_id IS NOT NULL OR v_row.status='hidden' THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF p_action = 'reply' THEN
    IF v_row.status <> 'active' THEN RETURN jsonb_build_object('error','not_found'); END IF;
    IF jsonb_typeof(p_input->'body') IS DISTINCT FROM 'string' OR char_length(btrim(p_input->>'body')) NOT BETWEEN 1 AND 2000 THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
    INSERT INTO prepvault_board.messages(thread_id,author_key,body,country,region)
      VALUES(v_id,p_author_key,btrim(p_input->>'body'),v_row.country,v_row.region) RETURNING id INTO v_id;
    RETURN jsonb_build_object('id',v_id);
  ELSIF p_action = 'thread' THEN
    v_thread := jsonb_build_object('id',v_row.id,'title',v_row.title,'body',v_row.body,'country',v_row.country,'region',v_row.region,
      'alias',CASE WHEN v_row.status='active' THEN 'Neighbor ' || upper(substr(v_row.author_key,1,8)) ELSE 'Anonymous' END,
      'createdAt',v_row.created_at,'owned',v_row.status='active' AND v_row.author_key=p_author_key,'removed',v_row.status<>'active',
      'replyCount',(SELECT count(*) FROM prepvault_board.messages WHERE thread_id=v_row.id AND status='active'));
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'body',CASE WHEN m.status='active' THEN m.body ELSE '' END,
      'alias',CASE WHEN m.status='active' THEN 'Neighbor ' || upper(substr(m.author_key,1,8)) ELSE 'Anonymous' END,
      'createdAt',m.created_at,'owned',m.status='active' AND m.author_key=p_author_key,'removed',m.status<>'active'
    ) ORDER BY m.created_at,m.id),'[]'::jsonb) INTO v_rows FROM (
      SELECT * FROM prepvault_board.messages WHERE thread_id=v_id
        AND (v_at IS NULL OR (created_at,id)>(v_at,v_cursor_id)) ORDER BY created_at,id LIMIT 31
    ) m;
    IF jsonb_array_length(v_rows)>30 THEN v_rows:=v_rows-30; v_cursor:=jsonb_build_object('at',v_rows->29->>'createdAt','id',v_rows->29->>'id'); END IF;
    RETURN jsonb_build_object('thread',v_thread,'replies',v_rows,'nextCursor',v_cursor);
  END IF;
  RETURN jsonb_build_object('error','invalid_request');
END;
$$;
REVOKE ALL ON FUNCTION prepvault_board.board_action(text,jsonb,text,text,boolean) FROM PUBLIC;
COMMENT ON FUNCTION prepvault_board.board_action(text,jsonb,text,text,boolean) IS 'Runtime-only anonymous board API. Identity keys and owner status are trusted server assertions, never browser inputs. Does not access private app schemas.';
COMMIT;
