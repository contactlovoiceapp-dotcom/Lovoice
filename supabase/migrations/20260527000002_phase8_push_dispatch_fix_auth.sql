-- Phase 8 — fix: simplify trigger auth to pass the auto-injected service_role JWT.
--
-- Root cause of the previous 401: the trigger read dispatch_push_service_key from Vault
-- and compared it as a raw string against SUPABASE_SERVICE_ROLE_KEY in the Edge Function.
-- Any whitespace/encoding difference between the Vault copy and the auto-injected env var
-- caused a mismatch.
--
-- New approach:
--   - The trigger reads ONLY the Edge Function URL from Vault.
--   - It authenticates using Supabase's own service_role JWT, auto-available via
--     current_setting('request.jwt.claims') is NOT available here, but the service_role
--     key IS available as a built-in GUC on Supabase Cloud via the extensions schema.
--     We use extensions.get_service_role_key() if available, or the SUPABASE_SERVICE_ROLE_KEY
--     Postgres setting. Actually simplest: read it from vault still (single secret now).
--
-- WAIT — simpler yet:
--   On Supabase Cloud, pg_net requests to Edge Functions that carry the service_role JWT
--   are validated by the Edge Runtime (signature check). The Edge Function now only reads
--   the decoded role claim (not a string comparison). So the trigger just needs to send
--   ANY valid service_role JWT — which we still read from Vault as dispatch_push_service_key.
--
-- After applying this migration, redeploy the Edge Function:
--   npx supabase functions deploy dispatch_push
--
-- The Vault secret dispatch_push_service_key is still used (and still correct).
-- The Vault secret dispatch_push_url is still needed.
-- No changes required to the Vault contents.

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
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'dispatch_push_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'dispatch_push_service_key'
  LIMIT 1;

  IF v_url IS NULL OR v_url = '' OR v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING
      'dispatch_push_notification: vault secrets not configured — skipping push for notification %',
      NEW.id;
    RETURN NEW;
  END IF;

  -- Trim any accidental whitespace that may have been introduced when the secret
  -- was stored in Vault (a common source of auth mismatches).
  v_service_key := trim(v_service_key);

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
  'asynchronously via pg_net. The service_role JWT is read from Vault and trimmed '
  'before use. The Edge Function validates the role claim (not a raw string comparison) '
  'so whitespace differences no longer cause 401s.';
