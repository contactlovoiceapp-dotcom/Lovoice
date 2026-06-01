-- Idempotent purge: do not mint a new "Compte supprimé" stub when there is nothing to repoint.
-- Fixes admin "Finaliser la suppression" creating duplicate stub profiles on re-run.

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

  DELETE FROM public.messages WHERE sender_id = p_user_id;

  DELETE FROM public.reports
  WHERE reporter_id        = p_user_id
     OR target_user_id    = p_user_id
     OR target_voice_id   IN (SELECT id FROM public.voices   WHERE user_id   = p_user_id)
     OR target_message_id IN (SELECT id FROM public.messages WHERE sender_id = p_user_id);

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
  'Atomic GDPR purge. Creates an anonymized stub only when conversations still reference '
  'the user; re-runs without open threads skip stub creation (no duplicate Compte supprimé).';
