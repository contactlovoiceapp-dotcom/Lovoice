-- Phase 9: server-side rate limits (Postgres buckets) and audit_log rows for user block/report actions.

-- ---------------------------------------------------------------------------
-- rate_limits table + consume_rate_limit (SECURITY DEFINER, UTC sliding windows)
-- ---------------------------------------------------------------------------

CREATE TABLE public.rate_limits (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (user_id, bucket, window_start)
);

COMMENT ON TABLE public.rate_limits IS
  'Per-user action counters keyed by UTC time windows; written only via consume_rate_limit().';

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_limit <= 0 OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'rate_limit.invalid_config' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (user_id, bucket, window_start, count)
  VALUES (p_user_id, p_bucket, v_window_start, 1)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  IF v_count > p_limit THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.consume_rate_limit(uuid, text, integer, integer) IS
  'Atomically increments a UTC window bucket and raises rate_limit_exceeded when over p_limit.';

REVOKE ALL ON FUNCTION public.consume_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(uuid, text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- likes: 100 / 1h — skip when the (liker_id, voice_id) pair already exists
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_like_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.likes
    WHERE liker_id = NEW.liker_id
      AND voice_id = NEW.voice_id
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.consume_rate_limit(NEW.liker_id, 'like', 100, 3600);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_like_rate_limit ON public.likes;

CREATE TRIGGER before_like_rate_limit
  BEFORE INSERT ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_like_rate_limit();

-- ---------------------------------------------------------------------------
-- reports: 20 / 24h
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_report_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.consume_rate_limit(NEW.reporter_id, 'report', 20, 86400);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_report_rate_limit ON public.reports;

CREATE TRIGGER before_report_rate_limit
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.check_report_rate_limit();

-- ---------------------------------------------------------------------------
-- audit_log: user.block + content.report (server-side, SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_user_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_kind, target_id, reason)
  VALUES (NEW.blocker_id, 'user.block', 'profile', NEW.blocked_id, NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_block_audit ON public.blocks;

CREATE TRIGGER after_block_audit
  AFTER INSERT ON public.blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_user_block();

CREATE OR REPLACE FUNCTION public.audit_content_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_kind text;
  v_target_id uuid;
BEGIN
  IF NEW.target_voice_id IS NOT NULL THEN
    v_target_kind := 'voice';
    v_target_id := NEW.target_voice_id;
  ELSIF NEW.target_message_id IS NOT NULL THEN
    v_target_kind := 'message';
    v_target_id := NEW.target_message_id;
  ELSE
    v_target_kind := 'profile';
    v_target_id := NEW.target_user_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, target_kind, target_id, reason)
  VALUES (NEW.reporter_id, 'content.report', v_target_kind, v_target_id, NEW.reason);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_report_audit ON public.reports;

CREATE TRIGGER after_report_audit
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_content_report();
