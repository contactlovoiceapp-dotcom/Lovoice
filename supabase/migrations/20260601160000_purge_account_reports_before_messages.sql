-- Fix: delete reports BEFORE the user's messages (and voices), not after.
--
-- Bug (reachable, breaks Apple 5.1.1(v) / GDPR account deletion):
--   reports.target_message_id has FK ON DELETE SET NULL, and reports carry a CHECK that at
--   least one of target_user_id / target_voice_id / target_message_id is non-null. A report
--   on a message sets ONLY target_message_id (see src/features/moderation/api/reportMutations.ts).
--   The previous version ran `DELETE FROM messages` BEFORE deleting reports, so the SET NULL
--   fired on such a report, nulled its sole target, violated the CHECK, and aborted the whole
--   purge. Result: any user whose message had ever been reported could not delete their account
--   (and the admin purge failed too).
--
-- Fix: move the `DELETE FROM reports` block ahead of `DELETE FROM messages` and `DELETE FROM
--   voices`. The `target_message_id IN (SELECT ... FROM messages ...)` and
--   `target_voice_id IN (SELECT ... FROM voices ...)` subqueries then resolve against rows that
--   still exist, so the offending reports are removed before any FK SET NULL can run.
--
-- Regression check (manual — no pgTAP harness in this repo):
--   1. User B sends a voice message in a conversation; user A reports that message
--      (reports row with only target_message_id set).
--   2. Call purge_account(B). It must succeed and leave no report referencing B's message.
--   Before this fix, step 2 raised the reports CHECK violation and rolled back.
--
-- Everything else is identical to 20260601140000 (skip-redundant-stub behaviour preserved).

CREATE OR REPLACE FUNCTION public.purge_account(p_user_id uuid)
RETURNS TABLE (voice_paths text[], message_paths text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tombstone     uuid := public.tombstone_user_id();
  v_stub          uuid;
  v_voice_paths   text[];
  v_message_paths text[];
  v_conv          record;
  v_other         uuid;
  v_new_a         uuid;
  v_new_b         uuid;
  v_repoint       boolean;
BEGIN
  IF p_user_id IS NULL OR p_user_id = v_tombstone THEN
    RAISE EXCEPTION 'purge.invalid_user' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(storage_path), '{}')
    INTO v_voice_paths
  FROM public.voices
  WHERE user_id = p_user_id;

  SELECT COALESCE(array_agg(voice_path), '{}')
    INTO v_message_paths
  FROM public.messages
  WHERE sender_id = p_user_id
    AND kind = 'voice'
    AND voice_path IS NOT NULL;

  -- Only create a stub when at least one live conversation still references p_user_id.
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE (c.user_a = p_user_id OR c.user_b = p_user_id)
      AND c.user_a <> v_tombstone
      AND c.user_b <> v_tombstone
  ) INTO v_repoint;

  IF v_repoint THEN
    v_stub := public.create_deleted_account_stub();

    FOR v_conv IN
      SELECT id, user_a, user_b, initiator_id, last_message_at
      FROM public.conversations
      WHERE user_a = p_user_id OR user_b = p_user_id
    LOOP
      v_other := CASE WHEN v_conv.user_a = p_user_id THEN v_conv.user_b ELSE v_conv.user_a END;

      IF v_other = v_tombstone THEN
        DELETE FROM public.conversations WHERE id = v_conv.id;
        CONTINUE;
      END IF;

      v_new_a := LEAST(v_stub, v_other);
      v_new_b := GREATEST(v_stub, v_other);

      UPDATE public.conversations
         SET user_a = v_new_a,
             user_b = v_new_b,
             initiator_id = CASE WHEN initiator_id = p_user_id THEN v_stub ELSE initiator_id END
       WHERE id = v_conv.id;
    END LOOP;
  END IF;

  -- Delete reports BEFORE messages and voices so the FK ON DELETE SET NULL never runs against
  -- a report whose sole target is being removed (which would violate the reports CHECK and
  -- abort the purge). The subqueries below require messages/voices rows to still exist.
  DELETE FROM public.reports
  WHERE reporter_id        = p_user_id
     OR target_user_id    = p_user_id
     OR target_voice_id   IN (SELECT id FROM public.voices   WHERE user_id   = p_user_id)
     OR target_message_id IN (SELECT id FROM public.messages WHERE sender_id = p_user_id);

  DELETE FROM public.messages WHERE sender_id = p_user_id;

  DELETE FROM public.likes         WHERE liker_id   = p_user_id;
  DELETE FROM public.notifications WHERE user_id    = p_user_id OR actor_id  = p_user_id;
  DELETE FROM public.blocks        WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  DELETE FROM public.feed_seen     WHERE user_id    = p_user_id;

  DELETE FROM public.voices WHERE user_id = p_user_id;

  UPDATE public.profiles
     SET deleted_at = COALESCE(deleted_at, now()),
         is_banned  = true,
         push_token = NULL
   WHERE id = p_user_id;

  RETURN QUERY SELECT v_voice_paths, v_message_paths;
END;
$$;

COMMENT ON FUNCTION public.purge_account(uuid) IS
  'Atomic GDPR purge. Deletes reports referencing the user''s content BEFORE messages/voices so '
  'the reports FK SET NULL never violates the at-least-one-target CHECK. Creates an anonymized '
  'stub only when conversations still reference the user; re-runs without open threads skip stub '
  'creation (no duplicate Compte supprimé). Idempotent. service_role only.';
