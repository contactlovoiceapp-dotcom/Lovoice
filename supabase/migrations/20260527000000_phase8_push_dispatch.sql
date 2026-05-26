-- Phase 8 Block 1: DB-level push dispatch via pg_net.
--
-- What this migration does:
--   1. Enables pg_net (async HTTP client for Postgres triggers).
--   2. Adds notifications.pushed_at timestamptz NULL — a diagnostic timestamp written by
--      dispatch_push (Edge Function, Block B2) on successful delivery. Also serves as the
--      debounce anchor for the post-v1 push throttling feature (not implemented in V1).
--   3. Creates the dispatch_push_notification() trigger function (SECURITY DEFINER).
--   4. Binds the trigger AFTER INSERT FOR EACH ROW on public.notifications.
--
-- Product decisions (V1 — deliberately simple):
--   - No debounce: every INSERT on notifications fires a push, regardless of kind or frequency.
--   - No presence skip: the trigger always fires; dispatch_push (Block B2) filters kind='system'.
--   - kind='like'    payload: { voice_id, like_id }              → deep-link /likes
--   - kind='message' payload: { message_id, conversation_id, kind } → deep-link /messages/<conversation_id>
--   Both payloads are confirmed correct from existing triggers:
--     • notify_on_like()    (Phase 6 — 20260521121000_phase6_likes_blocks_reports.sql)
--     • notify_on_message() (Phase 7 — 20260524000000_phase7_messaging_foundations.sql)
--   No fix needed on those trigger functions.
--
-- Runtime secrets (set by the operator AFTER deploying this migration — never committed):
--
--   Run from psql or Supabase Studio SQL Editor, substituting real values:
--
--     ALTER DATABASE postgres
--       SET "app.settings.dispatch_push_url" =
--           'https://<PROJECT_REF>.supabase.co/functions/v1/dispatch_push';
--
--     ALTER DATABASE postgres
--       SET "app.settings.dispatch_push_service_key" = '<SERVICE_ROLE_KEY>';
--
--   After each ALTER DATABASE, new DB sessions inherit the setting automatically.
--   Existing long-lived connections (e.g. pgbouncer pool) must reconnect or the operator
--   can call SELECT pg_reload_conf() to make most session-cached settings visible sooner.
--
--   If either setting is absent or empty at trigger execution time, the trigger logs a
--   RAISE WARNING and returns without pushing — the originating INSERT is never blocked.
--
-- Dependency:
--   Edge Function dispatch_push (Block B2) must be deployed and accept { notification_id }.
--   It reads the notification row + recipient's profiles.push_token and POSTs to Expo Push API.

-- ============================================================
-- 1. Enable pg_net (async HTTP from Postgres)
-- ============================================================

-- pg_net is pre-installed on Supabase Cloud. This is a no-op there.
-- On local supabase start it installs the extension if available.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 2. Add notifications.pushed_at + supporting index
-- ============================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

COMMENT ON COLUMN public.notifications.pushed_at IS
  'Set by the dispatch_push Edge Function when a push is successfully accepted by Expo. '
  'NULL means the push has not yet been dispatched. Used for diagnostic tracing and as '
  'the anchor for the post-v1 per-kind debounce feature (e.g. max 1 like push per hour).';

-- Partial index: efficient scan of un-dispatched notifications.
-- Supports future retry jobs and debounce queries without a full-table scan.
CREATE INDEX IF NOT EXISTS notifications_pushed_at_pending_idx
  ON public.notifications (created_at)
  WHERE pushed_at IS NULL;

-- ============================================================
-- 3. Trigger function: dispatch_push_notification()
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispatch_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url         text;
  v_service_key text;
BEGIN
  v_url         := current_setting('app.settings.dispatch_push_url', true);
  v_service_key := current_setting('app.settings.dispatch_push_service_key', true);

  -- Guard: skip silently if the operator has not set the runtime settings yet.
  -- This prevents a missing-config error from blocking notification INSERTs.
  IF v_url IS NULL OR v_url = '' OR v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING
      'dispatch_push_notification: app.settings not configured — skipping push for notification %',
      NEW.id;
    RETURN NEW;
  END IF;

  -- Fire-and-forget: pg_net enqueues the HTTP request and returns immediately.
  -- The INSERT on notifications is not blocked by network latency or Edge Function errors.
  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object('notification_id', NEW.id),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 10000
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Any failure (extension not ready, bad URL, pg_net internal error) is logged
    -- as a warning. The originating INSERT must always succeed.
    RAISE WARNING
      'dispatch_push_notification: dispatch failed for notification % — %',
      NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.dispatch_push_notification() IS
  'AFTER INSERT trigger on notifications. Calls the dispatch_push Edge Function '
  'asynchronously via pg_net for every new notification row. Failures are downgraded '
  'to warnings so they never block the originating INSERT. Reads the Edge Function URL '
  'and service key from database-level settings configured by the operator post-deploy.';

-- ============================================================
-- 4. Bind the trigger to notifications
-- ============================================================

DROP TRIGGER IF EXISTS dispatch_push_notification_trg ON public.notifications;

CREATE TRIGGER dispatch_push_notification_trg
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_push_notification();
