-- Phase 8 — fix: switch dispatch_push_notification() from current_setting (GUC)
-- to Supabase Vault for secret storage.
--
-- Background: ALTER DATABASE / ALTER ROLE for custom app.settings.* parameters
-- are denied on Supabase Cloud (requires superuser). Vault is the officially
-- supported alternative for storing secrets in the Postgres layer.
--
-- After applying this migration, run ONCE from the Supabase SQL Editor
-- (replacing the two placeholder values):
--
--   SELECT vault.create_secret(
--     'https://<PROJECT_REF>.supabase.co/functions/v1/dispatch_push',
--     'dispatch_push_url'
--   );
--
--   SELECT vault.create_secret(
--     '<SERVICE_ROLE_KEY>',
--     'dispatch_push_service_key'
--   );
--
-- <PROJECT_REF>       : Dashboard → Settings → General → Reference ID
-- <SERVICE_ROLE_KEY>  : Dashboard → Settings → API → Legacy keys → service_role JWT
--
-- To verify the secrets were stored:
--   SELECT name, created_at FROM vault.secrets;
--
-- To update a secret later:
--   SELECT vault.update_secret(id, '<NEW_VALUE>') FROM vault.secrets
--   WHERE name = 'dispatch_push_url';

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
  -- Read configuration from Supabase Vault.
  -- vault.decrypted_secrets is accessible to SECURITY DEFINER functions running
  -- as the postgres role, which is the owner of this function.
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'dispatch_push_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'dispatch_push_service_key'
  LIMIT 1;

  -- Guard: skip silently if the operator has not populated the vault yet.
  -- The originating INSERT is never blocked.
  IF v_url IS NULL OR v_url = '' OR v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING
      'dispatch_push_notification: vault secrets not configured — skipping push for notification %',
      NEW.id;
    RETURN NEW;
  END IF;

  -- Fire-and-forget: pg_net enqueues the HTTP request and returns immediately.
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
  'and service key from Supabase Vault (vault.decrypted_secrets).';
